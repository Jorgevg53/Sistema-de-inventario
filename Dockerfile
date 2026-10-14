# Imagen del Sistema de Punto de Venta e Inventario.
# Construir:  docker build -t sistema-inventario .
# Lo normal es usar docker-compose.yml (docker compose up -d), que ya trae volumen, puerto y zona horaria.

# Node.js 22 (>= 22.13) trae node:sqlite integrado: no hace falta compilar nada.
FROM node:22-alpine

# Zona horaria: las fechas se guardan en hora LOCAL (SQLite 'localtime' y Node),
# así que el contenedor necesita la base de zonas horarias. Sin esto todo quedaría en UTC.
RUN apk add --no-cache tzdata

# NODE_ENV=production también hace que el usuario admin inicial reciba una contraseña ALEATORIA
# (se ve con: docker compose logs tienda | grep "Usuario inicial"), nunca admin123.
ENV NODE_ENV=production \
    TZ=America/Mexico_City \
    PORT=3000 \
    DATA_DIR=/app/data

WORKDIR /app

# Primero solo las dependencias: esta capa se reutiliza mientras package*.json no cambie.
# Luego se borran la caché de npm y sus temporales para que la imagen pese menos.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && rm -rf /root/.npm /tmp/node-compile-cache

# Código de la aplicación (solo lo necesario para ejecutar) y la herramienta de recuperación
# de la contraseña del administrador (DESPLIEGUE.md, sección 8.6).
COPY server ./server
COPY public ./public
COPY scripts/restablecer-admin.js ./scripts/

# Carpeta de datos (base de datos, respaldos/ y tmp/) propiedad del usuario node.
# Un volumen con nombre montado aquí hereda estos permisos la primera vez.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

# Sin privilegios de root.
USER node

EXPOSE 3000

# Salud: pide /api/public/settings con node (la imagen no trae curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/public/settings',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# Forma exec: node recibe SIGTERM directamente y cierra la base de datos limpiamente.
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
