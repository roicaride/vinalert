# Viñalert en un PC propio (Ubuntu + Docker)

## Cómo queda montado

```
ESP32 maestro ──HTTPS──┐
                       ├──► túnel (Tailscale Funnel o Cloudflare) ──► PC Ubuntu
Navegador ─────HTTPS───┘                                              │
                                                                      ▼
                                     ┌─────────── docker compose ───────────┐
                                     │  web (nginx :80)                      │
                                     │   ├─ /        → la web React          │
                                     │   └─ /api/... → backend:8000          │
                                     │  backend (FastAPI + scheduler)        │
                                     │   └─ db:5432                          │
                                     │  db (PostgreSQL, volumen pgdata)      │
                                     └───────────────────────────────────────┘
```

- Los contenedores se hablan por **nombre de servicio** dentro de la red de Docker:
  nginx llama a `backend:8000` y el backend a `db:5432`. No hay que configurar IPs.
- Solo se publica el puerto 80 de nginx. Web y API van en el mismo dominio (`/` y `/api`),
  así que no hay CORS de por medio.
- nginx averigua la IP real del cliente y se la pasa al backend (`--proxy-headers`). Sin
  eso, los límites de login por IP contarían a todo el mundo como una sola persona.
- No se mandan imágenes Docker a ningún sitio: el PC clona el repo y construye él solo.

## 0. Antes de nada, en el ordenador donde está tu BD actual

```bash
psql --version                     # apunta la versión mayor (16, 17...)
DATABASE_URL=... ./scripts/backup_db.sh   # o directamente:
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" -f vinalert.dump
```

Guarda también la `SECRET_KEY` de tu `.env`. Si la cambias, todos los JWT dejan de valer,
incluido el token del ESP32.

## 1. Preparar el PC (una vez)

```bash
sudo apt install -y git
git clone https://github.com/roicaride/vinalert /tmp/vinalert
bash /tmp/vinalert/deploy/preparar_servidor.sh
# cierra sesión y vuelve a entrar
```

El script instala Docker, SSH y el cortafuegos, desactiva la suspensión (también al cerrar
la tapa) y clona el repo en `/opt/vinalert`. También genera un `.env` con `SECRET_KEY` y
contraseña de Postgres aleatorias, y programa `deploy/backup_docker.sh` todos los días a
las 03:30.

## 2. Configurar `/opt/vinalert/.env`

| Variable | Qué poner |
| --- | --- |
| `SECRET_KEY` | **La de tu `.env` antiguo** si restauras tu BD. |
| `URL_WEB` | La URL pública, p. ej. `https://vinalert-pc.tu-tailnet.ts.net`. Se usa en los enlaces de invitación y recuperación. |
| `CORS_ORIGINS` | Esa misma URL. No es imprescindible, porque todo va por el mismo origen. |
| `SMTP_*`, `CORREO_REMITENTE` | Tu proveedor de correo, p. ej. Brevo. Sin ellos, los enlaces salen en `docker compose logs backend`. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Solo si usas Cloudflare (paso 4B). |

`DATABASE_URL` no hace falta: el compose lo construye con `POSTGRES_*` apuntando a `db`.

## 3. Primer arranque

**Si la versión de tu Postgres no es 16**, cambia la imagen en `docker-compose.yml`
(`postgres:17-alpine`, etc.) **en tu repo, con commit y push**, antes del primer arranque.
La de destino tiene que ser igual o mayor que la de origen.

> **Regla de oro: en `/opt/vinalert` no se edita nada que esté en git.** El autodeploy hace
> `git reset --hard` y lo machacaría en el siguiente push; con la versión de Postgres, la BD
> dejaría de arrancar. En el servidor solo se tocan `.env` y `backups/`. Todo lo demás va
> por commit.

**Con tus datos (lo normal):**
```bash
cd /opt/vinalert
cp ~/vinalert.dump backups/              # el dump del paso 0
docker compose up -d db
docker compose exec -T db pg_restore --no-owner --no-acl -U vinalert -d vinalert < backups/vinalert.dump
docker compose up -d --build
```
**No ejecutes `semilla_inicial.py`**, porque tus usuarios ya vienen en el dump.

