#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>

// ==================== WiFi ====================
const char* ssid = "TWK.SM";
const char* password = "05022511";

// ==================== API =====================
const char* serverUrl = "http://192.168.1.53:3000/api/sensor";

// ==================== Sensor ==================
const int moisturePin = 34;
const int servoPin = 18;

// ==================== Calibration ====================
const int dryValue = 3200;
const int wetValue = 1400;

// ==================== Config (synced from dashboard) ====================
int openThreshold = 40;
int wateringMinutes = 3;

// ==================== Servo ====================
Servo valveServo;
bool valveOpen = false;
unsigned long valveStartTime = 0;

// ==================== WiFi Connect ====================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("================================");
  Serial.println("WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.println("================================");
}

// ==================== Parse Config from Server ====================
void parseConfig(String response) {
  int idx;

  idx = response.indexOf("\"openThreshold\":");
  if (idx >= 0) {
    int start = idx + 16;
    int end = response.indexOf(',', start);
    if (end < 0) end = response.indexOf('}', start);
    int val = response.substring(start, end).toInt();
    if (val >= 5 && val <= 95 && val != openThreshold) {
      openThreshold = val;
      Serial.print("[CONFIG] openThreshold -> ");
      Serial.println(openThreshold);
    }
  }

  idx = response.indexOf("\"wateringMinutes\":");
  if (idx >= 0) {
    int start = idx + 18;
    int end = response.indexOf(',', start);
    if (end < 0) end = response.indexOf('}', start);
    int val = response.substring(start, end).toInt();
    if (val >= 1 && val <= 60 && val != wateringMinutes) {
      wateringMinutes = val;
      Serial.print("[CONFIG] wateringMinutes -> ");
      Serial.println(wateringMinutes);
    }
  }
}

// ==================== Setup ====================
void setup() {
  Serial.begin(115200);

  valveServo.attach(servoPin);
  valveServo.write(0);

  connectWiFi();

  Serial.println("Smart Sprinkler Started");
  Serial.println("Config adjustable from dashboard!");
}

// ==================== Main Loop ====================
void loop() {

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // ---------- Read Sensor ----------
  int rawValue = analogRead(moisturePin);
  int moisturePercent = map(rawValue, dryValue, wetValue, 0, 100);
  moisturePercent = constrain(moisturePercent, 0, 100);

  // ---------- Valve Control ----------
  // Open: moisture drops below threshold & valve is closed
  if (!valveOpen && moisturePercent < openThreshold) {
    Serial.println("Soil Dry -> Open Valve");
    valveServo.write(90);
    valveOpen = true;
    valveStartTime = millis();
  }

  // Close: timer expired
  if (valveOpen) {
    if (millis() - valveStartTime >= (unsigned long)wateringMinutes * 60000UL) {
      Serial.println("Watering Complete -> Close Valve");
      valveServo.write(0);
      valveOpen = false;
    }
  }

  // ---------- Serial Monitor ----------
  Serial.print("Raw: ");        Serial.print(rawValue);
  Serial.print(" | Moisture: ");Serial.print(moisturePercent); Serial.print("%");
  Serial.print(" | Threshold: ");Serial.print(openThreshold); Serial.print("%");
  Serial.print(" | Water: ");   Serial.print(wateringMinutes); Serial.print("min");
  Serial.print(" | Valve: ");   Serial.print(valveOpen ? "OPEN" : "CLOSE");

  if (valveOpen) {
    unsigned long remain = ((unsigned long)wateringMinutes * 60000UL - (millis() - valveStartTime)) / 1000UL;
    Serial.print(" | Remaining: "); Serial.print(remain); Serial.print("s");
  }
  Serial.println();

  // ---------- Send to Dashboard ----------
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String json = "{";
    json += "\"raw\":" + String(rawValue) + ",";
    json += "\"moisture\":" + String(moisturePercent) + ",";
    json += "\"threshold\":" + String(openThreshold) + ",";
    json += "\"wateringMinutes\":" + String(wateringMinutes) + ",";
    json += "\"valve\":\"" + String(valveOpen ? "OPEN" : "CLOSE") + "\"";
    json += "}";

    int httpCode = http.POST(json);

    if (httpCode == 200) {
      String response = http.getString();
      parseConfig(response);
      Serial.println("[OK] Sent + config synced");
    } else {
      Serial.print("[ERR] HTTP "); Serial.println(httpCode);
    }

    http.end();
  }

  delay(5000);
}
