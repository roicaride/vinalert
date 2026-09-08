# Acceso multiusuario por parcela: gestor, lectura y cuenta de admin

Fecha: 2026-08-19
Sub-proyecto B de 4 de la fase actual. Anterior: A (scheduler de consolidación, hecho).
Siguientes: C (configuración de parcela desde la app), D (aplicación web).

## Contexto

VinAlert es una API FastAPI + SQLAlchemy + PostgreSQL de monitorización agrícola.
El destinatario real de los datos es un equipo de investigación, además del
agricultor que explota la parcela.

Hoy una parcela tiene **un único dueño**: `Parcela.usuario_id` es una clave
ajena simple, y toda la autorización pasa por `get_parcela_del_usuario()`
(`app/deps.py`), que filtra por `Parcela.usuario_id == current_user.id` y lanza
404 si no coincide. Consecuencia: compartir una parcela es imposible. Un técnico
externo o un investigador no puede consultar los datos salvo compartiendo
credenciales, que es la peor solución posible — no deja rastro de quién hizo qué
y da acceso total.

Este cambio se hace **antes** de construir la aplicación web (sub-proyecto D)
a propósito: la existencia de dos niveles de permiso cambia la navegación, la
pantalla de ajustes y qué botones se ven. Construir la interfaz asumiendo un
único dueño obligaría a rehacerla.

## Objetivo

- Que una parcela pueda tener varios usuarios, cada uno con un nivel de acceso.
- Que exista una cuenta de administración capaz de entrar en cualquier parcela.
- Que la autorización siga viviendo en un solo sitio, para que añadir un
  endpoint nuevo no pueda abrir un agujero por descuido.

## Fuera de alcance

- Envío de correos. El proyecto no tiene ninguna infraestructura de correo
  (ni SMTP ni librería en `requirements.txt`), y montarla es un subsistema en
  sí mismo. Para añadir a alguien, su cuenta debe existir ya.
- Invitaciones a personas sin cuenta (códigos canjeables, enlaces de alta).
- Registro de auditoría de quién hizo cada cambio. Interesante para los
  tratamientos, que tienen valor probatorio, pero es otro proyecto.
- Organizaciones o equipos. El permiso es por parcela y persona.
- Todo el frontend (sub-proyecto D).

## Decisiones tomadas

Cada una con el motivo, porque el motivo es lo que no se puede reconstruir
leyendo el código.

**Dos niveles, no un sistema de permisos por acción.** `gestor` puede todo;
`lectura` consulta y exporta. Cubre el caso real (el investigador que analiza
datos sin poder alterar la configuración) sin la complejidad de permisos
granulares que nadie ha pedido.

**Lectura incluye exportar.** Si no pudiera descargarse el histórico, el gestor
sería el cuello de botella de cada descarga que necesite el equipo de
investigación, que es justamente a quien sirven estos datos.

**Tabla de asociación, y `Parcela.usuario_id` desaparece.** La alternativa
—conservar el dueño en `Parcela` y añadir una tabla de invitados aparte— dejaría
**dos caminos** para responder "¿puede este usuario tocar esta parcela?". Ahí es
donde se cuelan los fallos de permisos: alguien comprueba uno y olvida el otro.

**Admin como rol global, no como filas auto-insertadas.** Se consideró
asociar automáticamente al admin como gestor de cada parcela nueva. Se descarta:
solo cubriría las parcelas creadas a partir de ese momento, cualquier vía futura
de crear parcelas que olvidara esa línea perdería el acceso en silencio, y
cualquiera podría borrar esa fila. Un rol global se comprueba en un único sitio
y funciona hacia atrás.

**404 y no 403 para quien no pertenece a la parcela.** Un 403 confirma que la
parcela existe. Se mantiene el comportamiento actual.

**403 para el miembro de lectura que intenta escribir.** Aquí sí procede 403 y
no 404: el usuario sabe que la parcela existe porque la está viendo, y un 404
sería desconcertante. La distinción es deliberada.

## Modelo de datos

Tabla nueva `parcela_usuarios`:

