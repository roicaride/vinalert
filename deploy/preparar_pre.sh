#!/usr/bin/env bash
# Monta preproducción (rama develop) en /opt/vinalert-pre, junto a producción.
# Requisito: haber pasado antes deploy/preparar_servidor.sh.
# Uso:  bash /opt/vinalert/deploy/preparar_pre.sh
#
# Pre es un entorno de pruebas, separado de prod en todo:
#   - BD propia (volumen vinalert-pre_pgdata) y puerto 8080.
#   - SECRET_KEY propia: un token de prod no vale en pre ni al revés.
#   - Sin correo (SMTP_HOST vacío): los enlaces salen en el log.
#   - Sin copias programadas y sin ESP32 apuntando aquí.
set -euo pipefail

DIR=/opt/vinalert-pre
REPO=https://github.com/roicaride/vinalert

sudo mkdir -p "$DIR"
sudo chown "$USER":"$USER" "$DIR"
if [ ! -d "$DIR/.git" ]; then
  git clone --branch develop "$REPO" "$DIR"
fi

if [ -f "$DIR/.env" ]; then
  echo "$DIR/.env ya existe: no lo toco."
else
  cp "$DIR/.env.example" "$DIR/.env"
  ajustar() { sed -i "s|^$1=.*|$1=$2|" "$DIR/.env"; }
  ajustar COMPOSE_PROJECT_NAME vinalert-pre
  ajustar WEB_PORT 8080
  ajustar SECRET_KEY "$(openssl rand -hex 32)"
  ajustar POSTGRES_PASSWORD "$(openssl rand -hex 16)"
  ajustar SMTP_HOST ""
  # Pre queda publicado en internet: nada de las contraseñas de ejemplo.
  ajustar SEMILLA_ADMIN_PASSWORD "$(openssl rand -hex 12)"
  ajustar SEMILLA_AGRICULTOR_PASSWORD "$(openssl rand -hex 12)"
  chmod 600 "$DIR/.env"
  echo ".env de pre creado (claves nuevas, distintas de las de prod)."
fi

# Que nadie programe copias de pre por error.
if crontab -l 2>/dev/null | grep -q "$DIR/"; then
  echo "AVISO: hay una tarea de cron que usa $DIR. Pre no debería tener copias programadas."
fi

echo
echo "Listo. Ahora:"
echo "  1) Pon en $DIR/.env la URL_WEB de pre (https://NOMBRE-PC.TU-TAILNET.ts.net:8443)"
echo "  2) cd $DIR && docker compose up -d --build"
echo "  3) docker compose exec backend python semilla_inicial.py"
echo "     (usuarios y contraseñas: SEMILLA_* en $DIR/.env)"
echo "  4) sudo tailscale funnel --bg --https=8443 8080"
