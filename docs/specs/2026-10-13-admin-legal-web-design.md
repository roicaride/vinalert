# Panel de administración, páginas legales y arreglos de la web

Fecha: 2026-10-13
Rama: `feat/admin-legal-web`, sobre `main` (que ya incluye cuentas por invitación).

## Objetivo

Que todo lo que hoy exige tocar la base de datos o el servidor se pueda hacer
desde la web, que la web tenga los textos legales que exige la normativa
española y que no tenga los fallos de la auditoría (contraste, pantalla en
blanco ante un error, un solo bloque JS de 1,2 MB, mapas sin licencia clara).

Fuera de alcance: firmware (lo lleva otra persona), ingesta fiable y despliegue
(se hablarán aparte), el rediseño visual de la web.

## Decisiones tomadas (por Roi, 2026-10-13)

- **Bajas: desactivar y eliminar.**
  - **Desactivar:** la cuenta no puede entrar, sus sesiones se cierran y se
    puede reactivar.
  - **Eliminar** (derecho de supresión): se borran nombre, email y teléfono y
    su acceso a parcelas. Las parcelas, lecturas y tratamientos se quedan,
    porque son de la explotación y el cuaderno se conserva 3 años.
- **Varios superadmins, gestionados desde el panel.** Nunca se puede quitar al
  último ni desactivarlo o eliminarlo, y nadie puede quitarse la marca a sí
  mismo, desactivarse ni eliminarse.
- **Titular de las páginas legales: el cliente**, como responsable del
  tratamiento; nosotros figuramos como encargados.
  - Sus datos se editan en el panel y las páginas los leen de ahí: cambiarlos
    no exige desplegar.
  - Mientras falte un dato, la página lo marca como pendiente, para que nunca
    se publique un texto con datos inventados.
- **Mapas: IGN de España.** Ortofoto PNOA y mapa base del IGN (CC BY 4.0,
  uso comercial permitido citando al IGN). Se retiran Esri, CARTO y
  OpenStreetMap: Esri no deja claro que se pueda usar sin licencia, y OSM y
  CARTO pueden cortar el acceso a un servicio comercial sin aviso.

## Panel de administración (superadmin)

**Cuentas:**
- Desactivar y reactivar.
- Eliminar con anonimización. Se bloquea con 409 si la persona es la única
  gestora de alguna parcela: hay que nombrar antes a otra persona.
- Conceder o quitar el superadmin.
- Conceder o quitar el "acceso a todas las parcelas" (rol `admin`).
- Enviar un enlace para restablecer la contraseña, y reenviar la invitación
  a las cuentas pendientes.
- Una cuenta desactivada recibe "Esta cuenta está desactivada" solo si la
  contraseña es correcta, para no revelar a cualquiera qué cuentas existen.

**Estado del sistema:**
- Cada trabajo periódico (clima, consolidación, limpieza) guarda su última
  ejecución: inicio, fin, parcelas procesadas, fallos y último error.
- Si el correo está configurado, el proveedor de clima y la hora del servidor.
- Todos los dispositivos de todas las parcelas con su último envío, marcando
  "sin señal" los que llevan más de dos ciclos callados.

**Registro de accesos:** los intentos de login y recuperación, del más
reciente al más antiguo, filtrables por email y resultado.

**Configuración:** datos del titular (razón social, NIF, domicilio, email y
teléfono de contacto, datos registrales), datos del encargado y proveedores
(alojamiento, correo). La portada y las páginas legales los leen con un
endpoint público.

## Páginas legales

- **`/aviso-legal`:** los datos del titular, como exige el art. 10 de la LSSI.
- **`/privacidad`** (RGPD art. 13):
  - Responsable y encargado.
  - Datos tratados: cuenta, registro de accesos con la IP durante 90 días,
    coordenadas de las parcelas y datos de campo.
  - Finalidades y base jurídica, destinatarios y proveedores.
  - Ausencia de transferencias fuera de la UE, plazos de conservación,
    derechos y reclamación ante la AEPD.
- **`/cookies`:** solo hay almacenamiento técnico (sesión e idioma), exento de
  consentimiento según la AEPD. Sin banner.
- **`/condiciones`:** las condiciones de uso de la herramienta.
- **Enlaces:** en el pie de la portada, en el login, en las pantallas de
  acceso y en la barra inferior de la app. Al aceptar la invitación se informa
  de la política de privacidad, con enlace.

## Web

- **Contraste:** todo texto informativo a 4,5:1 o más, sobre LOUSA y sobre
  ALZA. Para que se siga distinguiendo la jerarquía, `oso-2` se aclara un
  poco. `oso-4` queda para lo deshabilitado y lo decorativo, y sus usos como
  texto informativo pasan a `oso-3`. `sangre` se aclara hasta pasar el umbral
  sobre ALZA.
- **Error boundary** global, con "Recargar".
- **Code splitting:**
  - Una carga diferida por pantalla.
  - `xlsx` solo se carga al exportar.
  - Leaflet solo se carga en Sensores.
