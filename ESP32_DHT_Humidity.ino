/*
 * =====================================================
 *  Smart Spinker — ESP32 DHT Humidity Sensor
 *  Sends Humidity + Temperature → Node.js Dashboard
 * =====================================================
 *
 *  WIRING (DHT22 recommended, DHT11 also works):
 *  ┌──────────────┬────────────────┐
 *  │  DHT Pin     │  ESP32 Pin     │
 *  ├──────────────┼────────────────┤
 *  │  VCC         │  3.3V          │
 *  │  GND         │  GND           │
 *  │  DATA        │  GPIO 4        │
 *  └──────────────┴────────────────┘
 *  (Add 10kΩ pull-up resistor between DATA and VCC)
 *
 *  LIBRARY REQUIRED:
 *  Arduino IDE → Tools → Manage Libraries
 *  → Search "DHT sensor library" by Adafruit → Install
 *  → Also install "Adafruit Unified Sensor" if prompted
 *
 *  SERVER SETUP:
 *  1. Run: node server.js  (in moisture-sensor folder)
 *  2. Note the IP address printed in the console
 *  3. Set SERVER_IP below to that IP address
 * =====================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// ── WiFi ─────────────────────────────────────────────
const char* WIFI_SSID = "TWK.SM";       // Your WiFi SSID
const char* WIFI_PASS = "05022511";      // Your WiFi password

// ── Server ────────────────────────────────────────────
// 👇 Change to your PC's local IP (shown when server starts)
const char* SERVER_IP   = "192.168.1.6";
const int   SERVER_PORT = 3000;
const char* DEVICE_ID   = "ESP32_DHT";

// ── DHT Sensor ────────────────────────────────────────
#define DHT_PIN  4           // GPIO pin connected to DHT DATA
#define DHT_TYPE DHT22       // Use DHT11 if you have DHT11

DHT dht(DHT_PIN, DHT_TYPE);

// ── Interval ──────────────────────────────────────────
const unsigned long INTERVAL = 5000; // Send every 5 seconds
unsigned long lastSend = 0;

// ─────────────────────────────────────────────────────
void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++tries > 40) {
      Serial.println("\n[ERROR] WiFi failed! Restarting...");
      delay(1000);
      ESP.restart();
    }
  }

  Serial.println("\n[OK] WiFi Connected!");
  Serial.print("     IP : "); Serial.println(WiFi.localIP());
  Serial.print("     Signal : "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");

  String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/sensor";
  Serial.print("     Dashboard API: "); Serial.println(url);
  Serial.println("--------------------------------------");
}

// ─────────────────────────────────────────────────────
bool sendData(float humidity, float temperature, float heatIndex) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] WiFi not connected");
    return false;
  }

  HTTPClient http;
  String url = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/sensor";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // Build JSON
  String json = "{";
  json += "\"device\":\"" + String(DEVICE_ID) + "\",";
  json += "\"humidity\":"    + String(humidity,    1) + ",";
  json += "\"temperature\":" + String(temperature, 1) + ",";
  json += "\"heatIndex\":"   + String(heatIndex,   1);
  json += "}";

  Serial.print("[SEND] "); Serial.println(json);

  int code = http.POST(json);
  http.end();

  if (code == 200) {
    Serial.println("[OK]   Server received data ✓");
    return true;
  } else {
    Serial.print("[ERR]  HTTP "); Serial.println(code);
    return false;
  }
}

// ─────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("=====================================");
  Serial.println("  Smart Spinker — Humidity Monitor  ");
  Serial.println("=====================================");

  dht.begin();
  Serial.println("[OK] DHT sensor initialized on GPIO " + String(DHT_PIN));

  connectWiFi();
}

// ─────────────────────────────────────────────────────
void loop() {
  // Auto-reconnect WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] WiFi lost. Reconnecting...");
    connectWiFi();
  }

  if (millis() - lastSend >= INTERVAL) {
    lastSend = millis();

    // Read sensor (DHT22 needs ~2s between reads)
    float humidity    = dht.readHumidity();
    float temperature = dht.readTemperature();      // Celsius

    // Validate
    if (isnan(humidity) || isnan(temperature)) {
      Serial.println("[ERR] Failed to read DHT sensor! Check wiring.");
      return;
    }

    // Compute heat index
    float heatIndex = dht.computeHeatIndex(temperature, humidity, false);

    Serial.println("--------------------------------------");
    Serial.print("[DATA] Humidity    : "); Serial.print(humidity,    1); Serial.println(" %");
    Serial.print("[DATA] Temperature : "); Serial.print(temperature, 1); Serial.println(" °C");
    Serial.print("[DATA] Heat Index  : "); Serial.print(heatIndex,   1); Serial.println(" °C");

    sendData(humidity, temperature, heatIndex);
  }
}
