# VinAlert v2 — Firmware

Dos sketches de Arduino IDE para el sistema de monitoreo de viñedo descrito en
`contexto-proyecto-vinedo.md`: uno para el nodo maestro y otro para los nodos
esclavo. El archivo `vinalert_v2.ino` de esta carpeta raíz no se usa; el
firmware real vive en las dos carpetas de abajo.

## Estructura

```
vinalert_v2/
├── contexto-proyecto-vinedo.md
├── vinalert_maestro/          <- abrir vinalert_maestro.ino en Arduino IDE
│   ├── vinalert_maestro.ino   (setup/loop, orquestación del ciclo)
│   ├── config.h               (pines, timings, credenciales — EDITAR)
│   ├── vinalert_protocol.h    (formato de los paquetes LoRa)
│   ├── lora_link.*            (capa LoRa: beacon + polling)
│   ├── http_upload.*          (capa WiFi/HTTP + NTP)
│   ├── storage_buffer.*       (buffer en LittleFS para reintentos)
│   └── oled_display.*         (log de estado en la pantalla OLED)
└── vinalert_esclavo/          <- abrir vinalert_esclavo.ino en Arduino IDE
    ├── vinalert_esclavo.ino
    ├── config.h                (pines, SLAVE_ID, timings — EDITAR)
    ├── vinalert_protocol.h     (idéntico al del maestro)
    ├── lora_link.*             (capa LoRa: recibir beacon/poll, responder)
    ├── modbus_sensors.*        (capa Modbus RTU sobre RS-485)
    └── oled_display.*          (idéntico al del maestro)
```

`vinalert_protocol.h` define el formato binario de los paquetes LoRa y debe
ser **idéntico** en ambas carpetas. Arduino IDE no comparte código entre
sketches, así que si lo tocas, copia el cambio a las dos copias (si esto
se vuelve incómodo, es la señal para migrar a PlatformIO con una librería
compartida — ver punto pendiente en la sección 8 del documento de contexto).

## Librerías a instalar (Gestor de Librerías de Arduino IDE)

- **LoRa** de Sandeep Mistry
- **ModbusMaster** de Doc Walker (4-20ma)
- **Adafruit SSD1306** (instala también su dependencia, **Adafruit GFX Library**,
  cuando el Gestor de Librerías lo pida)

WiFi, HTTPClient, LittleFS y esp_sleep vienen incluidas con el core de
ESP32 (Gestor de Placas → "esp32" de Espressif Systems); no hace falta
instalarlas aparte.

Placa: selecciona la variante TTGO LoRa32 si tu versión del core la lista, o
"ESP32 Dev Module" si no aparece — el pinout se define en el propio código,
no depende de la placa seleccionada en el IDE (solo afecta al tamaño de
flash/partición; asegúrate de que el esquema de particiones incluya espacio
para LittleFS en el maestro).

## Antes de flashear — checklist

1. **Banda LoRa** (`LORA_BAND` en ambos `config.h`): por defecto 868E6 (EU).
   Cámbiala a 433E6/915E6 si tu placa es de otra región, y verifica que
   coincida en maestro y esclavos.
2. **`SLAVE_ID`** en `vinalert_esclavo/config.h`: único por cada esclavo
   físico (1, 2, 3...), debe estar también en `SLAVE_IDS[]` del maestro.
3. **Pines RS-485** (`RS485_RX_PIN`/`TX_PIN`/`DE_RE_PIN`): verifica que
   coincidan con tu cableado real y estén libres en tu revisión de placa.
4. **Registro Modbus de los sensores** (`modbus_sensors.cpp`, función
   `readOneSensor`): el mapeo `reg 0x0000=humedad, 0x0001=temperatura,
   valor/10` es el habitual en sensores RS-485 de suelo económicos, pero
   **verifícalo contra el datasheet real** de los sensores que compres.
5. **Pines OLED** (`OLED_SDA_PIN`/`SCL_PIN`/`RST_PIN` en `config.h`): 21/22
   para I2C son correctos en las unidades probadas. `OLED_RST_PIN` se dejó
   en **-1** (desactivado) a propósito: con `RST=16` (el valor "de libro"
   para TTGO LoRa32 V2.1), `display.begin()` se quedaba colgado sin más —
   ni siquiera daba error, el nodo entraba en bucle de reinicios por
   watchdog — a pesar de que el bus I2C sí respondía a un sondeo simple de
   la dirección. El módulo se auto-resetea bien solo con la alimentación,
   sin pin de reset por software. `oledInit()` también sondea la dirección
   I2C con timeout antes de llamar a `display.begin()`, así que si en tu
   unidad la pantalla no responde en absoluto (a diferencia del caso
   anterior), verás "OLED no responde en I2C" por Serial y el nodo sigue
   funcionando sin pantalla en vez de colgarse.
