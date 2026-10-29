const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Enable Cross-Origin Resource Sharing (allows frontend to make API calls)
app.use(cors());

// Enable parsing of JSON body data
app.use(express.json());

// Serve static frontend files (HTML, CSS, JS) directly from Express
app.use(express.static(path.join(__dirname, '../frontend')));

// -------------------------------------------------------------
// In-Memory Data Stores
// -------------------------------------------------------------

// Legacy data structure for existing /api/recommendation compatibility
let latestData = {
  roomTemperature: null,
  recommendedAcTemperature: null,
  humidity: null,
  lastUpdated: null,
  lastReceivedTimestamp: null
};

// Rooms list: Primary room receives live data from ESP32
let rooms = [
  {
    id: 'room-primary',
    name: 'Living Room',
    isPrimary: true,
    dataType: 'Live Data',
    temperature: null,
    humidity: null,
    recommendedAcTemperature: null,
    lastUpdated: 'Waiting for ESP32...',
    isConnected: false
  }
];

// -------------------------------------------------------------
// Threshold-Based Recommendation Logic with Humidity Consideration
// -------------------------------------------------------------
function getRecommendedAcTemp(roomTemp, humidity) {
  if (roomTemp === null || roomTemp === undefined || isNaN(roomTemp)) {
    return null;
  }

  // 1. Baseline AC Recommendation based on room temperature
  let baseAcTemp;
  if (roomTemp >= 35) {
    baseAcTemp = 22; // Very hot -> Cool setting
  } else if (roomTemp >= 30) {
    baseAcTemp = 24; // Hot -> Moderate cool setting
  } else if (roomTemp >= 27) {
    baseAcTemp = 25; // Warm -> Standard comfortable setting
  } else {
    baseAcTemp = 26; // Mild/Cool -> Energy-saving setting
  }

  // 2. Humidity Adjustment:
  // When relative humidity is high (>= 60% RH), natural sweat evaporation slows down,
  // making the air feel muggier and hotter (Heat Index effect).
  // In high humidity, lower AC by 1°C to enhance cooling and dehumidification.
  if (humidity !== null && humidity !== undefined && !isNaN(humidity)) {
    if (humidity >= 60) {
      return Math.max(21, baseAcTemp - 1); // Drop by 1°C, minimum bound 21°C
    }
  }

  return baseAcTemp;
}

// -------------------------------------------------------------
// 1. ESP32 Ingestion Endpoint: POST /api/temperature
// (Kept 100% backward-compatible with existing ESP32 firmware)
// -------------------------------------------------------------
app.post('/api/temperature', (req, res) => {
  const { temperature, humidity } = req.body;

  // Validate temperature
  if (temperature === undefined || temperature === null || isNaN(temperature)) {
    return res.status(400).json({
      error: 'Invalid temperature data received. Value must be a valid number.'
    });
  }

  const roomTemp = parseFloat(temperature);
  const humValue = (humidity !== undefined && humidity !== null && !isNaN(humidity))
    ? parseFloat(humidity)
    : null;

  // Calculate recommendation using both room temperature and actual humidity
  const recommendedAc = getRecommendedAcTemp(roomTemp, humValue);

  const now = new Date();
  const timeString = now.toLocaleTimeString();

  // 1. Update legacy object for /api/recommendation
  latestData = {
    roomTemperature: roomTemp,
    recommendedAcTemperature: recommendedAc,
    humidity: humValue,
    lastUpdated: timeString,
    lastReceivedTimestamp: Date.now()
  };

  // 2. Update Primary Room with live sensor data
  const primaryRoom = rooms.find(r => r.isPrimary);
  if (primaryRoom) {
    primaryRoom.temperature = roomTemp;
    primaryRoom.humidity = humValue;
    primaryRoom.recommendedAcTemperature = recommendedAc;
    primaryRoom.lastUpdated = timeString;
    primaryRoom.isConnected = true;
  }

  console.log(`[ESP32 UPDATE] Primary Room Temp: ${roomTemp}°C | AC: ${recommendedAc}°C | Hum: ${humValue !== null ? humValue + '%' : 'N/A'} at ${timeString}`);

  return res.status(200).json({
    message: 'Temperature received successfully',
    data: latestData
  });
});

// -------------------------------------------------------------
// 2. Legacy Endpoint: GET /api/recommendation
// (Maintained for existing compatibility)
// -------------------------------------------------------------
app.get('/api/recommendation', (req, res) => {
  if (latestData.roomTemperature === null) {
    return res.json({
      roomTemperature: null,
      recommendedAcTemperature: null,
      humidity: null,
      lastUpdated: 'Waiting for ESP32...',
      isConnected: false
    });
  }

  const secondsSinceLastUpdate = (Date.now() - latestData.lastReceivedTimestamp) / 1000;
  const isConnected = secondsSinceLastUpdate <= 15;

  return res.json({
    roomTemperature: latestData.roomTemperature,
    recommendedAcTemperature: latestData.recommendedAcTemperature,
    humidity: latestData.humidity,
    lastUpdated: latestData.lastUpdated,
    isConnected: isConnected
  });
});

