// Select HTML DOM elements
const roomTempEl = document.getElementById('room-temp');
const acTempEl = document.getElementById('ac-temp');
const statusBadgeEl = document.getElementById('status-badge');
const lastUpdatedEl = document.getElementById('last-updated');
const acAdviceEl = document.getElementById('ac-advice');

// API URL: Works whether opened as a local file or via http://localhost:3000
const API_URL = window.location.protocol === 'file:'
  ? 'http://localhost:3000/api/recommendation'
  : '/api/recommendation';

// Function to fetch the latest sensor data & recommendation from Express
async function fetchRecommendation() {
  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Server returned HTTP status ${response.status}`);
    }

    const data = await response.json();

    // 1. Update Room Temperature
    if (data.roomTemperature !== null && data.roomTemperature !== undefined) {
      roomTempEl.textContent = Number(data.roomTemperature).toFixed(1);
    } else {
      roomTempEl.textContent = '--';
    }

    // 2. Update Recommended AC Temperature
    if (data.recommendedAcTemperature !== null && data.recommendedAcTemperature !== undefined) {
      acTempEl.textContent = data.recommendedAcTemperature;

      // Friendly advice message based on recommendation
      if (data.recommendedAcTemperature <= 22) {
        acAdviceEl.textContent = "High heat detected • Strong cooling recommended";
      } else if (data.recommendedAcTemperature <= 24) {
        acAdviceEl.textContent = "Warm room • Balanced cooling recommended";
      } else {
        acAdviceEl.textContent = "Moderate room • Energy-saving cooling recommended";
      }
    } else {
      acTempEl.textContent = '--';
      acAdviceEl.textContent = "Awaiting initial sensor data";
    }

    // 3. Update ESP32 Connection Status Badge
    if (data.isConnected) {
      statusBadgeEl.textContent = "ESP32 CONNECTED";
      statusBadgeEl.className = "badge badge-connected";
    } else {
      statusBadgeEl.textContent = "ESP32 DISCONNECTED";
      statusBadgeEl.className = "badge badge-disconnected";
    }

    // 4. Update Timestamp
    if (data.lastUpdated) {
      lastUpdatedEl.textContent = data.lastUpdated;
    }

  } catch (error) {
    console.error("Error fetching recommendation:", error);
    // If backend is stopped or unreachable
    statusBadgeEl.textContent = "SERVER OFFLINE";
    statusBadgeEl.className = "badge badge-disconnected";
  }
}

// Fetch immediately when the webpage loads
fetchRecommendation();

// Automatically refresh data every 3 seconds (3000 ms)
setInterval(fetchRecommendation, 3000);