| Columna | Tipo | Notas |
|---|---|---|
| `parcela_id` | Integer, FK `parcelas.id` | Parte de la PK compuesta |
| `usuario_id` | Integer, FK `usuarios.id` | Parte de la PK compuesta |
| `rol` | String, NOT NULL | `"gestor"` o `"lectura"` |

La **clave primaria compuesta** `(parcela_id, usuario_id)` impide por
construcción que un usuario aparezca dos veces en la misma parcela con roles
distintos. No se usa una columna `id` autoincremental porque no aporta nada y
permitiría precisamente esa duplicidad.

Los valores válidos de `rol` se validan en la capa de Pydantic (un `Literal`),
no con un `CHECK` en la base, para mantener la coherencia con el resto del
proyecto, que no usa constraints de dominio.

Relaciones: `Parcela.miembros` y `Usuario.parcelas_asociadas`. Se elimina
`Parcela.usuario_id` y la relación `Usuario.parcelas` / `Parcela.usuario`.

`Usuario.rol` ya existe, con valor por defecto `"agricultor"`. Se le añade el
valor `"admin"`. No se crea ninguna columna nueva.

## Autorización

`get_parcela_del_usuario()` se sustituye por dos funciones en `app/deps.py`:

- `parcela_con_lectura(parcela_id, current_user, db)` — devuelve la parcela si
  el usuario está asociado con cualquier rol, **o si es admin**. Si no, 404.
- `parcela_con_gestion(parcela_id, current_user, db)` — devuelve la parcela si
  el usuario está asociado **como gestor**, o si es admin. Si está asociado solo
  con `lectura`, 403. Si no está asociado, 404.

El orden de las comprobaciones importa y es parte del contrato: primero se
determina si el usuario ve la parcela (asociado o admin); solo entonces se
distingue entre 403 y 404. Comprobar el rol antes que la pertenencia filtraría
la existencia de parcelas ajenas por el código de estado.

`GET /parcelas` devuelve las parcelas asociadas al usuario, y **todas** si es
admin — sin ese caso el admin tendría acceso pero ninguna forma de llegar a las
parcelas desde la aplicación.

Al crear una parcela, su creador queda asociado como `gestor` en la misma
transacción. Una parcela sin ningún gestor sería inadministrable.

### Clasificación de los puntos de llamada

El cambio toca una veintena de llamadas repartidas en seis routers
(`parcelas`, `sensores`, `logs`, `clima_fetch`, `foliar`, `tratamientos`).
Cada una pasa a `parcela_con_lectura` o `parcela_con_gestion` según **escriba o
no**:

- **Lectura**: consultas de histórico, resúmenes, listados, dashboard y
  exportación.
- **Gestión**: alta y edición de parcela, alta/baja/edición de sensores,
  registro de lecturas y de tratamientos, subida del Excel foliar, disparo
  manual del refresco de clima y del backfill.

Éste es el punto de mayor riesgo del proyecto: clasificar como lectura algo que
escribe no rompe nada visiblemente — simplemente permite a un invitado
modificar datos ajenos. Por eso la verificación se hace con la matriz descrita
más abajo y no revisando el diff a ojo.

## Endpoints nuevos

Todos bajo `/parcelas/{parcela_id}/usuarios`.

| Método | Ruta | Permiso | Comportamiento |
|---|---|---|---|
| `GET` | `/` | lectura | Lista los miembros con su rol y sus datos básicos. Cualquier miembro puede ver con quién comparte la parcela: es información que le concierne. |
| `POST` | `/` | gestión | Cuerpo: `email` y `rol`. Asocia una cuenta **existente**. |
| `PATCH` | `/{usuario_id}` | gestión | Cambia el rol de un miembro. |
| `DELETE` | `/{usuario_id}` | gestión | Retira el acceso. |

El admin **no aparece** en el listado de miembros de una parcela salvo que esté asociado explícitamente: su acceso viene del rol global, no de una fila en `parcela_usuarios`. Que el listado refleje exactamente el contenido de esa tabla lo hace predecible, y evita la pregunta de si se puede "retirar" a alguien que nunca se añadió.

El `rol` del cuerpo de `POST` y `PATCH` se valida con un `Literal["gestor", "lectura"]`: un valor inventado da 422 antes de tocar la base.

