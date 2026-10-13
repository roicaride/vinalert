# Cuentas por invitación — plan de implementación

> **Para agentes:** se ejecuta tarea a tarea con TDD (superpowers:executing-plans).
> Cada tarea termina con la suite en verde y un commit.

**Objetivo:** alta solo por invitación, recuperar contraseña por email, límite de
intentos por cuenta e IP, sesiones revocables y arreglos de sesión en la web.

**Arquitectura:** cuatro servicios pequeños en `app/services/`: `reloj`,
`limites`, `tokens_cuenta` y `correo`. Las rutas nuevas van en
`app/routers/auth.py`, la invitación de gestores en `miembros.py` y la del admin
en `admin.py`. En la web: tres pantallas públicas (`Recuperar`, `Restablecer` e
`Invitacion`) y una privada (`MiCuenta`).

**Tecnologías:** FastAPI, SQLAlchemy y `smtplib` (biblioteca estándar, sin
dependencias nuevas); React con react-router y vitest.

**Spec:** `docs/specs/2026-10-13-cuentas-invitacion-design.md`

## Restricciones globales

- Bloqueo por cuenta: 5 fallos de login en 15 min, contados después del último
  éxito y del último restablecimiento. Bloqueo por IP: 20 intentos de login en
  15 min.
- Recuperación: 10 por IP y hora (429), 3 por email y hora (sin envío y sin que
  se note en la respuesta).
- Invitación válida 7 días; recuperación, 1 hora. Un solo uso. Pedir un enlace
  nuevo anula el anterior del mismo tipo.
- Contraseña nueva: mínimo 10 caracteres y fuera de la lista de comunes.
- `intentos_acceso` y `tokens_cuenta` guardan UTC sin zona.
- Los tokens sin claim `ver` valen como `ver = 0`.
- El email se normaliza siempre: `strip().lower()`.

## Puntos que vigilar en la revisión

1. Un email con mayúsculas o espacios en login, recuperación e invitación debe
   tratarse como el mismo email (test en las tareas 4, 6 y 7).
2. Pedir recuperación para una cuenta pendiente reenvía la invitación, no envía
   un enlace de restablecer (test en la tarea 6).
3. Aceptar la misma invitación dos veces: la segunda falla con
   `enlace_invalido` (test en la tarea 7).
4. Un gestor que invita el email de una cuenta ya activa solo la añade, sin
   enviar nada ni tocar su contraseña (test en la tarea 7).
5. Una sesión abierta antes de restablecer la contraseña deja de valer (test en
   la tarea 6).

---

### Tarea 1: tests sin `/auth/register`

**Archivos:** `tests/conftest.py` y `tests/ayudas.py`; las 15 llamadas a
`/auth/register` en tests.

**Produce:** `registrar(client, email, nombre="Persona", password="clave12345") -> Usuario`
en `tests/ayudas.py`. Crea el usuario directamente en `client.db`, que es la
sesión de test que la fixture `client` cuelga del `TestClient`.

- [ ] En `client`, añadir `test_client.db = db_session`.
- [ ] Escribir `registrar` con `obtener_password_hash`, el email normalizado y
  `rol="agricultor"`.
- [ ] Sustituir cada `client.post("/auth/register", json={...})` por
  `registrar(client, ...)`. `test_autorizacion` (el registro no puede fijar el
  rol) se reescribe en la tarea 3: el endpoint desaparece.
- [ ] Ejecutar `pytest -q`: todo en verde. Commit.

### Tarea 2: modelo, migración y reloj

**Archivos:** crear `app/services/reloj.py` y `migracion_2026_10_13_cuentas.sql`;
modificar `app/models.py`. Tests en `tests/test_modelo_cuentas.py`.

**Produce:**
- `reloj.ahora_utc() -> datetime`: UTC sin zona. Los tests lo sustituyen con
  `monkeypatch`.
- `Usuario.token_version`: int, 0 por defecto. `Usuario.hashed_password`
  admite NULL. Propiedad `Usuario.pendiente`, verdadera si `hashed_password is None`.
- `TokenCuenta`: `id`, `usuario_id`, `tipo`, `hash_token`, `creado_en`,
  `caduca_en`, `usado_en`, `creado_por_id` y `parcela_id`, con las relaciones
  `usuario`, `creado_por` y `parcela`.
