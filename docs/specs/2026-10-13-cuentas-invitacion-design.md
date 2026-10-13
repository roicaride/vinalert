# Cuentas: alta por invitación, recuperar contraseña y límite de intentos

Fecha: 2026-10-13
Rama: `feat/cuentas-invitacion`, sobre `fix/bloqueantes-produccion` (necesita
`usuarios.es_superadmin`).

## Contexto

Viñalert va a pasar a producción. La auditoría previa encontró que el sistema
de cuentas solo tiene tres endpoints (`/auth/register`, `/auth/token`,
`/auth/me`) y que eso deja varios huecos:

- **Registro libre sin verificar el email.** Cualquiera puede registrar el email
  de otra persona antes que ella; cuando un gestor "añade a Juan" por email,
  el acceso se lo lleva quien registró la cuenta.
- **Sin recuperación de contraseña.** Quien la olvida no tiene salida salvo
  escribir al administrador, que tampoco tiene forma de cambiarla.
- **Sin límite de intentos.** Se pueden probar contraseñas sin fin contra
  cualquier cuenta, incluida la del admin.
- **Sesiones irrevocables.** Un token dura 7 días y no hay forma de anularlo:
  ni cerrando sesión, ni cambiando la contraseña.
- **El interceptor del 401 en la web** trata una contraseña incorrecta como
  "sesión caducada" y deja `destino=/login`, de modo que tras acertar la
  contraseña el usuario se queda en el formulario. Además, un fallo de red al
  abrir la app cierra la sesión (`SesionContext` limpia ante cualquier error).

## Objetivo

- Que solo entre quien ha sido invitado, con el email verificado de serie.
- Que quien olvide la contraseña la recupere solo, por email.
- Que no se puedan probar contraseñas sin límite, por cuenta ni por IP.
- Que cambiar o restablecer la contraseña cierre las demás sesiones.
- Que la web distinga "contraseña incorrecta", "demasiados intentos" y
  "sesión caducada".

## Fuera de alcance

- Mover el token de `localStorage` a una cookie `HttpOnly`. Es la mejora
  siguiente, pero cambia CORS, CSRF y el cliente HTTP; va en su propio cambio.
- 2FA.
- Desactivar o borrar cuentas desde el panel de admin (derecho de supresión
  del RGPD). Se hará aparte; `token_version` ya deja preparado cortar sesiones.
- Editar el perfil (nombre, teléfono).
- Plantillas de email con diseño de marca: texto plano más un HTML mínimo.

## Decisiones tomadas

**Solo por invitación; se elimina `/auth/register`.** Es un producto B2B con
clientes conocidos. Invitar verifica el email por construcción (el enlace llega
a ese buzón) y elimina el robo de acceso registrando el email de otro, el
oráculo de "email ya registrado" y la creación masiva de cuentas basura. El
registro con verificación resolvía lo primero pero no lo demás.

**Invitan el superadmin y los gestores.** El superadmin da de alta clientes
nuevos (cuenta sin parcelas; el cliente crea las suyas). Un gestor invita a su
parcela con un rol, por el mismo `POST /parcelas/{id}/usuarios` de hoy. Si solo
invitase el admin, cada empleado de cada bodega pasaría por él.

**La invitación crea ya la cuenta, pendiente (sin contraseña).** La alternativa
—guardar la invitación aparte y crear la cuenta al aceptar— obliga a guardar
también el rol y la parcela en la invitación y a materializarlos después, y la
persona invitada no aparecería en Miembros hasta aceptar. Con la cuenta
pendiente, el acceso a la parcela existe desde el primer momento, la lista de
miembros la muestra con la marca "Pendiente" y aceptar consiste solo en poner
nombre y contraseña. Una cuenta pendiente es `hashed_password IS NULL`: no hace
falta otra columna de estado.

**Tokens opacos, guardados hasheados, de un solo uso.** `secrets.token_urlsafe(32)`
en el enlace y su SHA-256 en la BD: con un volcado de la BD los enlaces vivos no
sirven. SHA-256 sin sal basta porque el token tiene 256 bits de entropía; no es
una contraseña. Pedir uno nuevo del mismo tipo anula los anteriores, para que
solo el último email recibido funcione.

**Invitaciones y recuperaciones en una sola tabla.** Comparten forma (usuario,
hash, caducidad, uso) y reglas. Una columna `tipo` las distingue.

