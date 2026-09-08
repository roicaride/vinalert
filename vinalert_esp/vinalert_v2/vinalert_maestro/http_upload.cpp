#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include "http_upload.h"
#include "config.h"

bool wifiConnect(uint32_t timeoutMs) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(100);
  }

  bool connected = WiFi.status() == WL_CONNECTED;
  DBG_PRINTLN(connected ? "WiFi conectado" : "WiFi: timeout al conectar");
  return connected;
}

void wifiDisconnect() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool httpPostJson(const String &url, const String &apiKey, const String &jsonBody, int &outStatusCode) {
  if (WiFi.status() != WL_CONNECTED) {
    outStatusCode = -1;
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure(); // el backend esta detras de un tunel ngrok; no se fija el certificado

  HTTPClient http;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  if (apiKey.length() > 0) {
    http.addHeader("Authorization", "Bearer " + apiKey);
  }
  // Sin esto, ngrok devuelve su pagina HTML de aviso en vez de reenviar la peticion al backend.
  http.addHeader("ngrok-skip-browser-warning", "true");
  http.setTimeout(HTTP_TIMEOUT_MS);

  outStatusCode = http.POST(jsonBody);
  http.end();

  bool ok = outStatusCode >= 200 && outStatusCode < 300;
  DBG_PRINT("POST status: ");
  DBG_PRINTLN(outStatusCode);
  return ok;
}

bool httpGetCycleSeconds(const String &url, const String &apiKey, uint32_t &outSeconds) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, url);
  if (apiKey.length() > 0) {
    http.addHeader("Authorization", "Bearer " + apiKey);
  }
  http.addHeader("ngrok-skip-browser-warning", "true");
  http.setTimeout(HTTP_TIMEOUT_MS);

  int status = http.GET();
  String body = (status >= 200 && status < 300) ? http.getString() : String("");
  http.end();

  if (status < 200 || status >= 300) {
    DBG_PRINT("GET config status: ");
    DBG_PRINTLN(status);
    return false;
  }

  // Parseo a mano de un unico entero: meter ArduinoJson entera por un campo
  // no compensa, y el formato de la respuesta lo fija nuestro propio backend.
  const char *clave = "\"intervalo_ciclo_seg\"";
  int pos = body.indexOf(clave);
  if (pos < 0) return false;
  pos = body.indexOf(':', pos);
  if (pos < 0) return false;
  pos++;
  while (pos < (int)body.length() && (body[pos] == ' ' || body[pos] == '	')) pos++;

  int fin = pos;
  while (fin < (int)body.length() && isDigit(body[fin])) fin++;
  if (fin == pos) return false; // no habia ningun digito donde deberia

  outSeconds = (uint32_t)body.substring(pos, fin).toInt();
  DBG_PRINT("Intervalo de ciclo del servidor: ");
  DBG_PRINTLN(outSeconds);
  return true;
}

bool ntpSync(uint32_t timeoutMs) {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);

  time_t now = 0;
  uint32_t start = millis();
  const time_t plausibleMin = 8 * 3600 * 2; // epoch pequeno = todavia no ha sincronizado
  time(&now);
  while (now < plausibleMin && millis() - start < timeoutMs) {
    delay(200);
    time(&now);
  }

  if (now < plausibleMin) {
    DBG_PRINTLN("NTP: timeout, no se pudo sincronizar la hora");
    return false;
  }
  DBG_PRINTLN("NTP sincronizado");
  return true;
}

uint32_t nowEpochUtc() {
  // time() devuelve epoch UTC real; el offset configurado en configTime()
  // solo afecta a getLocalTime()/localtime(), no a este valor.
  time_t now;
  time(&now);
  return (uint32_t)now;
}

String nowLocalIso() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "";
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", &timeinfo);
  return String(buffer);
}

String epochToLocalIso(uint32_t epoch) {
  time_t t = (time_t)epoch + GMT_OFFSET_SEC + DAYLIGHT_OFFSET_SEC;
  struct tm *timeinfo = gmtime(&t); // gmtime porque el offset ya se sumo a mano arriba
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", timeinfo);
  return String(buffer);
}