- `IntentoAcceso`: `id`, `momento`, `tipo`, `email`, `ip` y `resultado`.

- [ ] Test: un usuario nuevo tiene `token_version == 0` y `pendiente is False`.
  Uno sin contraseña tiene `pendiente is True`. Se pueden guardar `TokenCuenta`
  e `IntentoAcceso`.
- [ ] Implementar. Escribir la migración: `ALTER COLUMN hashed_password DROP NOT NULL`,
  `ADD COLUMN IF NOT EXISTS token_version`, `CREATE TABLE IF NOT EXISTS` y los
  índices.
- [ ] Suite en verde. Commit.

### Tarea 3: sesión versionada, contraseñas y fin del registro

**Archivos:** `app/auth.py`, `app/deps.py`, `app/routers/auth.py` y
`app/schemas.py`; crear `app/services/politica_password.py`. Tests en
`tests/test_sesion_versionada.py` y `tests/test_politica_password.py`.
Reescribir `tests/test_autorizacion.py::test_registro*`.

**Produce:**
- `crear_token_sesion(usuario) -> str`: JWT con `sub` y `ver`.
- `politica_password.validar(password) -> None`: lanza `ValueError` con un
  mensaje en español.
- El tipo `PasswordNueva = Annotated[str, AfterValidator(...)]` en `schemas`.

- [ ] Tests:
  - Un token con `ver` antiguo da 401 tras subir `token_version`.
  - Un token sin `ver` vale con `token_version` 0.
  - Una cuenta pendiente no hace login (401) ni le vale ningún token.
  - `POST /auth/register` da 404 o 405.
  - La política rechaza 9 caracteres y `Vinalert123` (está en la lista; la
    comparación ignora mayúsculas), y acepta 10 caracteres que no estén en la
    lista.
- [ ] Implementar:
  - `login` verifica contra `_HASH_FICTICIO` si no hay usuario o está pendiente.
  - `get_current_user` compara `payload.get("ver", 0)` con `token_version` y
    rechaza las cuentas pendientes.
  - Borrar `register` y `UsuarioCreate`.
- [ ] Suite en verde. Commit.

### Tarea 4: límite de intentos de login

**Archivos:** crear `app/services/limites.py`; modificar `app/routers/auth.py`.
Tests en `tests/test_limite_login.py`.

**Produce (`limites`):**
- `bloqueo_login(db, email, ip) -> Optional[int]`: minutos de espera, o `None`
  si no hay bloqueo.
- `registrar_intento(db, tipo, email, ip, resultado)`.
- `bloqueo_recuperacion_ip(db, ip) -> bool` y `recuperacion_email_agotada(db, email) -> bool`.
- `marcar_restablecimiento(db, email)`: guarda un `exito` de tipo
  `restablecimiento`, que corta la ventana del bloqueo por cuenta.

- [ ] Tests, con el reloj fijado:
  - Del 1.º al 5.º fallo, 401; el 6.º, 429 con `Retry-After`,
    `detail.codigo == "demasiados_intentos"` y `minutos` entre 1 y 15.
  - Con 16 min más en el reloj, vuelve a admitir intentos.
  - Los intentos rechazados por el bloqueo no alargan la espera.
  - Un login correcto pone el recuento a cero.
  - 20 intentos desde la misma IP con emails distintos: el 21.º da 429.
  - `" ANA@x.es "` y `"ana@x.es"` cuentan como la misma cuenta.
- [ ] Implementar en `login_for_access_token(request: Request, ...)`:
  comprobar el límite, verificar la contraseña, registrar el intento y lanzar
  el 429 con `headers={"Retry-After": str(minutos * 60)}`.
- [ ] Suite en verde. Commit.

### Tarea 5: correo

**Archivos:** crear `app/services/correo.py`; modificar `.env.example`.
Tests en `tests/test_correo.py`.

**Produce:**
- `enviar(destinatario, asunto, texto, html) -> None`.
- `enviar_invitacion(destinatario, enlace, invitado_por: Optional[str], parcela: Optional[str])`.
- `enviar_recuperacion(destinatario, enlace)`.
- `url_web() -> str`.
- `validar_configuracion()`: se llama al importar `app.main`. Lanza
  `RuntimeError` si hay `SMTP_HOST` pero falta `URL_WEB`.

