# Aplicación web: cimientos, sesión y permisos

Fecha: 2026-08-19
Sub-proyecto **D1** de 4 dentro de la reestructuración de la web (D).
Siguientes: D2 (configuración), D3 (estado y registro), D4 (análisis).
Anteriores, ya completados y mergeados: cimientos de datos, A (scheduler), B (acceso multiusuario), C (configuración desde la app).

## Contexto

VinAlert es una API FastAPI + PostgreSQL con un frontend React en
`vinalert-front/`. El backend ha crecido mucho —27 endpoints con ámbito de
parcela— mientras el frontend se quedó atrás: son ~980 líneas que cubren login,
elegir parcela y un panel con tres secciones, de las cuales **dos están
muertas** (mildiu y riego, cuyos motores se retiraron) y la tercera lee campos
que el backend ya no envía.

Se va a rehacer entero. Como no cabe en un solo spec, se parte en cuatro
sub-proyectos **por capas y no por funcionalidad**: D1 fija la estructura, la
sesión y cómo se representa el permiso; D2 las pantallas de configuración; D3 el
estado diario y el registro; D4 el análisis. El orden importa porque **D1 fija
cómo se refleja el permiso**, y si eso llegara tarde habría que repasar todas
las pantallas ya construidas.

### Dos agujeros que este sub-proyecto existe para cerrar

**La aplicación no sabe quién eres.** No hay ningún endpoint que devuelva el
usuario autenticado. Tras recargar la página el frontend tiene un token y nada
más: ni nombre, ni email, ni si eres admin. Y por tanto no puede saber tu rol en
una parcela sin pedir la lista de miembros y buscarte en ella, cosa que tampoco
puede hacer porque no conoce tu email. Sin resolver esto, "no mostrar acciones
que van a devolver 403" es imposible.

**La sesión miente cuando caduca.** `ProtectedRoute` solo comprueba que exista
una cadena en `localStorage`, no que valga. No hay interceptor de respuesta, así
que al caducar el token la aplicación deja navegar como si nada y **todas** las
peticiones fallan a la vez: pantallas vacías, sin explicación y sin vuelta al
login.

## Objetivo

- Que la aplicación sepa quién eres y qué puedes hacer en cada parcela.
- Que la caducidad de la sesión sea un mensaje, no un fallo mudo.
- Dejar montada la estructura —navegación, cliente de API, manejo de errores y
  tests— sobre la que D2, D3 y D4 construyen sus pantallas.

## Fuera de alcance

- **Todas las pantallas de contenido**: configuración (D2), estado y registro
  (D3), análisis (D4). D1 deja secciones vacías con un cartel de qué irá en cada
  una.
- **Móvil.** Se diseña para escritorio; el móvil se revisará después.
- **Tokens de refresco.** Decisión tomada: se alarga la caducidad en su lugar
  (ver abajo).
- **Registro de usuarios desde la web.** `/auth/register` existe y es público,
  pero dar de alta cuentas desde la interfaz es otra conversación.
- **Comparar varias parcelas entre sí.** Las gráficas de D4 vivirán dentro de
  una parcela.

## Decisiones tomadas

**El stack se mantiene: React 19, Vite 7, Tailwind 4, react-router 7, axios y
recharts.** Está todo actualizado y el enrutado funciona. "Reestructurar al
completo" significa rehacer la estructura y las pantallas, no cambiar de
herramientas: tirarlas para reescribirlas igual no aporta nada.

**`mi_rol` viaja con la parcela, no en un endpoint aparte.** La alternativa —un
`GET /parcelas/{id}/mi-rol`— añadiría una petición por pantalla para un dato que
ya puede viajar con la parcela que la pantalla pide de todos modos.

**Para el admin, `mi_rol` vale `gestor`.** El campo responde a "¿qué puede hacer
este usuario aquí?", no a "¿por qué puede hacerlo". La interfaz no necesita
distinguir un gestor de un admin; si algún día hiciera falta, el rol global ya
viaja en `/auth/me`.

**El token pasa a 7 días Y se añade el interceptor del 401.** No son
alternativas: alargar la caducidad reduce la frecuencia del fallo, no lo
elimina. Sin interceptor, cuando caduque —cada semana en vez de cada día— el
usuario seguirá viendo pantallas vacías sin explicación. Coste aceptado de los 7
días: un token robado sirve una semana y no hay forma de revocarlo.