**Contadores en PostgreSQL, no en memoria.** Sobreviven a reinicios, valen con
varios procesos, permiten limitar por cuenta (no solo por IP) y dejan un
registro de accesos. En memoria, cada reinicio de la API pondría los contadores
a cero.

**El bloqueo es por ventana deslizante y temporal, nunca permanente.** Un
bloqueo permanente tras N fallos permitiría a cualquiera dejar sin acceso a una
cuenta ajena a propósito. Recuperar la contraseña sigue funcionando con la
cuenta bloqueada.

**`token_version` en lugar de una lista de sesiones.** Un entero por usuario,
dentro de cada JWT (claim `ver`). Subirlo invalida todas sus sesiones de golpe,
que es justo lo que piden restablecer la contraseña, cambiarla y "cerrar sesión
en todos los dispositivos". No permite cerrar una sesión concreta; nadie lo ha
pedido. Los tokens emitidos antes de este cambio no llevan `ver` y se tratan
como `ver = 0`, que coincide con el valor inicial: nadie pierde la sesión al
desplegar.

**SMTP estándar, sin SDK de proveedor.** Cambiar de proveedor es cambiar el
`.env`. Para empezar se propone Brevo (Francia: sin transferencias fuera de la
UE; 300 emails/día gratis). Sin `SMTP_HOST`, el email se escribe en el log: en
desarrollo funciona sin configurar nada y el enlace se copia de la consola.

**Emails en segundo plano (`BackgroundTasks`).** Una respuesta que esperase al
servidor SMTP tardaría distinto según exista o no la cuenta, y eso delataría
qué emails están registrados. Si el envío falla, se registra en el log; la
invitación se puede reenviar.

**Mínimo de 10 caracteres y lista de contraseñas comunes, solo para
contraseñas nuevas.** Las cuentas actuales con 8 siguen entrando; se les exige
el mínimo nuevo al cambiarla. La lista (unas cien, incluidas las del propio
proyecto: `admin123`, `vinalert123`, `change_me`…) va en el código.

## Modelo de datos

Migración `migracion_2026_10_13_cuentas.sql` (idempotente):

**`usuarios`**
- `hashed_password` pasa a admitir NULL (cuenta pendiente).
- `token_version INTEGER NOT NULL DEFAULT 0`.

**`tokens_cuenta`** (nueva)
| columna | tipo | nota |
|---|---|---|
| id | serial PK | |
| usuario_id | int FK usuarios, NOT NULL, ON DELETE CASCADE | |
| tipo | varchar NOT NULL | `invitacion` \| `recuperacion` |
| hash_token | varchar(64) NOT NULL UNIQUE | SHA-256 hex |
| creado_en | timestamp NOT NULL | hora de Madrid sin zona, como el resto |
| caduca_en | timestamp NOT NULL | invitación +7 días, recuperación +1 hora |
| usado_en | timestamp NULL | |
| creado_por_id | int FK usuarios NULL | quién invitó |
| parcela_id | int FK parcelas NULL, ON DELETE SET NULL | a qué parcela, si fue un gestor |

Índice en `(usuario_id, tipo)`.

**`intentos_acceso`** (nueva)
| columna | tipo | nota |
|---|---|---|
| id | serial PK | |
| momento | timestamp NOT NULL | |
| tipo | varchar NOT NULL | `login` \| `recuperacion` |
| email | varchar NOT NULL | normalizado (minúsculas, sin espacios) |
| ip | varchar NOT NULL | |
| resultado | varchar NOT NULL | `exito` \| `fallo` \| `bloqueado` |

Índices en `(email, tipo, momento)` y `(ip, tipo, momento)`. Un job diario del
scheduler borra intentos de más de 90 días y tokens caducados hace más de 30.

## Límites

Todos los recuentos usan un reloj inyectable (`app/services/reloj.py`, una
función `ahora()`) para poder probarlos sin esperar.

**Login (`/auth/token`)**, comprobado en este orden antes de mirar la contraseña:
1. **Por IP:** si la IP suma 20 intentos `exito`+`fallo` de tipo `login` en los
   últimos 15 min → 429.
2. **Por cuenta:** si el email suma 5 `fallo` de tipo `login` en los últimos
   15 min, posteriores a su último `exito` y al último restablecimiento de
   contraseña → 429.

