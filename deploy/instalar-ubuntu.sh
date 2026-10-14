#!/usr/bin/env bash
# Instala o actualiza el Sistema de Punto de Venta e Inventario en un servidor Ubuntu 22.04 / 24.04 (sin Docker).
#
# Uso (como root o con sudo):
#   sudo bash instalar-ubuntu.sh
#   sudo DOMINIO=tienda.ejemplo.com CORREO=tu@correo.com TZ_TIENDA=America/Mexico_City FIREWALL=1 bash instalar-ubuntu.sh
#
# Se puede ejecutar las veces que quieras: actualiza el código y conserva los datos.
#
# Variables (todas opcionales):
#   DOMINIO       Dominio que ya apunta a este servidor. Instala Caddy con HTTPS automático (Let's Encrypt).
#   CORREO        Correo para los avisos de Let's Encrypt (recomendado si usas DOMINIO).
#   TZ_TIENDA     Zona horaria de la tienda: America/Mexico_City, America/Monterrey, America/Cancun,
#                 America/Tijuana, America/Hermosillo, America/Mazatlan, America/Chihuahua, America/Merida...
#   FIREWALL=1    Activa el firewall ufw: deja abiertos SSH y, con DOMINIO, 80 y 443. Sin DOMINIO el puerto
#                 del sistema solo se abre para RED_LOCAL.
#   RED_LOCAL     Sin DOMINIO y con FIREWALL=1: red local que podrá entrar al puerto del sistema por HTTP,
#                 p. ej. 192.168.1.0/24. Sin RED_LOCAL el puerto queda cerrado hacia fuera.
#   REPO_URL      Repositorio git (por defecto https://github.com/Jorgevg53/Sistema-de-inventario.git).
#   RAMA          Rama o etiqueta a instalar (por defecto, la principal del repositorio).
#   ORIGEN_LOCAL  Carpeta con el código para copiar en vez de clonar (p. ej. /home/ubuntu/Sistema-de-inventario).
#   PUERTO        Puerto interno del sistema (3000).
#   SIN_SYSTEMD=1 No usa systemctl (solo para pruebas dentro de contenedores).
set -Eeuo pipefail
umask 022

REPO_URL="${REPO_URL:-https://github.com/Jorgevg53/Sistema-de-inventario.git}"
RAMA="${RAMA:-}"
ORIGEN_LOCAL="${ORIGEN_LOCAL:-}"
DOMINIO="${DOMINIO:-}"
CORREO="${CORREO:-}"
TZ_TIENDA="${TZ_TIENDA:-}"
PUERTO="${PUERTO:-3000}"
FIREWALL="${FIREWALL:-0}"
RED_LOCAL="${RED_LOCAL:-}"
SIN_SYSTEMD="${SIN_SYSTEMD:-0}"

APP_DIR=/opt/punto-de-venta
DATA_DIR=/var/lib/punto-de-venta
CONF_DIR=/etc/punto-de-venta
USUARIO=pdv
SERVICIO=punto-de-venta
UNIT_FILE="/etc/systemd/system/$SERVICIO.service"
DROPIN_FILE="/etc/systemd/system/$SERVICIO.service.d/solo-local.conf"
NODE_MAJOR=22
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd)"
TMP_DIR="$(mktemp -d)"

export DEBIAN_FRONTEND=noninteractive
# needrestart (Ubuntu 22.04+) solo lista los servicios a reiniciar, sin preguntar.
export NEEDRESTART_MODE=l
export HOME=/root

paso() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
aviso() { printf '\n  AVISO: %s\n' "$*" >&2; }
error() { printf '\n  ERROR: %s\n\n' "$*" >&2; exit 1; }

limpiar() { rm -rf "$TMP_DIR"; }
trap limpiar EXIT
trap 'printf "\n  ERROR: falló un paso (línea %s). Revisa los mensajes de arriba y vuelve a ejecutar el script.\n\n" "$LINENO" >&2' ERR

apt_get() { apt-get -y -q -o DPkg::Lock::Timeout=300 "$@"; }

