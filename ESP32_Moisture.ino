/*
 * ============================================
 *  Smart Spinker — ESP32 Moisture Sensor
 *  Sends moisture data to Node.js dashboard
 * ============================================
 *
 * SETUP:
 *   1. Run the Node.js server first: npm start
 *   2. The server will print your PC's IP address
 *   3. Replace SERVER_IP below with that IP
 *   4. Make sure ESP32 and PC are on the SAME WiFi network
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ── WiFi Credentials ──────────────────────────
const char* ssid     = "TWK.SM";       // Your WiFi name
const char* password = "05022511";      // Your WiFi password

// ── Server Config ─────────────────────────────
// 👇 Replace with your PC's IP shown when you run: npm start
const char* SERVER_IP   = "192.168.1.100";
const int   SERVER_PORT = 3000;
const char* DEVICE_ID   = "ESP32_01";

// Build full URL
String serverUrl;

// ── Sensor Pin ────────────────────────────────
const int MOISTURE_PIN = 34;

// ── Send Interval ─────────────────────────────
const unsigned long SEND_INTERVAL = 5000; // ms (5 seconds)
unsigned long lastSendTime = 0;

// ─────────────────────────────────────────────
void connectWiFi() {
  Serial.println("\n🔌 Connecting to WiFi: " + String(ssid));
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts > 40) {
      Serial.println("\n❌ WiFi connection failed! Restarting...");
      ESP.restart();
    }
  }

  Serial.println();
  Serial.println("✅ WiFi Connected!");
  Serial.print("   IP Address : ");
  Serial.println(WiFi.localIP());
  Serial.print("   Signal     : ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
  Serial.println("   Dashboard  : http://" + String(SERVER_IP) + ":" + String(SERVER_PORT));
}

// ─────────────────────────────────────────────
bool sendMoistureData(int rawValue) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi not connected, skipping...");
    return false;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000); // 5 second timeout

  // Build JSON payload
  String json = "{\"device\":\"" + String(DEVICE_ID) + "\","
                "\"moisture\":" + String(rawValue) + "}";

  Serial.print("📤 Sending → ");
  Serial.println(json);

  int httpCode = http.POST(json);

  if (httpCode > 0) {
    Serial.print("✅ HTTP Response: ");
    Serial.println(httpCode);
    if (httpCode == 200) {
      Serial.println("   Server acknowledged!");
    }
    http.end();
    return true;
  } else {
    Serial.print("❌ HTTP Error: ");
    Serial.println(http.errorToString(httpCode));
    http.end();
    return false;
  }
}

// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("=====================================");
  Serial.println("  Smart Spinker — Moisture Monitor  ");
  Serial.println("=====================================");

  serverUrl = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/sensor";

  connectWiFi();
}

// ─────────────────────────────────────────────
void loop() {
  // Reconnect WiFi if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi lost! Reconnecting...");
    connectWiFi();
  }

  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;

    // Read sensor (average of 5 samples for stability)
    long sum = 0;
    for (int i = 0; i < 5; i++) {
      sum += analogRead(MOISTURE_PIN);
      delay(10);
    }
    int rawValue = sum / 5;

    // Calculate percentage for local Serial output
    int moistPct = map(rawValue, 4095, 0, 0, 100);
    moistPct = constrain(moistPct, 0, 100);

    Serial.println("─────────────────────────────");
    Serial.print  ("💧 Moisture Raw : "); Serial.println(rawValue);
    Serial.print  ("   Moisture %   : "); Serial.print(moistPct); Serial.println("%");
    Serial.print  ("   WiFi RSSI    : "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");

    sendMoistureData(rawValue);
  }
}
