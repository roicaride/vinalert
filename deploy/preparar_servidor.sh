#!/usr/bin/env bash
# Prepara un Ubuntu recién instalado como servidor de Viñalert.
# Uso:  bash preparar_servidor.sh      (como tu usuario normal, pedirá sudo)
set -euo pipefail

echo "== 1. Paquetes básicos y SSH =="
sudo apt-get update
sudo apt-get install -y git curl openssl openssh-server ufw
sudo systemctl enable --now ssh

echo "== 2. Docker Engine + Compose =="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "== 3. Que no se duerma nunca =="
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
# Portátil: no suspender al cerrar la tapa
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/; s/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind || true

echo "== 4. Cortafuegos: solo SSH y web =="
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw --force enable

echo "== 5. Código en /opt/vinalert =="
sudo mkdir -p /opt/vinalert
sudo chown "$USER":"$USER" /opt/vinalert
if [ ! -d /opt/vinalert/.git ]; then
  git clone https://github.com/roicaride/vinalert /opt/vinalert
fi
if [ ! -f /opt/vinalert/.env ]; then
  cp /opt/vinalert/.env.example /opt/vinalert/.env
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -hex 32)|" /opt/vinalert/.env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" /opt/vinalert/.env
  # Prod queda publicado en internet: nada de las contraseñas de ejemplo.
  sed -i "s|^SEMILLA_ADMIN_PASSWORD=.*|SEMILLA_ADMIN_PASSWORD=$(openssl rand -hex 12)|" /opt/vinalert/.env
  sed -i "s|^SEMILLA_AGRICULTOR_PASSWORD=.*|SEMILLA_AGRICULTOR_PASSWORD=$(openssl rand -hex 12)|" /opt/vinalert/.env
  chmod 600 /opt/vinalert/.env
  echo "   .env creado con SECRET_KEY, POSTGRES_PASSWORD y contraseñas de la semilla aleatorias."
  echo "   Si vas a restaurar tu BD, pon la SECRET_KEY de tu .env antiguo."
fi

echo "== 6. Copia de seguridad diaria (03:30) =="
mkdir -p /opt/vinalert/backups
( crontab -l 2>/dev/null | grep -v backup_docker.sh ; \
  echo '30 3 * * * /opt/vinalert/deploy/backup_docker.sh >> /opt/vinalert/backups/backup.log 2>&1' ) | crontab -

echo
echo "Listo. Ahora:"
echo "  1) Cierra sesión y vuelve a entrar (para usar docker sin sudo)"
echo "  2) Edita /opt/vinalert/.env (SECRET_KEY, URL_WEB, SMTP, token del túnel)"
echo "  3) Sigue deploy/DESPLIEGUE.md"