6. **`secrets.h`** — antes de compilar el maestro, copia
   `vinalert_maestro/secrets.example.h` a `vinalert_maestro/secrets.h` y
   rellena los cuatro valores. Ese fichero está en `.gitignore`: contiene las
   credenciales reales del despliegue y **nunca debe subirse al repositorio**.
   `config.h` lo incluye, así que sin él la compilación falla.
   - `WIFI_SSID` / `WIFI_PASSWORD`: la red real donde vaya a vivir el maestro.
   - `API_KEY`: token del dispositivo, que se genera desde la web
     (Configuración → Dispositivos ESP32) y se puede revocar desde ahí mismo
     si se filtra.
7. **`SERVER_BASE_URL`** (también en `secrets.h`): en desarrollo apunta a un
   túnel ngrok gratuito, que **cambia cada vez que se reinicia** en el PC que
   lo aloja (a menos que sea un dominio ngrok reservado de pago, o se migre a
   un hosting permanente). Cuando cambie, actualiza esta única constante y
   reflashea el maestro; `SERVER_URL` y `CONFIG_URL` se derivan de ella.
8. **`PARCELA_IDS[]`**: se asume 1 esclavo = 1 parcela, con `parcela_id`
   igual al `SLAVE_ID` de ese esclavo. Si la numeración real de parcelas del
   backend no coincide con la de `SLAVE_IDS[]`, ajusta este array (mismo
   orden que `SLAVE_IDS[]`).
9. **Intervalo de ciclo**: ya no se edita aquí. Se configura desde la web
   (Configuración → Dispositivos ESP32 → columna "Intervalo de envío") y el
   maestro lo recoge solo — ver la sección siguiente.
   `DEFAULT_CYCLE_INTERVAL_SEC` (maestro) y `DEFAULT_CYCLE_SEC` (esclavo)
   pasan a ser solo respaldos de arranque en frío y no tienen que coincidir.

## Intervalo de ciclo configurable desde la web

El tiempo entre envíos es un dato del dispositivo en la base de datos, no una
constante compilada. Cada ciclo, nada más conectar el WiFi, el maestro hace
`GET /dispositivos/configuracion` con su propio token Bearer y el backend le
responde `{"dispositivo_id":…, "parcela_id":…, "intervalo_ciclo_seg":…}`. El
valor se guarda en memoria RTC, así que sobrevive al deep sleep sin tocar la
flash.

**Se aplica en el ciclo siguiente, no en el mismo, y es a propósito.** El
orden de un ciclo es: beacon → sondear esclavos → WiFi → subir → dormir. Los
esclavos ya se han ido a dormir con el `cycleSeconds` que llevaba el beacon
cuando el maestro recibe la respuesta del servidor. Si el maestro durmiera ya
el valor nuevo, se levantaría en otro instante que sus esclavos y la red
quedaría desincronizada durante un ciclo (con los esclavos gastando batería en
esperas de beacon que expiran). Por eso el valor llega a `pendingCycleSeconds`
y solo pasa a `activeCycleSeconds` al principio del ciclo siguiente, que es
cuando puede anunciarse en el beacon y estrenarse a la vez en todos los nodos.

En la práctica: cambias el número en la web, en el siguiente contacto el
maestro muestra `Nuevo ciclo Nnnns` en la OLED (tu acuse de recibo), y a
partir del contacto posterior la red entera va a esa cadencia.

Si el GET falla (sin WiFi, servidor caído, respuesta ilegible), el maestro
conserva el intervalo que ya tenía en vez de caer a ningún valor por defecto.
El backend valida el rango 30 s – 24 h y el firmware lo vuelve a acotar con
`MIN_CYCLE_INTERVAL_SEC` / `MAX_CYCLE_INTERVAL_SEC`, para que un valor absurdo
no pueda dejar un nodo mudo ni freírlo a ciclos.

Los esclavos **no participan en esto**: no hablan con el servidor y no
necesitan reflasheo. Adoptan el `cycleSeconds` de cada beacon, como ya hacían.

## Notas de diseño

- **Sincronización**: el maestro no persiste hora real entre encendidos
  hasta su primer NTP exitoso; hasta entonces el beacon viaja con
  `epoch=0` (inofensivo, solo afecta al timestamp mostrado). Cada ciclo,
  tras subir los datos, el maestro sincroniza por NTP y guarda el epoch en
  memoria RTC (`RTC_DATA_ATTR`, sobrevive al deep sleep). Los esclavos no
  mantienen reloj propio: adoptan el `cycleSeconds` y el `epoch` recibidos
  en cada beacon, así que un maestro sin WiFi sigue manteniendo a todos
  despiertos en el mismo instante aunque el timestamp no sea exacto.