- [ ] Tests:
  - Sin `SMTP_HOST` no se instancia `smtplib.SMTP` (doble que falla si se usa)
    y el mensaje sale en el log.
  - Con `SMTP_HOST` y el puerto 587 se llama a `starttls`, `login` y
    `send_message` con el destinatario y el enlace.
  - Con el puerto 465 se usa `SMTP_SSL`.
  - `validar_configuracion` lanza el error si falta `URL_WEB`.
- [ ] Implementar. Ningún fallo de envío se propaga: se registra con
  `logger.exception`.
- [ ] Suite en verde. Commit.

### Tarea 6: tokens de cuenta, recuperar y restablecer

**Archivos:** crear `app/services/tokens_cuenta.py`; modificar
`app/routers/auth.py` y `app/schemas.py`. Tests en `tests/test_recuperar.py`.

**Produce (`tokens_cuenta`):**
- `emitir(db, usuario, tipo, creado_por=None, parcela=None) -> str`: devuelve el
  token en claro y anula los anteriores del mismo tipo.
- `consumir(db, token, tipo) -> Usuario`: lanza `TokenInvalido`.
- `consultar(db, token, tipo) -> TokenCuenta`: lanza `TokenInvalido`.
- `enviar_invitacion_a(db, usuario, background, creado_por=None, parcela=None)`:
  emite el token y programa el email con `BackgroundTasks`.

- [ ] Tests:
  - `POST /auth/recuperar` da 202 con el mismo cuerpo exista o no el email;
    solo hay mensaje (correo doble) si existe.
  - En la BD el token está hasheado y no aparece en claro.
  - `restablecer` cambia la contraseña y una sesión anterior da 401.
  - Reutilizar el token, usar uno caducado (reloj +61 min) o uno anulado por
    otro más nuevo da 400 `enlace_invalido`.
  - Un token de invitación no sirve para restablecer.
  - El 4.º `recuperar` de un email en una hora no envía nada y sigue dando 202.
  - El 11.º de una IP da 429.
  - Una cuenta pendiente recibe la invitación.
  - Restablecer desbloquea el login.
- [ ] Implementar `/auth/recuperar` y `/auth/restablecer`.
- [ ] Suite en verde. Commit.

### Tarea 7: invitaciones

**Archivos:** `app/routers/miembros.py`, `app/routers/admin.py`,
`app/routers/auth.py` y `app/schemas.py`. Tests en `tests/test_invitaciones.py`;
actualizar `tests/test_miembros.py` (el 404 de "debe registrarse" desaparece) y
`tests/test_matriz_permisos.py`.

**Produce:** `MiembroResp.pendiente` y `UsuarioAdminResp.pendiente`;
los esquemas `InvitacionAdminCreate`, `InvitacionInfo` y `AceptarInvitacion`.

- [ ] Tests:
  - Un gestor invita un email nuevo: 201 `pendiente`, se crea el acceso y se
    envía el email con el enlace.
  - Un email existente con mayúsculas se encuentra y no se envía nada.
  - Un email ya pendiente se añade a la segunda parcela y se reenvía.
  - Un lector no puede invitar (403).
  - `GET /auth/invitacion` devuelve el email, quién invita y la parcela.
  - Aceptar devuelve un token válido para `/auth/me`; aceptar dos veces da 400.
  - Reenviar: lo puede hacer un gestor de una parcela de esa persona o el
    superadmin; un ajeno recibe 404; si la cuenta ya está activa, 409.
  - El admin invita un cliente: 201; si el email existe, 409; un gestor recibe 403.
- [ ] Implementar. Añadir a la matriz
  `POST /auth/invitaciones/{uid}/reenviar` como ruta fuera de parcela, con
  sus propios tests.
- [ ] Suite en verde. Commit.

### Tarea 8: cambiar contraseña, cerrar sesiones y limpieza

**Archivos:** `app/routers/auth.py`, `app/main.py` y
`app/services/limites.py` (`limpiar_antiguos`). Tests en
`tests/test_mi_cuenta.py` y `tests/test_consolidacion_scheduler.py` (el job
nuevo queda programado).

