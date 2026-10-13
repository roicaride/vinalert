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

// Certificado raiz (PEM) de la autoridad que firma el certificado HTTPS del
// backend. Con el, el maestro comprueba que habla con TU servidor y no con un
// punto de acceso falso que se quede con el token. OBLIGATORIO en produccion:
// sin el, la compilacion avisa y no se valida nada.
// Si el servidor usa Let's Encrypt, es ISRG Root X1:
//   https://letsencrypt.org/certs/isrgrootx1.pem
// Pega el fichero entero, linea a linea, asi:
// #define SERVER_ROOT_CA //   "-----BEGIN CERTIFICATE-----
" //   "MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
" //   "...
" //   "-----END CERTIFICATE-----
"

#endif // SECRETS_H
