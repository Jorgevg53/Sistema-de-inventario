#!/usr/bin/env bash
# Inicia el sistema de punto de venta (macOS / Linux).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instálalo desde https://nodejs.org (versión LTS) y vuelve a intentar."
  exit 1
fi

# node:sqlite viene integrado desde Node.js 22.13 / 23.4 (misma regla que server/db.js).
if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 23 || (a === 23 && b >= 4) || (a === 22 && b >= 13) ? 0 : 1)'; then
  echo "Este sistema necesita Node.js 22.13 o superior; en la serie 23, la 23.4 o superior (tienes $(node -v))."
  echo "Descarga la versión LTS más reciente en https://nodejs.org y vuelve a intentar."
  exit 1
fi

PUERTO="${PORT:-3000}"
URL="http://localhost:$PUERTO"

# Si el sistema ya está abierto (por ejemplo, en otra terminal), solo se abre el navegador:
# nunca debe haber dos copias del sistema sobre la misma base de datos.
if node -e 'require("http").get("http://127.0.0.1:" + process.argv[1] + "/api/public/settings", (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on("error", () => process.exit(1)).setTimeout(3000, () => process.exit(1))' "$PUERTO"; then
  echo "El sistema ya está abierto en $URL"
  if [ "${ABRIR_NAVEGADOR:-1}" = 1 ]; then
    if [ "$(uname)" = Darwin ]; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 & fi
  fi
  exit 0
fi

# Instala los componentes si falta alguno (primera vez o una instalación que se interrumpió) o si
# cambió package-lock.json (actualización). npm ci instala exactamente lo del lock y nunca lo modifica.
if ! node -e 'const fs = require("fs"); const deps = Object.keys(require("./package.json").dependencies || {}); process.exit(deps.every((d) => fs.existsSync("node_modules/" + d + "/package.json")) ? 0 : 1)' \
  || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "Instalando los componentes del sistema (se necesita internet)..."
  if ! npm ci --omit=dev --no-audit --no-fund; then
    echo "No se pudieron instalar los componentes del sistema. Revisa tu conexión a internet y vuelve a intentar."
    exit 1
  fi
fi

# La base de datos y los respaldos (contraseñas cifradas, clientes, ventas) solo los puede leer este usuario.
umask 077
if [ -z "${DATA_DIR:-}" ] && [ -d data ]; then chmod 700 data 2>/dev/null; fi

ABRIR_NAVEGADOR="${ABRIR_NAVEGADOR:-1}" exec node --disable-warning=ExperimentalWarning server/index.js