- [ ] Tests:
  - `cambiar-password` con la actual incorrecta da 400 y cuenta como fallo de
    login (cinco veces seguidas acaban en bloqueo).
  - Con la actual correcta, la sesión vieja da 401, la nueva vale y la
    contraseña nueva entra.
  - `cerrar-sesiones` da 204 y el token anterior pasa a dar 401.
  - `limpiar_antiguos` borra intentos de más de 90 días y tokens caducados hace
    más de 30.
  - El job `limpiar_accesos` está programado.
- [ ] Implementar. Suite en verde. Commit.

### Tarea 9: web, cliente y sesión

**Archivos:** `vinalert-front/src/api/cliente.js`, `api/auth.js`,
`sesion/SesionContext.jsx`, `pantallas/Login.jsx` (solo `destino`) y sus tests.

**Produce, en `api/auth.js`:**
- `recuperar(email)`.
- `restablecer(token, password)`.
- `verInvitacion(token)`.
- `aceptarInvitacion(token, nombre, password)`: guarda el token.
- `cambiarPassword(actual, nueva)`: guarda el token nuevo.
- `cerrarSesiones()`.

Se borra `registro`. En `cliente.js` se añade `destinoSeguro(valor) -> string`.

- [ ] Tests:
  - Un 401 de `/auth/token` no llama al manejador ni limpia nada.
  - Un 401 sin token guardado tampoco lo llama.
  - `destinoSeguro('/login') === '/'`, `destinoSeguro('//evil.com') === '/'` y
    `destinoSeguro('/p/1/estado') === '/p/1/estado'`.
  - Un error de red en `/auth/me` conserva el token y muestra "Sin conexión"
    con reintentar; un 401 lo limpia.
- [ ] Implementar. Suite del front en verde. Commit.

### Tarea 10: web, pantallas públicas

**Archivos:** `pantallas/Login.jsx`; crear `pantallas/Recuperar.jsx`,
`pantallas/Restablecer.jsx` y `pantallas/Invitacion.jsx`; añadir sus rutas en
`App.jsx`; `errores/MensajeError.jsx` (el 429). Tests al lado de cada pantalla.

- [ ] Tests:
  - Login no tiene modo registro y enlaza a `/recuperar`; un 401 muestra
    "Email o contraseña incorrectos." y un 429 "Espera N min".
  - Recuperar muestra siempre el mismo mensaje.
  - Restablecer exige que las dos contraseñas coincidan, y ante
    `enlace_invalido` ofrece pedir otro.
  - Invitación muestra quién invita y la parcela, y al aceptar navega a
    `/parcelas`; con un enlace inválido muestra el error.
- [ ] Implementar. Suite en verde. Commit.

### Tarea 11: web, Miembros, Administración, Mi cuenta y Portada

**Archivos:** `pantallas/Miembros.jsx`, `api/miembros.js` (`reenviarInvitacion`),
`pantallas/Administracion.jsx`, `api/admin.js` (`invitarCliente`); crear
`pantallas/MiCuenta.jsx` con su ruta `/cuenta`; `layout/CabeceraCuenta.jsx`,
`layout/AppLayout.jsx` (enlace) y `pantallas/Portada.jsx`.

- [ ] Tests:
  - Miembros muestra "Pendiente", reenvía, y el texto de ayuda ya no dice
    "debe estar registrada".
  - Administración invita y muestra el aviso.
  - Mi cuenta cambia la contraseña (guarda el token nuevo) y "cerrar sesión en
    todos" limpia la sesión y navega a `/login`.
  - Portada: "Solicitar acceso" es un `mailto:`.
- [ ] Implementar. Suite en verde. Commit.

### Tarea 12: documentación y verificación final

- [ ] README: tabla de configuración (SMTP, `URL_WEB`), migración nueva,
  `--proxy-headers` y la sección "Accounts".
- [ ] `pytest -q`, `npx vitest run` y `npx eslint` sobre los archivos tocados.
- [ ] Aplicar `migracion_2026_10_13_cuentas.sql` en la BD local (copia antes).
  Arrancar la API y comprobar a mano login, recuperación (el enlace sale en el
  log) e invitación.
- [ ] Commit.
