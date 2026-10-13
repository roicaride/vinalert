#!/usr/bin/env bash
# Copia de seguridad de la base de datos de Vinalert.
#
# Hace un pg_dump en formato custom (comprimido, restaurable tabla a tabla),
# comprueba que el fichero se puede leer antes de darlo por bueno y borra las
# copias locales mas antiguas que BACKUP_RETENCION_DIAS. Si BACKUP_REMOTO esta
# definido, sube ademas la copia con rclone: una copia en el mismo disco que la
# BD no sobrevive a que se rompa ese disco.
#
# Pensado para ejecutarse a diario (cron o systemd timer). Restaurar: ver la
# seccion "Backups" del README.
#
# Variables:
#   DATABASE_URL            la de la app; si no esta en el entorno, se lee del .env
#   BACKUP_DIR              carpeta local de copias (por defecto ./backups)
#   BACKUP_RETENCION_DIAS   dias que se conservan las copias locales (por defecto 30)
#   BACKUP_REMOTO           destino rclone, p. ej. "b2:vinalert-backups" (opcional)
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | tail -n1 | cut -d= -f2-)"
fi
: "${DATABASE_URL:?Falta DATABASE_URL (en el entorno o en el .env)}"

dir="${BACKUP_DIR:-./backups}"
retencion="${BACKUP_RETENCION_DIAS:-30}"
mkdir -p "$dir"

destino="$dir/vinalert_$(date -u +%Y%m%dT%H%M%SZ).dump"
parcial="$destino.parcial"
trap 'rm -f "$parcial"' EXIT

pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$parcial"
# Un dump cortado (disco lleno, conexion caida) no se lista: mejor fallar aqui
# que descubrirlo el dia que haga falta restaurar.
pg_restore --list "$parcial" > /dev/null
mv "$parcial" "$destino"
echo "Copia creada: $destino ($(du -h "$destino" | cut -f1))"

if [[ -n "${BACKUP_REMOTO:-}" ]]; then
  rclone copy "$destino" "$BACKUP_REMOTO"
  echo "Copia subida a $BACKUP_REMOTO"
fi

find "$dir" -name 'vinalert_*.dump' -mtime +"$retencion" -print -delete
