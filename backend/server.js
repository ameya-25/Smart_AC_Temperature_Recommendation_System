const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Enable Cross-Origin Resource Sharing (so the frontend webpage can request data)
app.use(cors());

// Enable parsing of JSON body data sent by ESP32 or client
app.use(express.json());

// Serve static frontend files (HTML, CSS, JS) directly from Express
app.use(express.static(path.join(__dirname, '../frontend')));

// In-memory data store (no database needed)
let latestData = {
  roomTemperature: null,
  recommendedAcTemperature: null,
  lastUpdated: null,
  lastReceivedTimestamp: null
};

// Function to calculate AC recommendation based on project rules
function getRecommendedAcTemp(roomTemp) {
  if (roomTemp >= 35) {
    return 22; // Very hot -> Cool AC setting
  } else if (roomTemp >= 30) {
    return 24; // Hot -> Moderate cool setting
  } else if (roomTemp >= 27) {
    return 25; // Warm -> Standard comfortable setting
  } else {
    return 26; // Normal/Mild -> Energy-saving setting
  }
}

// -------------------------------------------------------------
// Endpoint 1: POST /api/temperature
// Used by the ESP32 to send the latest room temperature reading
// -------------------------------------------------------------
app.post('/api/temperature', (req, res) => {
  const { temperature } = req.body;

  // Validate the incoming temperature value
  if (temperature === undefined || temperature === null || isNaN(temperature)) {
    return res.status(400).json({
      error: 'Invalid temperature data received. Value must be a valid number.'
    });
  }

  const roomTemp = parseFloat(temperature);
  const recommendedAc = getRecommendedAcTemp(roomTemp);
  const now = new Date();

  // Store the latest data in memory
  latestData = {
    roomTemperature: roomTemp,
    recommendedAcTemperature: recommendedAc,
    lastUpdated: now.toLocaleTimeString(),
    lastReceivedTimestamp: Date.now()
  };

  console.log(`[ESP32 UPDATE] Room Temp: ${roomTemp}°C | Recommended AC: ${recommendedAc}°C at ${latestData.lastUpdated}`);

  return res.status(200).json({
    message: 'Temperature received successfully',
    data: latestData
  });
});

// -------------------------------------------------------------
// Endpoint 2: GET /api/recommendation
// Used by the Frontend webpage to fetch the latest recommendation
// -------------------------------------------------------------
app.get('/api/recommendation', (req, res) => {
  // If we haven't received any reading yet
  if (latestData.roomTemperature === null) {
    return res.json({
      roomTemperature: null,
      recommendedAcTemperature: null,
      lastUpdated: 'Waiting for ESP32...',
      isConnected: false
    });
  }

  // Determine connection status:
  // If ESP32 sent data within the last 15 seconds, mark as Connected
  const secondsSinceLastUpdate = (Date.now() - latestData.lastReceivedTimestamp) / 1000;
  const isConnected = secondsSinceLastUpdate <= 15;

  return res.json({
    roomTemperature: latestData.roomTemperature,
    recommendedAcTemperature: latestData.recommendedAcTemperature,
    lastUpdated: latestData.lastUpdated,
    isConnected: isConnected
  });
});

// Start the Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================================`);
  console.log(` Smart AC Backend Server running on Port ${PORT}`);
  console.log(` Local access: http://localhost:${PORT}`);
  console.log(`=================================================`);
});

