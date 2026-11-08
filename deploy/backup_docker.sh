#!/usr/bin/env bash
# Version para Docker de scripts/backup_db.sh: el pg_dump corre dentro del
# contenedor "db" (en el host no hace falta instalar PostgreSQL).
# Mismo formato (custom), misma comprobacion y misma retencion.
#
#   BACKUP_DIR              por defecto /opt/vinalert/backups (ignorada por git)
#   BACKUP_RETENCION_DIAS   por defecto 30
#   BACKUP_REMOTO           destino rclone opcional, p. ej. "gdrive:vinalert-backups"
set -euo pipefail
cd "$(dirname "$0")/.."

# No se hace "source" del .env: hay valores con espacios y "<" (CORREO_REMITENTE)
# que bash interpretaria. Se leen solo las dos variables que hacen falta.
leer() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- ; }
usuario="$(leer POSTGRES_USER)"; usuario="${usuario:-vinalert}"
base="$(leer POSTGRES_DB)"; base="${base:-vinalert}"
dir="${BACKUP_DIR:-$PWD/backups}"
retencion="${BACKUP_RETENCION_DIAS:-30}"
mkdir -p "$dir"

destino="$dir/vinalert_$(date -u +%Y%m%dT%H%M%SZ).dump"
parcial="$destino.parcial"
trap 'rm -f "$parcial"' EXIT

docker compose exec -T db pg_dump --format=custom --no-owner --no-privileges -U "$usuario" -d "$base" > "$parcial"
# Un dump cortado no se lista: mejor fallar aqui que el dia de restaurar.
docker compose exec -T db pg_restore --list < "$parcial" > /dev/null
mv "$parcial" "$destino"
echo "Copia creada: $destino ($(du -h "$destino" | cut -f1))"

if [[ -n "${BACKUP_REMOTO:-}" ]]; then
  rclone copy "$destino" "$BACKUP_REMOTO"
  echo "Copia subida a $BACKUP_REMOTO"
fi

find "$dir" -name 'vinalert_*.dump' -mtime +"$retencion" -print -delete
