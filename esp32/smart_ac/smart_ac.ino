#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"

// -------------------------------------------------------------
// 1. PIN CONFIGURATION
// -------------------------------------------------------------
#define DHTPIN 4          // Pin connected to the DHT11 signal pin
#define DHTTYPE DHT11     // Sensor type: DHT11

DHT dht(DHTPIN, DHTTYPE);

// -------------------------------------------------------------
// 2. NETWORK CONFIGURATION
// Replace with your Wi-Fi name and password
// Both your laptop and ESP32 MUST be connected to this network.
// -------------------------------------------------------------
const char* ssid = "Galaxy M07 8898";
const char* password = "1234567890";

// Replace with your laptop's local IPv4 address
// (Do NOT use "localhost" or "127.0.0.1" here!)
const char* serverUrl = "http://10.190.163.70:3000/api/temperature";

// Timer to send readings every 3 seconds (3000 ms)
unsigned long lastTime = 0;
const unsigned long timerDelay = 3000;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n--- Smart AC ESP32 Starting ---");

  // Initialize DHT11 sensor
  dht.begin();

  // Connect to Wi-Fi
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  // Wait until connected
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi Connected successfully!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Check if 3 seconds have passed
  if ((millis() - lastTime) > timerDelay) {
    lastTime = millis();

    // Read room temperature from DHT11
    float temperature = dht.readTemperature();

    // Check if sensor reading failed
    if (isnan(temperature)) {
      Serial.println("[ERROR] Failed to read from DHT11 sensor. Skipping cycle.");
      return;
    }

    Serial.print("\n[SENSOR] Current Room Temperature: ");
    Serial.print(temperature);
    Serial.println(" °C");

    // Only send if Wi-Fi is still connected
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;

      // Specify server target URL
      http.begin(serverUrl);

      // Specify JSON content header
      http.addHeader("Content-Type", "application/json");

      // Construct JSON payload: {"temperature": 28.5}
      String jsonPayload = "{\"temperature\":" + String(temperature, 1) + "}";

      Serial.print("[HTTP] Sending POST to: ");
      Serial.println(serverUrl);
      Serial.print("[HTTP] Payload: ");
      Serial.println(jsonPayload);

      // Send the HTTP POST request
      int httpResponseCode = http.POST(jsonPayload);

      if (httpResponseCode > 0) {
        Serial.print("[HTTP] Response code: ");
        Serial.println(httpResponseCode);
        String response = http.getString();
        Serial.print("[HTTP] Response body: ");
        Serial.println(response);
      } else {
        Serial.print("[HTTP] Error on sending POST: ");
        Serial.println(httpResponseCode);
      }

      // Free resources
      http.end();
    } else {
      Serial.println("[ERROR] Wi-Fi Disconnected. Cannot send data.");
    }
  }
}