Si tu BD era anterior a alguna migración de `migraciones/`, aplica las que falten (en orden):
```bash
docker compose exec -T db psql -U vinalert vinalert < migraciones/migracion_XXXX.sql
```
Ojo con `migracion_2026_10_13_superadmin.sql`: marca como superadmin a `admin@vinalert.dev`.
Si tu admin usa otro email, edita el `UPDATE` antes de lanzarla.

**Desde cero:** `docker compose up -d --build` y luego
`docker compose exec backend python semilla_inicial.py`.

Comprueba: `http://IP-del-PC` desde la red local (`hostname -I` te da la IP) y
`http://IP-del-PC/api/docs`.

## 4. Acceso desde fuera

En una residencia o con CGNAT no se pueden abrir puertos, así que se usa un túnel saliente.

**A) Tailscale Funnel: gratis, sin dominio (recomendado para empezar)**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale funnel --bg 80        # la primera vez pide activarlo en la consola web
tailscale funnel status              # → https://NOMBRE-PC.TU-TAILNET.ts.net
```
La URL es fija y el certificado es de Let's Encrypt, lo que viene bien para el ESP32 (paso 5).
Además tienes SSH al PC desde cualquier sitio.

**B) Cloudflare Tunnel: con dominio propio**
1. El dominio, gestionado en Cloudflare.
2. Zero Trust → Networks → Tunnels → Create tunnel (cloudflared). Copia el token a `.env`.
3. Public hostname: `app.tudominio` → `HTTP` → `web:80`.
4. `docker compose --profile tunnel up -d` (el autodeploy ya lo detecta solo).

## 5. ESP32 maestro (una sola vez)

En `secrets.h`:
```c
#define SERVER_BASE_URL "https://NOMBRE-PC.TU-TAILNET.ts.net/api"
#define API_KEY "token generado en Configuración → Dispositivos ESP32"
```
Para validar el certificado (el firmware avisa si no lo haces), define `SERVER_ROOT_CA`:
- **Con Tailscale:** ISRG Root X1 (https://letsencrypt.org/certs/isrgrootx1.pem).
- **Con Cloudflare:** el certificado de Cloudflare puede venir de varias CA, así que es menos
  predecible y habría que meter más de una raíz.

Reflashea el maestro. Como la URL ya no cambia, no vuelves a tocarlo.

## 6. Despliegue automático en cada push a `main`

`.github/workflows/deploy.yml` lo ejecuta un **runner self-hosted** que corre en el propio
PC. GitHub le avisa al momento del push.

1. GitHub → repo → Settings → Actions → Runners → **New self-hosted runner** → Linux x64.
2. En el PC, ejecuta los comandos que te da (en `~/actions-runner`). En `./config.sh`,
   cuando te pida etiquetas adicionales, escribe `vinalert`.
3. Instálalo como servicio:
   ```bash
   cd ~/actions-runner && sudo ./svc.sh install "$USER" && sudo ./svc.sh start
   ```
4. **Seguridad (el repo es público):** Settings → Actions → General → *Fork pull request
   workflows* → "Require approval for all external contributors". El workflow solo se
   dispara con push a `main`; esto es una segunda barrera.

Flujo: `git push` → `git reset --hard origin/main` en `/opt/vinalert` →
`docker compose up -d --build` → comprueba que `/api/docs` responde.
`.env` y `backups/` están en `.gitignore`, así que el despliegue no los toca, y la BD vive en
el volumen `pgdata`.

**Las migraciones no se aplican solas.** Cuando subas una nueva, lánzala a mano
(paso 3) justo después del push.

## Comandos útiles

```bash
cd /opt/vinalert
docker compose ps
docker compose logs -f backend
docker compose restart backend
docker compose exec backend python worker.py 30          # reconsolidar 30 días
docker compose exec db psql -U vinalert vinalert          # consola SQL
./deploy/backup_docker.sh                                 # copia ahora
BACKUP_REMOTO=gdrive:vinalert ./deploy/backup_docker.sh   # y súbela con rclone
```

Restaurar una copia en una BD nueva para revisarla:
```bash
docker compose exec db createdb -U vinalert vinalert_restaurada
docker compose exec -T db pg_restore --no-owner -U vinalert -d vinalert_restaurada < backups/vinalert_<fecha>.dump
```
Recuerda que el registro de tratamientos hay que conservarlo tres años. Configura
`BACKUP_REMOTO` para que las copias no vivan solo en el disco del PC.