Códigos de error, explícitos para que el frontend pueda distinguirlos:

- `POST` con un email sin cuenta → **404**, mensaje que indique que esa persona
  debe registrarse primero. Es el error más probable en uso real y el frontend
  necesita poder explicarlo bien.
- `POST` con un usuario ya asociado → **409**.
- `PATCH`/`DELETE` que dejaría la parcela **sin ningún gestor** → **409** con un
  mensaje que lo explique. Cubre los dos casos: degradar al último gestor a
  lectura, y retirarlo.
- `PATCH`/`DELETE` sobre un usuario que no es miembro → **404**.

Un gestor puede retirarse a sí mismo, siempre que no sea el último.

El rol de admin **no se concede ni se retira por la API**. Se otorga tocando la
base de datos directamente. `UsuarioCreate` no acepta `rol` hoy y no debe
aceptarlo nunca: es la vía de escalada de privilegios más obvia.

## Migración

Sin Alembic, como el resto del proyecto: SQL escrito a mano, revisado y
aplicado por una persona tras confirmación explícita.

1. `CREATE TABLE parcela_usuarios` con la PK compuesta y las dos claves ajenas.
2. `INSERT` de una fila `gestor` por cada parcela existente, tomando el
   `usuario_id` actual: `INSERT INTO parcela_usuarios (parcela_id, usuario_id,
   rol) SELECT id, usuario_id, 'gestor' FROM parcelas WHERE usuario_id IS NOT
   NULL;`
3. `ALTER TABLE parcelas DROP COLUMN usuario_id;`

El orden es obligatorio: el paso 3 destruye la información que el paso 2
necesita. El script debe llevarlo escrito en la cabecera, como el de la
migración anterior.

La base de datos de desarrollo está vacía, así que el paso 2 no moverá filas
ahí. Se escribe correcto igualmente: puede haber otros entornos con datos, y un
script que solo funciona en una base vacía es una trampa.

## Testing

**Matriz de permisos.** Un test parametrizado que recorre todos los endpoints
con ámbito de parcela y comprueba, para cada uno:

- usuario ajeno → 404
- miembro de lectura → 200 en los de consulta, 403 en los de escritura
- miembro gestor → 200
- admin no asociado → igual que gestor

La matriz se declara como una lista explícita de endpoints en el propio test.
Es deliberado que sea explícita y no derivada de las rutas de FastAPI: así,
añadir un endpoint nuevo sin añadirlo a la matriz es visible en la revisión, y
un test que se auto-descubre no protege de lo que no conoce.

**Tests específicos:**

- El registro público no puede fijar `rol`: enviar `rol: "admin"` en el cuerpo
  de `/auth/register` crea igualmente un `agricultor`. Este test es la guarda
  contra la escalada de privilegios y debe fallar si alguien añade `rol` a
  `UsuarioCreate`.
- El creador de una parcela queda como gestor.
- No se puede degradar ni retirar al último gestor (dos tests, uno por vía).
- Un gestor sí puede retirarse si queda otro.
- Añadir un email inexistente da 404; añadir un miembro repetido, 409.
- Un admin ve todas las parcelas en `GET /parcelas`; un usuario normal solo las
  suyas.
- La clave primaria compuesta impide asociar dos veces al mismo usuario.

## Riesgos

**Clasificar mal un punto de llamada.** Mitigado con la matriz de permisos, que
es la única forma realista de verificar veinte sitios sin fiarse de la lectura.

**Romper todos los tests existentes a la vez.** Al eliminar `Parcela.usuario_id`
dejan de funcionar las fixtures que crean parcelas. La fixture `parcela_id` de
`conftest.py` y los `Parcela(usuario_id=...)` repartidos por los tests deben
migrarse a la vez que el modelo. Es trabajo mecánico, pero hay que contarlo:
no es un cambio de dos ficheros.

**La cuenta de admin es una llave maestra.** Su compromiso expone todas las
parcelas. Se acepta conscientemente a cambio de la operativa que permite; se
acota impidiendo que el rol se obtenga por ninguna vía pública.