El 429 lleva `Retry-After` (segundos) y
`detail: {"codigo": "demasiados_intentos", "minutos": N}`, con N el tiempo hasta
que el fallo más antiguo de los contados salga de la ventana. Los intentos
rechazados por el límite se guardan como `bloqueado` y no cuentan para el
límite: así el bloqueo dura como mucho 15 minutos desde el quinto fallo, aunque
se sigan enviando peticiones.

**Recuperar (`/auth/recuperar`)**
- Por IP: 10 por hora → 429 (no revela nada sobre ningún email).
- Por email: 3 por hora → se responde el mismo 202 de siempre, pero no se envía
  nada. Un 429 aquí confirmaría que la cuenta existe.

**IP real.** Se usa `request.client.host`. Detrás de un proxy, la API debe
arrancarse con `--proxy-headers --forwarded-allow-ips=<ip del proxy>`, o todas
las peticiones compartirían la IP del proxy. Se documenta en el README.

## Endpoints

**Sesión**
- `POST /auth/token` (cambia). Límites, después contraseña. Sin usuario o con
  cuenta pendiente se verifica contra un hash ficticio, para tardar lo mismo.
  401 `Email o contraseña incorrectos` · 429 como arriba. El JWT lleva `ver`.
- `get_current_user` (cambia): rechaza con 401 un token cuyo `ver` no coincida
  con `usuario.token_version`, y cualquier token de una cuenta pendiente.
- `POST /auth/cambiar-password {actual, nueva}`. 400 si `actual` no es
  correcta; ese fallo cuenta como `fallo` de login de la cuenta (con una sesión
  robada no se puede probar contraseñas sin límite). Sube `token_version` y
  devuelve un `Token` nuevo, para que quien la cambia siga dentro.
- `POST /auth/cerrar-sesiones` → 204. Sube `token_version`.
- `POST /auth/register` **se elimina** (404).

**Recuperar**
- `POST /auth/recuperar {email}` → 202 siempre, con el mismo cuerpo. Si la
  cuenta existe y no ha superado su límite: si tiene contraseña, token de
  `recuperacion` y email con `URL_WEB/restablecer?token=…`; si está pendiente,
  se reenvía la invitación.
- `POST /auth/restablecer {token, password}` → 204. 400
  `{"codigo": "enlace_invalido"}` si el token no existe, caducó o ya se usó
  (los tres casos con el mismo mensaje). Guarda el hash nuevo, marca el token
  usado y sube `token_version`. Cuenta como restablecimiento para el límite de
  login (desbloquea).

**Invitaciones**
- `POST /parcelas/{id}/usuarios {email, rol}` (cambia; requiere gestión). Si
  la cuenta existe: como hoy. Si no: crea la cuenta pendiente (nombre vacío
  hasta aceptar), el acceso con ese rol, un token de `invitacion` y envía el
  email. 201 con `MiembroResp` que ahora incluye `pendiente: bool`. El email
  se busca en minúsculas (arregla que hoy no encuentre cuentas guardadas con
  mayúsculas). Si la cuenta existe pero está pendiente, se añade el acceso y se
  reenvía la invitación.
- `POST /admin/invitaciones {email, nombre}` (superadmin) → 201
  `UsuarioAdminResp`. 409 si el email ya tiene cuenta.
- `POST /auth/invitaciones/{usuario_id}/reenviar` → 204. Permitido al
  superadmin o a un gestor de alguna parcela de esa persona; 404 en otro caso
  (igual que una parcela ajena). 409 si la cuenta ya no está pendiente.
- `GET /auth/invitacion?token=` → `{email, invitado_por, parcela}` (nombres, o
  null). 400 `enlace_invalido` como arriba.
- `POST /auth/invitacion/aceptar {token, nombre, password}` → `Token` (entra
  directamente).

`GET /parcelas/{id}/usuarios` y `GET /admin/usuarios` añaden `pendiente` a cada
fila.

## Email

`app/services/correo.py`:
- `enviar(destinatario, asunto, texto, html)`: `smtplib` con STARTTLS (puerto
  587) o SSL (465), según `SMTP_PORT`. Sin `SMTP_HOST`, escribe el email en el
  log con nivel WARNING.
- `enviar_invitacion(...)` y `enviar_recuperacion(...)` componen el texto.
  Español, texto plano más un HTML mínimo. El enlace y su caducidad, y quién
  invita y a qué parcela.

