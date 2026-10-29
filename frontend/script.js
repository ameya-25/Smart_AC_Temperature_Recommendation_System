// API Base URL (works both from file:// or http://localhost:3000)
const BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

// DOM Elements
const roomsGrid = document.getElementById('rooms-grid');
const esp32StatusBadge = document.getElementById('esp32-status-badge');
const roomsCountBadge = document.getElementById('rooms-count-badge');
const globalSyncTime = document.getElementById('global-sync-time');
const errorBanner = document.getElementById('error-banner');

// Modal Elements
const roomModal = document.getElementById('room-modal');
const openCreateModalBtn = document.getElementById('open-create-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const createRoomForm = document.getElementById('create-room-form');
const roomNameInput = document.getElementById('room-name-input');
const modalErrorMsg = document.getElementById('modal-error-msg');
const submitCreateBtn = document.getElementById('submit-create-btn');

// Local cache of current rooms (used for frontend duplicate check)
let currentRooms = [];

// Helper: Get AC comfort advice text factoring in humidity
function getAdviceText(acTemp, humidity) {
  if (!acTemp) return "Waiting for temperature reading";
  if (humidity && humidity >= 60) {
    return "High humidity detected • Extra cooling & dehumidification active";
  }
  if (acTemp <= 22) return "High heat • Maximum cooling recommended";
  if (acTemp <= 24) return "Warm room • Balanced comfort cooling";
  return "Mild room • Energy-saving cooling";
}

// -------------------------------------------------------------
// 1. Fetch and Render All Rooms
// -------------------------------------------------------------
async function fetchRooms() {
  try {
    const response = await fetch(`${BASE_URL}/api/rooms`);

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    currentRooms = data.rooms || [];

    // Hide any previous global error banner
    errorBanner.style.display = 'none';

    // Update room counter & sync timestamp
    roomsCountBadge.textContent = `${currentRooms.length} ${currentRooms.length === 1 ? 'Room' : 'Rooms'}`;
    globalSyncTime.textContent = `Last sync: ${new Date().toLocaleTimeString()}`;

    // Update Primary ESP32 Hardware Status Badge
    const primaryRoom = currentRooms.find(r => r.isPrimary);
    if (primaryRoom && primaryRoom.isConnected) {
      esp32StatusBadge.textContent = "CONNECTED";
      esp32StatusBadge.className = "badge badge-connected";
    } else {
      esp32StatusBadge.textContent = "DISCONNECTED";
      esp32StatusBadge.className = "badge badge-disconnected";
    }

    // Render the Room Cards Grid
    renderRoomCards(currentRooms);

  } catch (error) {
    console.error("Error fetching rooms:", error);
    esp32StatusBadge.textContent = "SERVER OFFLINE";
    esp32StatusBadge.className = "badge badge-disconnected";
    errorBanner.textContent = "⚠️ Unable to connect to backend server. Make sure 'node server.js' is running.";
    errorBanner.style.display = 'block';
  }
}

// -------------------------------------------------------------
// 2. Render Room Cards HTML
// -------------------------------------------------------------
function renderRoomCards(rooms) {
  if (rooms.length === 0) {
    roomsGrid.innerHTML = `
      <div class="empty-state">
        <p>No rooms configured yet. Click <strong>+ Create Room</strong> above to add one!</p>
      </div>
    `;
    return;
  }

  roomsGrid.innerHTML = rooms.map(room => {
    const isLive = room.dataType === 'Live Data';
    const tempDisplay = (room.temperature !== null && room.temperature !== undefined)
      ? `${Number(room.temperature).toFixed(1)}<span class="reading-unit">°C</span>`
      : `--`;
    const humDisplay = (room.humidity !== null && room.humidity !== undefined)
      ? `${Math.round(room.humidity)}<span class="reading-unit">%</span>`
      : `--`;
    const acDisplay = (room.recommendedAcTemperature !== null && room.recommendedAcTemperature !== undefined)
      ? `${room.recommendedAcTemperature}`
      : '--';

    const advice = getAdviceText(room.recommendedAcTemperature, room.humidity);

    return `
      <div class="room-card-box ${room.isPrimary ? 'primary-room' : ''}" data-room-id="${room.id}">
        <!-- Card Header -->
        <div class="room-card-top">
          <div class="room-title-area">
            <h3>${escapeHtml(room.name)}</h3>
            <div class="room-badges">
              <span class="badge ${isLive ? 'badge-live' : 'badge-simulated'}">
                ${isLive ? '● Live Data (ESP32)' : 'Simulated Data'}
              </span>
            </div>
          </div>
          ${!room.isPrimary ? `
            <button class="btn-delete" onclick="handleDeleteRoom('${room.id}', '${escapeHtml(room.name)}')">
              🗑️ Delete
            </button>
          ` : ''}
        </div>

        <!-- Sensor Readings: Temp & Humidity -->
        <div class="room-readings">
          <div class="reading-item">
            <span class="reading-label">Room Temp</span>
            <div class="reading-val">${tempDisplay}</div>
          </div>
          <div class="reading-item">
            <span class="reading-label">Humidity</span>
            <div class="reading-val">${humDisplay}</div>
          </div>
        </div>

        <!-- Prominent Recommended AC Target -->
        <div class="ac-recommendation-box">
          <div class="ac-rec-left">
            <h4>Recommended AC</h4>
            <p>${advice}</p>
          </div>
          <div class="ac-rec-temp">
            ${acDisplay}<span>°C</span>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="room-card-footer">
          <span>Updated: ${room.lastUpdated || '--'}</span>
          <span>${isLive ? 'Hardware: DHT11' : 'Multi-zone Simulation'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 3. Modal Actions: Open, Close, Error Handling
// -------------------------------------------------------------
function openModal() {
  modalErrorMsg.style.display = 'none';
  modalErrorMsg.textContent = '';
  roomNameInput.value = '';
  roomModal.style.display = 'flex';
  roomNameInput.focus();
}

function closeModal() {
  roomModal.style.display = 'none';
  modalErrorMsg.style.display = 'none';
}

function showModalError(msg) {
  modalErrorMsg.textContent = msg;
  modalErrorMsg.style.display = 'block';
}

openCreateModalBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

// Close modal if user clicks outside modal card
window.addEventListener('click', (e) => {
  if (e.target === roomModal) {
    closeModal();
  }
});

// -------------------------------------------------------------
// 4. Form Submit: Create Room
// -------------------------------------------------------------
createRoomForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const roomName = roomNameInput.value.trim();

  // Frontend Validation 1: Empty check
  if (!roomName) {
    showModalError("Please enter a room name.");
    return;
  }

  // Frontend Validation 2: Duplicate check
  const isDuplicate = currentRooms.some(
    r => r.name.toLowerCase() === roomName.toLowerCase()
  );
  if (isDuplicate) {
    showModalError(`A room named "${roomName}" already exists. Please choose a different name.`);
    return;
  }

  submitCreateBtn.disabled = true;
  submitCreateBtn.textContent = "Creating...";

  try {
    const res = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roomName })
    });

    const result = await res.json();

    if (!res.ok) {
      showModalError(result.error || "Failed to create room.");
      return;
    }

    // Success! Close modal and immediately refresh rooms list
    closeModal();
    await fetchRooms();

  } catch (err) {
    console.error("Create room request failed:", err);
    showModalError("Server communication error. Please try again.");
  } finally {
    submitCreateBtn.disabled = false;
    submitCreateBtn.textContent = "Add Room";
  }
});

// -------------------------------------------------------------
// 5. Delete Room Action (with confirmation)
// -------------------------------------------------------------
async function handleDeleteRoom(roomId, roomName) {
  const confirmed = window.confirm(`Are you sure you want to delete "${roomName}"?`);
  if (!confirmed) {
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/rooms/${roomId}`, {
      method: 'DELETE'
    });

    const result = await res.json();

    if (!res.ok) {
      alert(`Error: ${result.error || 'Failed to delete room'}`);
      return;
    }

    // Refresh rooms immediately
    await fetchRooms();

  } catch (err) {
    console.error("Delete room failed:", err);
    alert("Server communication error while deleting room.");
  }
}

// Helper: Escape HTML to prevent basic injection
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// -------------------------------------------------------------
// 6. Lifecycle: Initial Load & Auto-Refresh Interval
// -------------------------------------------------------------
fetchRooms();

// Auto-refresh every 3 seconds for seamless real-time updates
setInterval(fetchRooms, 3000);