- **Resiliencia de red**: el backend espera un `POST /logs/sensor/` por
  cada sensor (no un JSON agregado por ciclo), así que cada ciclo puede
  generar hasta `NUM_SLAVES * SENSORS_PER_SLAVE` peticiones. Solo se
  intentan subir/bufferizar las lecturas de esclavos que respondieron y de
  sensores que se leyeron bien — un esclavo en timeout o un sensor en fallo
  simplemente no genera petición (nunca se sube un 0.0 falso). Las que
  fallan se guardan en `/buffer.jsonl` (LittleFS) y se reintentan en el
  siguiente ciclo, antes de subir las nuevas. El buffer descarta lo más
  antiguo si se acumulan más de `MAX_BUFFERED_PAYLOADS` sin subir.
- **Resiliencia de radio**: cada esclavo tiene un timeout de espera de
  beacon y otro de espera de su turno de sondeo; si cualquiera expira,
  el esclavo vuelve a dormir en vez de quedarse escuchando indefinidamente
  (para no agotar la batería).
- **Backend por ngrok**: `httpPostJson()` usa `WiFiClientSecure` con
  `setInsecure()` (no valida el certificado TLS de ngrok) y añade la
  cabecera `ngrok-skip-browser-warning`, sin la cual ngrok responde con su
  página HTML de aviso en vez de reenviar la petición al backend.
- **Hora en las lecturas**: el campo `fecha_hora` va en hora **local**, no
  UTC (así lo espera el backend), usando `GMT_OFFSET_SEC`/
  `DAYLIGHT_OFFSET_SEC` (+1h base, +1h más asumiendo siempre horario de
  verano). Esto no distingue invierno/verano — si el backend lo corrige
  más adelante, hay que ajustar esas dos constantes a la vez. El epoch UTC
  interno (`rtcEpoch`, usado solo para el protocolo LoRa) es independiente
  de este offset y no se ve afectado.
- **Diagnóstico**: el voltaje de batería de cada esclavo viaja en cada una
  de sus lecturas subidas (campo `bateria`); el del propio maestro solo se
  muestra en pantalla/Serial, el backend actual no tiene un campo para él.
- La potencia LoRa por defecto (`LORA_TX_POWER_DBM 14`) es un límite típico
  para EU868; revisa la normativa local si cambias de banda o necesitas
  más alcance.
- **Pantalla OLED**: `oledLog()` va mostrando en pantalla (y por Serial a la
  vez) cada paso relevante del ciclo — beacon, resultado por esclavo/sensor,
  conexión WiFi, subida — como un log de las últimas 6 líneas. Queda
  encendida durante toda la ventana activa (unos segundos, a veces por debajo
  de un minuto con WiFi de por medio) y se apaga por completo (comando
  `DISPLAYOFF`, no solo en negro) justo antes del deep sleep, que es donde
  se pasan las horas de verdad. No se apaga/enciende varias veces dentro de
  un mismo ciclo porque la ventana activa ya es corta frente al deep sleep;
  si el consumo de la pantalla resulta mayor de lo esperado en la práctica,
  se puede ajustar para que solo se encienda en momentos puntuales.

## Pendiente

- Fijar en la web el valor definitivo del intervalo de ciclo dentro de 2-6h
  (ver sección 8 del documento de contexto). Ya no requiere reflashear, pero
  sigue sin decidirse; `DEFAULT_CYCLE_INTERVAL_SEC` está en 30s, que es un
  valor de banco de pruebas y no de campo.
- Confirmar que `parcela_id == SLAVE_ID` es correcto contra el backend real
  — es una asunción mía a partir del cliente de referencia, no algo
  confirmado explícitamente.
- La URL de ngrok es un túnel temporal (ver checklist punto 7); en algún
  momento conviene un dominio fijo o hosting permanente para no tener que
  reflashear cada vez que se reinicia.
- `vinalert_maestro/config.h` ahora lleva un token Bearer real en claro. Si
  este repositorio se sube a algún sitio compartido o público, hay que
  tratarlo como secreto (sacarlo a un archivo ignorado por git, variable de
  entorno al compilar, etc.) en vez de dejarlo committeado.
- Botón físico para encender la pantalla bajo demanda (fuera del ciclo de
  medición). Idea mencionada para más adelante, todavía sin diseñar ni
  implementar.