Variables nuevas en `.env.example`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USUARIO`,
`SMTP_PASSWORD`, `CORREO_REMITENTE`, `URL_WEB`. `URL_WEB` es obligatoria si
`SMTP_HOST` está definida: sin ella los enlaces no se pueden construir, y la API
no arranca.

## Frontend

- **Login:**
  - Sin modo registro; aparece el enlace "¿Has olvidado tu contraseña?".
  - Un 401 muestra "Email o contraseña incorrectos".
  - Un 429 muestra "Demasiados intentos. Espera N min o recupera tu contraseña",
    con enlace a recuperar.
- **`/recuperar`:** campo de email. Tras enviar, siempre el mismo mensaje.
- **`/restablecer?token=`:** contraseña nueva y su repetición. Si el enlace no
  vale, se explica y se ofrece pedir otro.
- **`/invitacion?token=`:**
  - Muestra quién invita y a qué parcela, con el email fijo y campos para
    nombre y contraseña.
  - Al aceptar guarda la sesión y entra en `/parcelas`.
- **Miembros:**
  - Si el email no tiene cuenta, invita en lugar de dar error.
  - Las personas pendientes llevan la marca "Pendiente" y el botón "Reenviar
    invitación".
- **Administración:** formulario "Invitar cliente" con email y nombre. El
  listado marca las cuentas pendientes.
- **`/cuenta` (Mi cuenta):** enlace en la cabecera. Cambiar contraseña y
  "Cerrar sesión en todos los dispositivos".
- **Portada:** "Crear cuenta" pasa a "Solicitar acceso" (`mailto:` a
  `CORREO_CONTACTO`).
- **Sesión:**
  - El interceptor del 401 no actúa en las rutas `/auth/token`,
    `/auth/recuperar`, `/auth/restablecer` y `/auth/invitacion*`, ni cuando
    no había token.
  - `destino` solo se acepta si empieza por `/`, no por `//`, y no es `/login`.
  - `SesionContext` solo limpia la sesión ante un 401 de `/auth/me`. Ante un
    error de red mantiene el token y muestra "Sin conexión" con un botón de
    reintentar.

Las pantallas siguen la identidad visual actual (LOUSA, radio 0, `ui/`).

## Pruebas

TDD: cada comportamiento empieza con un test que falla.

- **Tests existentes.** Muchos crean usuarios con `POST /auth/register`, que
  desaparece. Se sustituye por un helper `crear_usuario(db_session, email,
  password)` en `tests/ayudas.py`, y la fixture `auth_headers` pasa a usarlo.
- **Límites:**
  - El 6.º fallo de una cuenta da 429 y el 21.º intento de una IP también.
  - El bloqueo expira a los 15 min (reloj inyectado).
  - Los intentos `bloqueado` no alargan el bloqueo.
  - Un login correcto y un restablecimiento resetean el recuento de la cuenta.
  - El límite por email de recuperación no se nota en la respuesta.
- **Tokens:**
  - Son de un solo uso y caducan.
  - Pedir uno nuevo anula el anterior.
  - En la BD solo está el hash.
  - Invitación y recuperación no son intercambiables.
- **Sesión:**
  - Subir `token_version` invalida los tokens anteriores.
  - Un token sin `ver` vale si `token_version` es 0.
  - Una cuenta pendiente no puede hacer login.
- **Invitar:**
  - Lo hace un gestor; un lector, no.
  - Un email con mayúsculas encuentra la cuenta.
  - Un email ya pendiente se añade y se reenvía.
  - El superadmin invita clientes; un gestor, no.
  - Reenviar: los permisos y el 409.
- **Email:** SMTP sustituido por un doble que guarda los mensajes. Se comprueba
  el destinatario, el enlace y que sin `SMTP_HOST` no se intenta conectar.
- **`/auth/register`:** devuelve 404.
- **Matriz de permisos:** los endpoints nuevos con ámbito de parcela entran en
  `test_matriz_permisos.py`.
- **Frontend:**
  - Cada pantalla nueva con sus estados de error.
  - Los tres arreglos de sesión (401 del login, `destino`, error de red).

## Despliegue

1. Aplicar `migracion_2026_10_13_superadmin.sql` (si no se aplicó) y
   `migracion_2026_10_13_cuentas.sql`.
2. Configurar en el `.env` `SMTP_*`, `CORREO_REMITENTE` y `URL_WEB`.
3. En Brevo, verificar el dominio remitente (registros SPF y DKIM en el DNS);
   sin eso, los emails acaban en spam.
4. Si la API va detrás de un proxy, arrancarla con `--proxy-headers`.
