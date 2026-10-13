#ifndef HTTP_UPLOAD_H
#define HTTP_UPLOAD_H

#include <Arduino.h>

bool wifiConnect(uint32_t timeoutMs);
void wifiDisconnect();

// Sube un JSON ya serializado. Devuelve true si el servidor respondio 2xx.
bool httpPostJson(const String &url, const String &apiKey, const String &jsonBody, int &outStatusCode);

// Consulta al backend el intervalo de ciclo configurado para este dispositivo
// (requiere WiFi ya conectado). Devuelve true y escribe outSeconds solo si el
// servidor respondio 2xx con un valor parseable; en cualquier otro caso
// devuelve false y no toca outSeconds, para que el llamante conserve el
// intervalo que ya tenia en vez de caer a un valor inventado.
bool httpGetCycleSeconds(const String &url, const String &apiKey, uint32_t &outSeconds);

// Sincroniza la hora por NTP (requiere WiFi ya conectado); bloquea hasta
// lograrlo o agotar el timeout.
bool ntpSync(uint32_t timeoutMs);
// Epoch UTC real, valido tras ntpSync().
uint32_t nowEpochUtc();
// "YYYY-MM-DDTHH:MM:SSZ" (UTC) a partir de un epoch. Sirve igual con la hora
// recien sincronizada que con la estimada sin NTP.
String epochToIsoUtc(uint32_t epoch);

#endif // HTTP_UPLOAD_H