// -------------------------------------------------------------
// 3. New Endpoint: GET /api/rooms
// Returns all rooms (primary live room + any simulated rooms)
// -------------------------------------------------------------
app.get('/api/rooms', (req, res) => {
  // Update connection status for primary room
  const primaryRoom = rooms.find(r => r.isPrimary);
  if (primaryRoom) {
    if (latestData.lastReceivedTimestamp) {
      const secondsSinceLastUpdate = (Date.now() - latestData.lastReceivedTimestamp) / 1000;
      primaryRoom.isConnected = secondsSinceLastUpdate <= 15;
    } else {
      primaryRoom.isConnected = false;
    }
  }

  // Generate gentle natural fluctuation for simulated rooms to mimic real room conditions
  const now = Date.now();
  const timeString = new Date().toLocaleTimeString();

  const formattedRooms = rooms.map(room => {
    if (room.isPrimary) {
      return room;
    }

    // Gentle natural drift for simulated rooms (±0.4°C drift)
    const drift = Math.sin((now / 8000) + (room.seed || 0)) * 0.4;
    const currentTemp = Number((room.baseTemperature + drift).toFixed(1));
    const currentHum = Math.round(room.baseHumidity + Math.cos((now / 10000) + (room.seed || 0)) * 2);
    const recAc = getRecommendedAcTemp(currentTemp, currentHum);

    return {
      id: room.id,
      name: room.name,
      isPrimary: false,
      dataType: 'Simulated Data',
      temperature: currentTemp,
      humidity: currentHum,
      recommendedAcTemperature: recAc,
      lastUpdated: timeString,
      isConnected: true
    };
  });

  return res.json({
    rooms: formattedRooms,
    totalRooms: formattedRooms.length
  });
});

// -------------------------------------------------------------
// 4. New Endpoint: POST /api/rooms
// Creates a new simulated room
// -------------------------------------------------------------
app.post('/api/rooms', (req, res) => {
  const { name } = req.body;

  // 1. Validate empty room name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      error: 'Room name cannot be empty. Please enter a valid name.'
    });
  }

  const trimmedName = name.trim();

  // 2. Validate max length
  if (trimmedName.length > 30) {
    return res.status(400).json({
      error: 'Room name must be 30 characters or less.'
    });
  }

  // 3. Prevent duplicate room names (case-insensitive)
  const isDuplicate = rooms.some(
    r => r.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (isDuplicate) {
    return res.status(400).json({
      error: `A room named "${trimmedName}" already exists. Please choose a different name.`
    });
  }

  // Pick realistic base room temperature (between 26.0°C and 34.0°C)
  const randomBaseTemp = Number((26.0 + Math.random() * 8.0).toFixed(1));
  const randomBaseHum = Math.floor(45 + Math.random() * 20); // 45% - 65%

  const newRoom = {
    id: 'room-' + Date.now(),
    name: trimmedName,
    isPrimary: false,
    dataType: 'Simulated Data',
    baseTemperature: randomBaseTemp,
    baseHumidity: randomBaseHum,
    seed: Math.random() * 10,
    temperature: randomBaseTemp,
    humidity: randomBaseHum,
    recommendedAcTemperature: getRecommendedAcTemp(randomBaseTemp, randomBaseHum),
    lastUpdated: new Date().toLocaleTimeString(),
    isConnected: true
  };

  rooms.push(newRoom);
  console.log(`[ROOM CREATED] ${newRoom.name} added as Simulated Room (Initial Temp: ${randomBaseTemp}°C, Hum: ${randomBaseHum}%)`);

  return res.status(201).json({
    message: 'Room created successfully',
    room: newRoom
  });
});

// -------------------------------------------------------------
// 5. New Endpoint: DELETE /api/rooms/:id
// Deletes a room by ID (prevents deleting the primary sensor room)
// -------------------------------------------------------------
app.delete('/api/rooms/:id', (req, res) => {
  const roomId = req.params.id;

  const roomIndex = rooms.findIndex(r => r.id === roomId);
  if (roomIndex === -1) {
    return res.status(404).json({
      error: 'Room not found.'
    });
  }

  const roomToDelete = rooms[roomIndex];

  // Protect the primary sensor room from deletion
  if (roomToDelete.isPrimary) {
    return res.status(400).json({
      error: 'Cannot delete the Primary Room connected to the live ESP32 sensor.'
    });
  }

  rooms.splice(roomIndex, 1);
  console.log(`[ROOM DELETED] Removed room: ${roomToDelete.name} (ID: ${roomId})`);

  return res.status(200).json({
    message: `Room "${roomToDelete.name}" deleted successfully.`
  });
});

// -------------------------------------------------------------
// Start Server
// -------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(` Smart AC Backend Server running on Port ${PORT}`);
  console.log(` Local access: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