**El permiso se declara, no se comprueba a mano en cada sitio.** Un componente
`<SoloGestor>` envuelve lo que requiere gestión, en vez de esparcir
comparaciones de cadenas por las pantallas. Si mañana aparece un tercer rol, se
cambia en un sitio. Es el mismo razonamiento que llevó la autorización del
backend a una única función.

**A un usuario de lectura se le ocultan las acciones, no se le muestran
desactivadas.** Un botón inhabilitado invita a preguntar por qué, y aquí la
respuesta nunca va a cambiar mientras no le cambien el rol. La sección de
miembros sí le dirá quién puede gestionar, que es la información útil.

**Los tests simulan la capa de axios, no un service worker.** MSW da tests más
realistas, pero es maquinaria extra que no compensa en una aplicación de este
tamaño.

## Cambios en el backend

Tres, pequeños. Ninguno añade un endpoint con ámbito de parcela, así que la
matriz de permisos de `tests/test_matriz_permisos.py` no cambia.

### 1. `GET /auth/me`

Devuelve el usuario autenticado. Requiere token; sin él, 401.

```json
{ "id": 1, "nombre": "Roi", "email": "roi@example.com", "rol": "admin" }
```

Schema nuevo `UsuarioMeResp`: como `UsuarioResp` más `rol`. No se reutiliza
`UsuarioResp` tal cual porque hoy no expone el rol, y añadírselo lo cambiaría
también en `/auth/register`, donde no hace falta.

### 2. `mi_rol` en `ParcelaResp`

Campo `mi_rol: Literal["gestor", "lectura"]`. Lo rellena un helper compartido,
`_con_mi_rol(parcela, current_user, db)`.

**Son CINCO los puntos de construcción, no cuatro.** Además de listar, crear,
obtener y editar parcelas, `ParcelaResp` va **embebido dentro de
`DashboardCompleto`** (`app/schemas.py:248`), que devuelve
`GET /parcelas/{id}/dashboard`. Ese endpoint construye la respuesta como un
diccionario y deja que Pydantic la convierta, así que un `mi_rol` obligatorio
sin rellenar ahí **no produce un campo ausente: produce un 500 en la pantalla
principal**. Es el punto que más fácil se olvida y el que peor falla.

Se descartó hacer el campo opcional para esquivarlo: un campo que a veces
llega y a veces no obliga a cada pantalla a defenderse, y acaba en interfaces
que ocultan acciones por un `undefined` en vez de por el permiso real.

Para el listado, las membresías del usuario se consultan **una sola vez** y se
resuelven en memoria: una consulta por parcela sería un N+1 gratuito.

Reglas:
- Usuario con rol global `admin` → `"gestor"`, esté o no asociado.
- Miembro con rol `gestor` → `"gestor"`.
- Miembro con rol `lectura` → `"lectura"`.
- Cualquier otro caso no puede darse: llegar a estos endpoints exige haber
  pasado por `parcela_con_lectura` o `parcela_con_gestion`.

### 3. Caducidad del token

`ACCESS_TOKEN_EXPIRE_MINUTES` pasa de `60 * 24` a `60 * 24 * 7`.

## Estructura del frontend

Se reorganiza `vinalert-front/src/` por responsabilidad. Los ficheros actuales
`MildiuSection.jsx` y `RiegoSection.jsx` **se eliminan**: son código muerto que
lee campos que el backend ya no envía.

```
src/
  api/
    cliente.js          Instancia de axios + los dos interceptores
    auth.js             login(), me()
    parcelas.js         listar(), obtener(), crear(), editar()
  sesion/
    SesionContext.jsx   Usuario actual; carga /auth/me al arrancar
    RutaProtegida.jsx   Espera a la sesión; redirige si no hay
  parcela/
    ParcelaContext.jsx  Parcela actual + mi_rol + puedeGestionar
    SoloGestor.jsx      Envuelve lo que requiere gestión
  layout/
    AppLayout.jsx       Barra lateral, cabecera, cambiador de parcela
    Navegacion.jsx      Las secciones
  pantallas/
    Login.jsx
    SeleccionParcela.jsx
    Estado.jsx          vacía en D1; la llena D3
    Configuracion.jsx   vacía en D1; la llena D2
    Sensores.jsx        vacía en D1; la llena D2
    Miembros.jsx        vacía en D1; la llena D2
    Tratamientos.jsx    vacía en D1; la llena D3
    Foliar.jsx          vacía en D1; la llena D3
    Analisis.jsx        vacía en D1; la llena D4
  errores/
    MensajeError.jsx    Traduce el código HTTP a un mensaje útil
  App.jsx
  main.jsx
```

### El cliente de API

