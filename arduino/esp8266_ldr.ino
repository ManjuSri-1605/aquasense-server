/*
 * AquaSense — ESP8266 LDR Sensor Node
 * Single LDR on A0 → POST to backend every 10 seconds
 *
 * Wiring:
 *   3.3V ──── LDR ──┬──── A0
 *                   └──── 10kΩ ──── GND
 *
 *   3.3V ──── 220Ω ──── LED(+) ──── LED(-) ──── GND
 *
 * Libraries (Arduino Library Manager):
 *   - ESP8266WiFi       (bundled with ESP8266 board package)
 *   - ESP8266HTTPClient (bundled)
 *   - ArduinoJson 6.x
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <ArduinoJson.h>

// ── CONFIG — edit these ───────────────────────────────────────
const char* WIFI_SSID     = "Manju";
const char* WIFI_PASSWORD = "abcd1234";

// Live Render backend — ESP8266 sends data here over the internet
const char* SERVER_URL    = "https://aquasense-server-1-nc1c.onrender.com/data";

const int   LDR_PIN       = A0;
const int   SEND_INTERVAL = 10000; // ms between readings

// ── SETUP ─────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n╔══════════════════════════╗");
  Serial.println("║  AquaSense — Booting...  ║");
  Serial.println("╚══════════════════════════╝");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting to ");
  Serial.print(WIFI_SSID);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ✓ Connected!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] ✗ Failed to connect. Check credentials.");
  }
}

// ── LOOP ──────────────────────────────────────────────────────
void loop() {
  // Read LDR
  int ldrValue = analogRead(LDR_PIN);

  // Determine status locally for serial feedback
  String status;
  if      (ldrValue >= 700) status = "CLEAN";
  else if (ldrValue >= 450) status = "LOW";
  else                      status = "HIGH";

  Serial.println("─────────────────────────");
  Serial.printf("[Sensor] LDR = %d  →  %s\n", ldrValue, status.c_str());

  if (WiFi.status() == WL_CONNECTED) {
    BearSSL::WiFiClientSecure client;
    client.setInsecure(); // skip SSL cert check (fine for project use)
    HTTPClient http;

    http.begin(client, SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(8000);

    // Build JSON: {"ldr": 750}
    StaticJsonDocument<64> doc;
    doc["ldr"] = ldrValue;
    String payload;
    serializeJson(doc, payload);

    Serial.printf("[HTTP]  POST %s\n", SERVER_URL);
    Serial.printf("[HTTP]  Body: %s\n", payload.c_str());

    int httpCode = http.POST(payload);

    if (httpCode > 0) {
      String response = http.getString();
      Serial.printf("[HTTP]  Response %d: %s\n", httpCode, response.c_str());
    } else {
      Serial.printf("[HTTP]  Error: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
  } else {
    Serial.println("[WiFi]  Disconnected — attempting reconnect...");
    WiFi.reconnect();
    delay(2000);
  }

  delay(SEND_INTERVAL);
}