APT_ACTUALIZADO=0
# Instala solo los paquetes que falten (apt-get update una sola vez).
apt_instalar() {
  local faltan=() p
  for p in "$@"; do
    dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || faltan+=("$p")
  done
  [ "${#faltan[@]}" -eq 0 ] && return 0
  if [ "$APT_ACTUALIZADO" = 0 ]; then
    apt_get update
    APT_ACTUALIZADO=1
  fi
  apt_get install --no-install-recommends "${faltan[@]}"
}

usar_systemd() { [ "$SIN_SYSTEMD" != 1 ]; }

# 0 si el node indicado es 22.13+ / 23.4+ (node:sqlite integrado).
node_ok() {
  "$1" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 23 || (a === 23 && b >= 4) || (a === 22 && b >= 13) ? 0 : 1)' >/dev/null 2>&1
}

# Busca un archivo de deploy/: primero en el código instalado, luego junto a este script.
archivo_deploy() {
  local d
  for d in "$APP_DIR/deploy" "$SCRIPT_DIR"; do
    if [ -f "$d/$1" ]; then
      printf '%s\n' "$d/$1"
      return 0
    fi
  done
  error "No se encontró deploy/$1 (ni en $APP_DIR/deploy ni junto a este script)."
}

# ---------- Verificaciones ----------

[ "$(id -u)" -eq 0 ] || error "Ejecuta este script como administrador: sudo bash $0"
command -v apt-get >/dev/null 2>&1 || error "Este script es para Ubuntu (o Debian): no se encontró apt-get."
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  [ "${ID:-}" = ubuntu ] || aviso "Probado en Ubuntu 22.04 / 24.04; este sistema es ${PRETTY_NAME:-desconocido}. Se continúa."
fi
if ! [[ "$PUERTO" =~ ^[0-9]{1,5}$ ]] || [ "$PUERTO" -lt 1 ] || [ "$PUERTO" -gt 65535 ]; then
  error "PUERTO no es válido: $PUERTO"
