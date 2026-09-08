#ifndef OLED_DISPLAY_H
#define OLED_DISPLAY_H

#include <Arduino.h>

void oledInit();
// Anade una linea al log visible en pantalla (y la imprime tambien por Serial,
// para no tener que llamar a DBG_PRINTLN por separado en cada sitio).
void oledLog(const String &line);
// Apaga el panel para no gastar bateria. Llamar siempre antes del deep sleep.
void oledOff();

#endif // OLED_DISPLAY_H
