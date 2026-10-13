#!/usr/bin/env bash
# Inicia el sistema de punto de venta (macOS / Linux).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instálalo desde https://nodejs.org (versión LTS) y vuelve a intentar."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando componentes por primera vez..."
  npm install --omit=dev --no-audit --no-fund || exit 1
fi

ABRIR_NAVEGADOR=1 exec node --disable-warning=ExperimentalWarning server/index.js
