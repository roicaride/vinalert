#ifndef SECRETS_H
#define SECRETS_H

// ===================== CREDENCIALES LOCALES =====================
// Copia este fichero a `secrets.h` y rellena los valores de tu despliegue.
// `secrets.h` esta en .gitignore y nunca debe subirse al repositorio.

// Red WiFi a la que se conecta el maestro para subir las lecturas.
#define WIFI_SSID     "TU_SSID_WIFI"
#define WIFI_PASSWORD "TU_PASSWORD_WIFI"

// Base de la API. En desarrollo suele ser un tunel ngrok, que cambia cada
// vez que se reinicia salvo que sea un dominio reservado de pago. En
// produccion, el dominio permanente donde este desplegado el backend.
#define SERVER_BASE_URL "https://tu-backend.example.com"

// Token JWT de dispositivo IoT. Se genera desde la web, en
// Configuracion -> Dispositivos ESP32, y se puede revocar desde ahi mismo.
#define API_KEY "PEGA_AQUI_EL_TOKEN_DEL_DISPOSITIVO"

#endif // SECRETS_H