El interceptor de petición (adjuntar el token) ya existe y no cambia. Se añade
el de **respuesta**:

- Un `401` limpia la sesión y redirige a `/login`, pasando el motivo
  (`sesion_caducada`) y la ruta a la que se iba, para volver allí tras entrar.
- Cualquier otro error se propaga: el 401 es el único que la aplicación entera
  trata igual. Un 403, un 404 o un 409 significan cosas distintas según la
  pantalla y los traduce `MensajeError`.

### Rutas

| Ruta | Qué es |
|---|---|
| `/login` | Entrada. Si ya hay sesión, redirige a la parcela. |
| `/parcelas` | Elegir parcela. Con una sola, se salta automáticamente. |
| `/p/:parcelaId` | Redirige a `/p/:parcelaId/estado`, la sección por defecto. |
| `/p/:parcelaId/estado` | Estado actual. Vacía en D1. |
| `/p/:parcelaId/configuracion` | Ajustes de la parcela. Vacía en D1. |
| `/p/:parcelaId/sensores` | Sensores. Vacía en D1. |
| `/p/:parcelaId/miembros` | Quién tiene acceso. Vacía en D1. |
| `/p/:parcelaId/tratamientos` | Cuaderno. Vacía en D1. |
| `/p/:parcelaId/foliar` | Lecturas foliares. Vacía en D1. |
| `/p/:parcelaId/analisis` | Análisis. Vacía en D1. |

Con una sola parcela —el caso normal— entrar lleva directo a ella. El
cambiador de parcela solo aparece si tienes más de una.

### Traducción de errores

`MensajeError` recibe el error de axios y da un mensaje según el código:

| Código | Mensaje |
|---|---|
| 401 | No llega aquí: lo captura el interceptor. |
| 403 | "No tienes permiso para hacer esto en esta parcela." |
| 404 | "No encontrado" — el texto concreto lo pone quien lo usa, porque un 404 de parcela y uno de miembro se explican distinto. |
| 409 | Se muestra el `detail` de la API tal cual: los 409 del backend llevan mensajes escritos para el usuario ("no puedes dejar la parcela sin ningún gestor"). |
| 422 | Se muestran los errores de validación de Pydantic, campo a campo. |
| 5xx / red | "No se pudo contactar con el servidor." |

## Testing

**Backend:** los tres cambios llevan tests en la suite existente (255 en verde
hoy). `/auth/me` sin token da 401 y con token devuelve al usuario correcto;
`mi_rol` vale `gestor` para el gestor y para el admin no asociado, y `lectura`
para el lector; el listado resuelve `mi_rol` sin una consulta por parcela; y **el dashboard
sigue respondiendo 200 con su `parcela.mi_rol` relleno**, que es el punto donde
olvidarse produce un 500.

**Frontend:** se monta Vitest, Testing Library y jsdom, con `npm test` en
`package.json`. Los tests de D1 cubren:

- El interceptor: un 401 limpia la sesión y redirige al login con el motivo.
- La sesión sobrevive a recargar: si hay token válido, `/auth/me` repuebla el
  usuario sin pasar por el login.
- `RutaProtegida` no deja pasar mientras la sesión no está resuelta — ni
  redirige antes de saberlo, que produciría un parpadeo al login en cada carga.
- `<SoloGestor>` muestra a un gestor y oculta a un lector.
- Con una sola parcela se entra directo; con varias, aparece la selección.
- `MensajeError` traduce cada código a su mensaje.

Las respuestas simuladas de la API viven en **un único fichero** derivado de
respuestas reales, no repartidas por cada test. Es la mitigación del riesgo que
se explica abajo.

## Riesgos

**Los tests con la API simulada no detectan una deriva del contrato.** Verifican
el frontend contra lo que *creemos* que devuelve el backend. Si el backend
cambia de forma, los tests siguen verdes y la aplicación se rompe. No se
resuelve con tests de extremo a extremo en este sub-proyecto —sería otro
subsistema—; se acota manteniendo las respuestas simuladas en un solo sitio y
derivadas de respuestas reales, de modo que actualizarlas sea un único cambio
visible en la revisión.

**Las decisiones de D1 se propagan a tres sub-proyectos.** Si la representación
del permiso resulta equivocada, hay que repasar todas las pantallas construidas
encima. Por eso el permiso se declara con un componente en vez de comprobarse a
mano: cambiarlo es cambiar un fichero.

**D1 no produce nada visible para el usuario final.** Al terminar se entra, se
navega y las secciones están vacías. Es intencionado —son cimientos— pero
conviene saberlo para no medirlo por lo que se ve.