fi
if [ -n "$DOMINIO" ]; then
  [[ "$DOMINIO" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
    || error "DOMINIO no es válido: '$DOMINIO'. Escribe solo el dominio, sin https:// ni barras (p. ej. tienda.ejemplo.com)."
  if [ "$PUERTO" = 80 ] || [ "$PUERTO" = 443 ]; then
    error "Con DOMINIO, Caddy usa los puertos 80 y 443: elige otro PUERTO para el sistema."
  fi
fi
if [ -n "$RED_LOCAL" ] && ! [[ "$RED_LOCAL" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$ ]]; then
  error "RED_LOCAL no es válida: '$RED_LOCAL'. Usa la red en formato IP/máscara, p. ej. 192.168.1.0/24."
fi
if [ -n "$CORREO" ]; then
  [[ "$CORREO" =~ ^[^[:space:]{}@]+@[^[:space:]{}@]+\.[^[:space:]{}@]+$ ]] || error "CORREO no es válido: $CORREO"
fi
if [ -n "$ORIGEN_LOCAL" ]; then
  if [ ! -f "$ORIGEN_LOCAL/package.json" ] || [ ! -f "$ORIGEN_LOCAL/server/index.js" ]; then
    error "ORIGEN_LOCAL=$ORIGEN_LOCAL no parece la carpeta del sistema (falta package.json o server/index.js)."
  fi
fi

echo ''
echo '  =================================================='
echo '   Instalación del Sistema de Punto de Venta'
echo '  =================================================='

# ---------- 1. Paquetes base ----------

paso 'Instalando paquetes base (curl, git, rsync, zonas horarias)...'
apt_instalar ca-certificates curl gnupg git rsync tzdata

# ---------- 2. Zona horaria ----------
# Las ventas, cortes y reportes por día usan la hora LOCAL del servidor.

if [ -n "$TZ_TIENDA" ]; then
  paso "Configurando la zona horaria: $TZ_TIENDA"
  [ -f "/usr/share/zoneinfo/$TZ_TIENDA" ] || error "Zona horaria desconocida: $TZ_TIENDA (ejemplo: America/Mexico_City)."
  if usar_systemd && command -v timedatectl >/dev/null 2>&1 && timedatectl set-timezone "$TZ_TIENDA" 2>/dev/null; then
    :
  else
    ln -sf "/usr/share/zoneinfo/$TZ_TIENDA" /etc/localtime
    printf '%s\n' "$TZ_TIENDA" > /etc/timezone
  fi
fi
ZONA_ACTUAL="$(readlink -f /etc/localtime 2>/dev/null | sed -n 's#^.*/zoneinfo/##p' || true)"
info "Zona horaria del servidor: ${ZONA_ACTUAL:-UTC} (hora actual: $(date '+%Y-%m-%d %H:%M'))"
if [ -z "$TZ_TIENDA" ] && { [ -z "$ZONA_ACTUAL" ] || [ "$ZONA_ACTUAL" = UTC ] || [ "$ZONA_ACTUAL" = Etc/UTC ]; }; then
  aviso "El servidor está en hora UTC: las ventas y cortes quedarían con varias horas de diferencia (6 en la Ciudad de México). Vuelve a ejecutar con TZ_TIENDA=America/Mexico_City (o la de tu ciudad)."
fi

# ---------- 3. Node.js ----------

paso "Revisando Node.js (se necesita $NODE_MAJOR.13 o superior)..."
NODE_BIN="$(command -v node 2>/dev/null || true)"
NODE_REAL=''
[ -n "$NODE_BIN" ] && NODE_REAL="$(readlink -f "$NODE_BIN")"
# No sirven un node dentro de /root o /home (el servicio no puede leerlos: ProtectHome) ni el de snap
# (snap-confine choca con NoNewPrivileges y RestrictNamespaces del servicio).
if [ -n "$NODE_BIN" ] && node_ok "$NODE_BIN" && [ -x "$(dirname "$NODE_BIN")/npm" ] \
  && [[ "$NODE_REAL" != /root/* && "$NODE_REAL" != /home/* && "$NODE_REAL" != /snap/* && "$NODE_REAL" != /usr/bin/snap ]]; then
  info "Node.js $("$NODE_BIN" -v) ya está instalado ($NODE_BIN)."
else
  [ -n "$NODE_BIN" ] && info "Node.js encontrado no sirve aquí ($("$NODE_BIN" -v 2>/dev/null || echo '?') en $NODE_REAL); se instala $NODE_MAJOR desde NodeSource."
  info "Agregando el repositorio oficial de NodeSource (Node.js $NODE_MAJOR)..."
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg \
    || error 'No se pudo descargar la llave de NodeSource (deb.nodesource.com). Revisa la conexión a internet.'
  chmod 0644 /etc/apt/keyrings/nodesource.gpg
  printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' "$NODE_MAJOR" \
    > /etc/apt/sources.list.d/nodesource.list
  # Prioridad a NodeSource sobre el paquete nodejs (más viejo) de Ubuntu.
  printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' > /etc/apt/preferences.d/nodejs
  apt_get update
  APT_ACTUALIZADO=1
  apt_get install nodejs
  NODE_BIN=/usr/bin/node
  node_ok "$NODE_BIN" || error "No se pudo instalar Node.js $NODE_MAJOR.13 o superior (quedó $("$NODE_BIN" -v 2>/dev/null || echo 'ninguno'))."
  info "Instalado Node.js $("$NODE_BIN" -v)."
fi
NODE_DIR="$(dirname "$NODE_BIN")"

# ---------- 4. Usuario del sistema ----------

paso "Preparando el usuario de sistema '$USUARIO'..."
if id "$USUARIO" >/dev/null 2>&1; then
  info "El usuario $USUARIO ya existe."
else
  useradd --system --user-group --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin \
    --comment 'Sistema de Punto de Venta' "$USUARIO"
  info "Usuario $USUARIO creado (sin contraseña ni acceso por SSH)."
fi

# ---------- 5. Código del sistema ----------

paso "Copiando el sistema a $APP_DIR..."
install -d -m 0755 "$APP_DIR"
if [ -n "$ORIGEN_LOCAL" ]; then
  # Copia exacta del código; nunca copia datos, dependencias ni el historial de git.
  rsync -a --delete --no-owner --no-group --chmod=u=rwX,go=rX \
    --exclude=/.git/ --exclude=/node_modules/ --exclude=/data/ \
    --exclude='*.db' --exclude='*.db-wal' --exclude='*.db-shm' \
    "$ORIGEN_LOCAL"/ "$APP_DIR"/
  info "Código copiado desde $ORIGEN_LOCAL."
else
  if [ ! -d "$APP_DIR/.git" ] && [ -n "$(ls -A "$APP_DIR")" ]; then
    ANTERIOR="$APP_DIR.anterior-$(date +%Y%m%d-%H%M%S)"
    mv "$APP_DIR" "$ANTERIOR"
    install -d -m 0755 "$APP_DIR"
    aviso "$APP_DIR tenía archivos que no venían de git; se movieron a $ANTERIOR."
  fi
  if [ ! -d "$APP_DIR/.git" ]; then
    git init -q "$APP_DIR"
    git -C "$APP_DIR" remote add origin "$REPO_URL"
  else
    git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  fi
  # Solo la última versión (sin historial) de la rama pedida o de la principal.
  git -C "$APP_DIR" fetch -q --depth 1 origin "${RAMA:-HEAD}" \
    || error "No se pudo descargar el código de $REPO_URL (rama: ${RAMA:-la principal}). Revisa la dirección, la rama y la conexión."
  git -C "$APP_DIR" reset -q --hard FETCH_HEAD
  git -C "$APP_DIR" clean -q -fd
  info "Versión instalada: $(git -C "$APP_DIR" log -1 --format='%h %s (%cd)' --date=short)"
fi
chown -R root:root "$APP_DIR"

paso 'Instalando dependencias (npm ci)...'
(cd "$APP_DIR" && PATH="$NODE_DIR:$PATH" npm ci --omit=dev --no-audit --no-fund --update-notifier=false) \
  || error 'npm ci falló al instalar las dependencias. Revisa la conexión a internet (registry.npmjs.org).'

# ---------- 6. Carpeta de datos y ajustes ----------

paso "Preparando la carpeta de datos $DATA_DIR..."
install -d -o "$USUARIO" -g "$USUARIO" -m 0750 "$DATA_DIR"
chown -R "$USUARIO:$USUARIO" "$DATA_DIR"
install -d -m 0755 "$CONF_DIR"
if [ ! -f "$CONF_DIR/entorno" ]; then
  cat > "$CONF_DIR/entorno" <<'EOF'
# Ajustes opcionales del Sistema de Punto de Venta (formato VARIABLE=valor, sin espacios).
# Después de cambiar algo: sudo systemctl restart punto-de-venta
#
# Cuántos respaldos automáticos diarios conservar en /var/lib/punto-de-venta/respaldos (30 por defecto):
#RESPALDOS_DIAS=30
# Desactivar el respaldo automático diario:
#AUTO_RESPALDO=0
EOF
  chmod 0644 "$CONF_DIR/entorno"
fi
info "Base de datos y respaldos: $DATA_DIR (dueño: $USUARIO). Ajustes: $CONF_DIR/entorno"

# ---------- 7. Servicio systemd ----------

paso "Instalando el servicio $SERVICIO..."
sed -e "s#^ExecStart=/usr/bin/node #ExecStart=$NODE_BIN #" \
    -e "s#^Environment=PORT=.*#Environment=PORT=$PUERTO#" \
    "$(archivo_deploy punto-de-venta.service)" > "$TMP_DIR/unit"
grep -q "^ExecStart=$NODE_BIN " "$TMP_DIR/unit" || error 'No se pudo ajustar ExecStart en punto-de-venta.service.'
install -m 0644 "$TMP_DIR/unit" "$UNIT_FILE"
info "Servicio: $UNIT_FILE (node: $NODE_BIN, puerto: $PUERTO)"

if [ -n "$DOMINIO" ]; then
  # El sistema escucha en todas las interfaces; con Caddy delante solo debe aceptar conexiones locales.
  install -d -m 0755 "$(dirname "$DROPIN_FILE")"
  cat > "$DROPIN_FILE" <<EOF
# Creado por instalar-ubuntu.sh: el sistema se publica por HTTPS con Caddy.
# Dominio: $DOMINIO
# El servicio solo acepta conexiones desde este mismo equipo (Caddy), así nadie se salta el HTTPS
# entrando directo al puerto $PUERTO: escucha solo en 127.0.0.1 y, como segunda capa, systemd
# descarta lo que no venga de localhost. Para volver a permitir el acceso directo por la red, borra
# este archivo y ejecuta: sudo systemctl daemon-reload && sudo systemctl restart $SERVICIO
[Service]
Environment=HOST=127.0.0.1
IPAddressDeny=any
IPAddressAllow=localhost
EOF
  info "Acceso directo al puerto $PUERTO bloqueado: solo Caddy (localhost) puede conectarse."
elif [ -f "$DROPIN_FILE" ]; then
  DOMINIO_ANTERIOR="$(sed -n 's/^# Dominio: //p' "$DROPIN_FILE" | head -n 1)"
fi

if usar_systemd; then
  systemctl daemon-reload
  systemctl enable -q "$SERVICIO"
else
  info 'SIN_SYSTEMD=1: no se habilita el servicio.'
fi

# ---------- 8. Caddy (HTTPS) ----------

if [ -n "$DOMINIO" ]; then
  paso "Configurando HTTPS con Caddy para $DOMINIO..."
  if command -v caddy >/dev/null 2>&1; then
    info "Caddy ya está instalado ($(caddy version 2>/dev/null | cut -d' ' -f1))."
  else
    info 'Agregando el repositorio oficial de Caddy...'
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
      | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
      || error 'No se pudo descargar la llave de Caddy (dl.cloudsmith.io). Revisa la conexión a internet.'
    printf 'deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main\n' \
      > /etc/apt/sources.list.d/caddy-stable.list
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt_get update
    APT_ACTUALIZADO=1
    apt_get install caddy
  fi
  {
    printf '# Generado por deploy/instalar-ubuntu.sh (%s). Si lo editas a mano, vuelve a validar y recargar Caddy.\n\n' "$(date '+%Y-%m-%d %H:%M')"
    [ -n "$CORREO" ] && printf '{\n\temail %s\n}\n\n' "$CORREO"
    # shellcheck disable=SC2016  # {$DOMINIO...} es texto literal del Caddyfile, no una variable.
    sed -e 's/{\$DOMINIO[^}]*}/'"$DOMINIO"'/g' -e 's/{\$PUERTO[^}]*}/'"$PUERTO"'/g' "$(archivo_deploy Caddyfile)"
  } > "$TMP_DIR/Caddyfile"
  caddy validate --config "$TMP_DIR/Caddyfile" --adapter caddyfile >"$TMP_DIR/caddy-validate.log" 2>&1 \
    || { cat "$TMP_DIR/caddy-validate.log" >&2; error 'La configuración de Caddy no es válida.'; }
  install -d -m 0755 /etc/caddy
  if [ -f /etc/caddy/Caddyfile ] && ! cmp -s <(grep -v '^# Generado por' /etc/caddy/Caddyfile) <(grep -v '^# Generado por' "$TMP_DIR/Caddyfile"); then
    cp -p /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.anterior-$(date +%Y%m%d-%H%M%S)"
    info 'El Caddyfile anterior se guardó como /etc/caddy/Caddyfile.anterior-*'
  fi
  install -m 0644 "$TMP_DIR/Caddyfile" /etc/caddy/Caddyfile
  info 'Configuración escrita en /etc/caddy/Caddyfile.'
  if usar_systemd; then
    systemctl enable -q caddy
    systemctl reload-or-restart caddy
  fi
  if getent ahosts "$DOMINIO" >/dev/null 2>&1; then
    info "El dominio $DOMINIO apunta a: $(getent ahosts "$DOMINIO" | awk '{print $1}' | sort -u | tr '\n' ' ')"
    info "IP de este servidor: $(hostname -I 2>/dev/null || echo '?')"
  else
    aviso "El dominio $DOMINIO todavía no apunta a ninguna IP. Crea el registro DNS tipo A con la IP pública de este servidor; Caddy obtendrá el certificado solo cuando el DNS esté listo."
  fi
fi

# ---------- 9. Firewall (opcional) ----------

if [ "$FIREWALL" = 1 ]; then
  paso 'Configurando el firewall (ufw)...'
  apt_instalar ufw
  # Nunca cerrar SSH: se abre el 22 y cualquier otro puerto que use sshd.
  PUERTOS_SSH="22 $( (sshd -T 2>/dev/null || true) | awk '$1 == "port" {print $2}')"
  # shellcheck disable=SC2086
  for p in $(printf '%s\n' $PUERTOS_SSH | sort -un); do
    ufw allow "$p/tcp" comment 'SSH' >/dev/null
    info "Abierto $p/tcp (SSH)"
  done
  # Se quitan las reglas que este script creó antes para el sistema (comentario "Punto de venta"):
  # una instalación anterior pudo dejar el puerto abierto a todo internet. Abajo se crea la que toca.
  REGLAS_PDV="$(ufw show added 2>/dev/null | grep -F "comment 'Punto de venta" | sed -e 's/^ufw //' -e "s/ comment '.*'\$//" || true)"
  while read -r regla; do
    # shellcheck disable=SC2086  # la regla son varias palabras, tal como la muestra ufw
    if [ -n "$regla" ]; then ufw --force delete $regla >/dev/null 2>&1 || true; fi
  done <<< "$REGLAS_PDV"
  if [ -n "$DOMINIO" ] || [ -n "${DOMINIO_ANTERIOR:-}" ]; then
    ufw allow 80/tcp comment 'HTTP (Caddy)' >/dev/null
    ufw allow 443/tcp comment 'HTTPS (Caddy)' >/dev/null
    ufw allow 443/udp comment 'HTTP/3 (Caddy)' >/dev/null
    info "Abiertos 80 y 443 (Caddy). El puerto $PUERTO queda cerrado hacia fuera."
  elif [ -n "$RED_LOCAL" ]; then
    ufw allow from "$RED_LOCAL" to any port "$PUERTO" proto tcp comment 'Punto de venta (red local)' >/dev/null
    info "Abierto $PUERTO/tcp solo para la red local $RED_LOCAL (sin HTTPS)."
  else
    info "El puerto $PUERTO queda CERRADO hacia fuera (sin DOMINIO ni RED_LOCAL)."
    info "Para la red de la tienda vuelve a ejecutar con RED_LOCAL=192.168.1.0/24 (la tuya); en un VPS usa"
    info "DOMINIO (HTTPS) o entra con un túnel SSH: ssh -L $PUERTO:127.0.0.1:$PUERTO usuario@IP_DEL_SERVIDOR"
  fi
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw --force enable >/dev/null
  info 'Firewall activo. Revisa con: sudo ufw status'
fi

# ---------- 10. Usuario administrador inicial ----------
# Solo la primera vez (sin base de datos): admin con una contraseña ALEATORIA que se muestra al final.
# Nunca admin123: el sistema queda en internet en cuanto Caddy obtiene el certificado.

CLAVE_INICIAL=''
if [ ! -f "$DATA_DIR/tienda.db" ]; then
  paso 'Creando el usuario administrador inicial...'
  CLAVE_INICIAL="$(cd "$APP_DIR" && umask 0027 && runuser -u "$USUARIO" -- env NODE_ENV=production DATA_DIR="$DATA_DIR" \
    "$NODE_BIN" --disable-warning=ExperimentalWarning -e \
    "console.log = () => {}; const db = require('./server/db'); db.open(); const c = require('./server/auth').ensureAdmin(); db.close(); process.stdout.write(c || '')")" \
    || error 'No se pudo crear la base de datos inicial.'
  info 'Usuario admin creado con una contraseña temporal (se muestra al final).'
fi

# ---------- 11. Arranque y verificación ----------

URL_LOCAL="http://127.0.0.1:$PUERTO/api/public/settings"
if usar_systemd; then
  paso 'Iniciando el sistema...'
  systemctl restart "$SERVICIO"
  LISTO=0
  for _ in $(seq 1 30); do
    if curl -fsS --noproxy '*' -o /dev/null --max-time 3 "$URL_LOCAL" 2>/dev/null; then
      LISTO=1
      break
    fi
    sleep 1
  done
  if [ "$LISTO" != 1 ]; then
    journalctl -u "$SERVICIO" -n 40 --no-pager >&2 || true
    error "El sistema no respondió en $URL_LOCAL. Revisa los mensajes de arriba (journalctl -u $SERVICIO)."
  fi
  info "El sistema responde en el puerto $PUERTO (usuario $USUARIO)."
else
  paso 'SIN_SYSTEMD=1: el sistema no se inició. Para iniciarlo a mano:'
  info "runuser -u $USUARIO -- env NODE_ENV=production PORT=$PUERTO DATA_DIR=$DATA_DIR TRUST_PROXY=loopback${DOMINIO:+ HOST=127.0.0.1} \\"
  info "  sh -c 'cd $APP_DIR && exec $NODE_BIN --disable-warning=ExperimentalWarning server/index.js'"
fi

# ---------- Resumen ----------

DOMINIO_FINAL="${DOMINIO:-${DOMINIO_ANTERIOR:-}}"
echo ''
echo '  =================================================='
echo '   Listo: Sistema de Punto de Venta instalado'
echo '  =================================================='
if [ -n "$DOMINIO_FINAL" ]; then
  echo "   Abre:  https://$DOMINIO_FINAL"
  echo '   (el certificado HTTPS puede tardar un par de minutos la primera vez)'
else
  for ip in $(hostname -I 2>/dev/null || true); do
    case "$ip" in *:*) continue ;; esac
    echo "   Abre:  http://$ip:$PUERTO"
  done
  echo '   Sin DOMINIO la conexión NO va cifrada: úsalo solo en red local o'
  echo '   vuelve a ejecutar con DOMINIO=tu-dominio para activar HTTPS.'
fi
echo ''
if [ -n "$CLAVE_INICIAL" ]; then
  echo "   Primer ingreso:  usuario admin  /  contraseña $CLAVE_INICIAL"
  echo '   Anótala y entra cuanto antes: es temporal y el sistema te pedirá cambiarla.'
else
  echo '   Entra con tus usuarios de siempre (la información se conservó).'
fi
echo "   ¿Olvidaste la contraseña del administrador?  cd $APP_DIR && sudo -u $USUARIO env DATA_DIR=$DATA_DIR $NODE_BIN scripts/restablecer-admin.js"
echo ''
echo "   Datos y respaldos:  $DATA_DIR  (respaldos/ diarios automáticos)"
echo "   Estado:             systemctl status $SERVICIO"
echo "   Mensajes:           journalctl -u $SERVICIO -f"
echo '   Actualizar:         vuelve a ejecutar este mismo script'
if ! { command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; }; then
  echo ''
  if [ -n "$DOMINIO_FINAL" ]; then
    echo '   Recomendado: activa el firewall con FIREWALL=1 (deja abiertos solo SSH, 80 y 443).'
  else
    echo "   ATENCIÓN: sin DOMINIO ni firewall, el puerto $PUERTO queda abierto, SIN cifrar, a cualquiera que"
    echo '   llegue a este servidor. En un VPS usa DOMINIO; en la red de la tienda, FIREWALL=1 RED_LOCAL=tu-red/24.'
  fi
fi
echo ''
