# Imagen de JARVIS (asistente personal).
# Lo normal es usar docker-compose.yml (docker compose up -d --build), que ya trae volumen, puerto y contraseña.

# Node.js 22 (>= 22.13) trae node:sqlite integrado: no hace falta compilar nada.
FROM node:22-alpine

# Zona horaria: la agenda se guarda en hora LOCAL, así que el contenedor necesita la base de zonas horarias.
RUN apk add --no-cache tzdata

ENV NODE_ENV=production \
    TZ=America/Mexico_City \
    PORT=3100 \
    DATA_DIR=/app/data

WORKDIR /app

# Primero solo las dependencias: esta capa se reutiliza mientras package*.json no cambie.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && rm -rf /root/.npm /tmp/node-compile-cache

COPY server ./server
COPY public ./public

# Carpeta de datos (agenda, proyectos, clave de Claude) propiedad del usuario node.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

# Sin privilegios de root.
USER node

EXPOSE 3100

# Salud: pide /api/status con node (la imagen no trae curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:'+(process.env.PORT||3100)+'/api/status',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# Forma exec: node recibe SIGTERM directamente y cierra la base de datos limpiamente.
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
