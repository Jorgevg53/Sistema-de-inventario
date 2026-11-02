# Cómo desplegar JARVIS

Esta guía explica cómo dejar JARVIS funcionando de forma permanente. Empieza por la opción A; las otras se
agregan después si las necesitas.

| | A. Tu computadora | B. + Tu celular, desde cualquier lugar | C. Servidor en la nube |
|---|---|---|---|
| Para qué | Usarlo en tu PC (o Mac) | Usarlo también desde el celular, **con voz** | Tenerlo en línea 24/7 sin depender de tu PC |
| Dónde viven tus datos | En tu computadora | En tu computadora | En un servidor rentado |
| Costo | Gratis | Gratis (Tailscale, uso personal) | ≈ US$5–7 al mes + dominio (≈ US$10–12 al año) |
| Dificultad | Fácil (10 minutos) | Fácil | Técnica |

En todas, la inteligencia de Claude es opcional y se paga aparte según su uso (ver la sección 4).

---

## 1. Opción A: en tu computadora

### 1.1 Instala Node.js
Descarga la versión **LTS** de <https://nodejs.org/es/download> e instálala con las opciones predeterminadas
(siguiente, siguiente…). JARVIS necesita Node.js 22.13 o más reciente.

### 1.2 Descarga JARVIS
1. En la página del repositorio en GitHub pulsa **Code → Download ZIP**.
2. Haz clic derecho sobre el ZIP → **Extraer todo…** y guárdalo en una carpeta fija, por ejemplo `C:\JARVIS`.
   - No lo abras desde dentro del ZIP.
   - No lo guardes dentro de OneDrive: puede bloquear la base de datos mientras sincroniza.

### 1.3 Primer inicio
- **Windows:** abre la carpeta `jarvis` y haz doble clic en **`iniciar-jarvis.bat`**. La primera vez instala sus
  componentes (necesita internet solo esa vez). Se abre el navegador en **http://localhost:3100**.
  Si Windows muestra «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas**.
- **Mac / Linux:** en una terminal, dentro de la carpeta `jarvis`, ejecuta `./iniciar.sh`.

La ventana negra es JARVIS funcionando: **no la cierres** mientras lo uses (puedes minimizarla).

### 1.4 Configuración inicial (en JARVIS → Ajustes)
1. **Perfil:** tu nombre y cómo quieres que te llame.
2. **Inteligencia (Claude):** pega tu clave (sección 4) si quieres conversación libre.
3. **Voz y avisos:** pulsa **Permitir notificaciones** y **Probar voz**.
4. **Agenda:** tu horario de trabajo y el aviso predeterminado.

### 1.5 Que se abra solo al prender la computadora (Windows)
Haz doble clic en **`jarvis\instalar-inicio-automatico.bat`**. Crea un acceso directo en la carpeta Inicio de Windows
(JARVIS se abre solo, minimizado) y otro llamado **JARVIS** en el Escritorio. Para desactivarlo usa
`quitar-inicio-automatico.bat`.

> **Recordatorios:** suenan mientras JARVIS esté abierto en una pestaña del navegador y la computadora esté
> encendida. En **Configuración de Windows → Sistema → Energía** pon la suspensión en «Nunca» si quieres que te
> avise aunque no estés usando la PC.

---

## 2. Opción B: úsalo desde tu celular (con voz), desde cualquier lugar

El navegador solo permite usar el micrófono en `http://localhost` o con **HTTPS**. Tailscale te da una dirección
`https://…` privada, que solo funciona en **tus** dispositivos, sin abrir puertos del módem y sin comprar dominio.

1. **Define una contraseña:** en la computadora donde corre JARVIS ve a **Ajustes → Seguridad y acceso**.
   (Por seguridad, lo que llega desde otros dispositivos siempre pide contraseña.)
2. **Instala Tailscale en esa computadora** desde <https://tailscale.com/download> e inicia sesión.
   - En el ícono de Tailscale (junto al reloj): **Preferences → Run unattended**, para que siga conectado aunque
     se cierre la sesión.
   - En <https://login.tailscale.com/admin/machines>, en tu computadora: **Disable key expiry** (si no, la conexión
     caduca a los 180 días).
3. **Publica JARVIS en tu red privada.** Abre `cmd` (en Windows, **como administrador**) o una terminal y ejecuta:
   ```bat
   tailscale serve --bg 3100
   ```
   Te mostrará una dirección como `https://mi-pc.tu-red.ts.net`. Si te pide activar HTTPS, abre el enlace que
   aparece y actívalo.
4. **En tu celular** instala la app **Tailscale**, entra con **la misma cuenta**, abre esa dirección `https://…`
   e inicia sesión con tu contraseña.
5. *(Recomendado)* En el menú del navegador elige **Agregar a la pantalla de inicio** para abrir JARVIS como una app.

La computadora tiene que estar encendida y con JARVIS abierto (usa la opción 1.5). El plan Personal de Tailscale es
gratis para uso personal. Para dejar de publicarlo: `tailscale serve reset`.

---

## 3. Opción C: servidor en la nube con Docker (24/7)

*Sección técnica.* JARVIS corre en un servidor rentado y lo abres en `https://jarvis.tudominio.com` desde cualquier
dispositivo.

La carpeta `jarvis` trae `Dockerfile`, `docker-compose.yml` y `deploy/Caddyfile`. La imagen parte de `node:22-alpine`,
corre sin privilegios de root, guarda los datos en el volumen `jarvis_datos` y trae *healthcheck*.

### 3.1 Paso a paso en un VPS con Ubuntu
1. **Servidor y dominio.** Renta un VPS con Ubuntu 24.04 (1 GB de RAM basta). Crea un registro DNS tipo **A**
   (por ejemplo `jarvis.tudominio.com`) que apunte a la IP pública del VPS. Abre los puertos **22, 80 y 443** en el
   firewall del proveedor y en el servidor:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
   ```
2. **Instala Docker** con el plugin de compose siguiendo <https://docs.docker.com/engine/install/ubuntu/>.
3. **Descarga el código:**
   ```bash
   git clone https://github.com/Jorgevg53/Sistema-de-inventario.git
   cd Sistema-de-inventario/jarvis
   ```
4. **Crea el archivo `.env`** (no se sube a git; cambia la contraseña):
   ```bash
   cat > .env <<'EOF'
   JARVIS_CLAVE=pon-aqui-una-contraseña-larga
   PUERTO=127.0.0.1:3100
   TRUST_PROXY=1
   ZONA_HORARIA=America/Mexico_City
   EOF
   chmod 600 .env
   ```
   - `JARVIS_CLAVE` es **obligatoria** en Docker: es la contraseña para entrar.
   - `PUERTO=127.0.0.1:3100` publica JARVIS solo dentro del servidor; únicamente Caddy (HTTPS) llega a él.
     Es importante porque Docker se salta las reglas de `ufw`.
   - `TRUST_PROXY=1` hace que JARVIS confíe en Caddy (cookie de sesión segura e IP real en el límite de intentos).
   - La clave de Claude puedes guardarla después desde Ajustes, o agregar aquí `ANTHROPIC_API_KEY=sk-ant-…`.
5. **Arranca JARVIS:**
   ```bash
   docker compose up -d --build
   docker compose ps          # debe decir (healthy)
   ```
6. **HTTPS con Caddy.** Instala Caddy siguiendo <https://caddyserver.com/docs/install#debian-ubuntu-raspbian> y luego:
   ```bash
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
   sudo sed -i 's/jarvis.ejemplo.com/jarvis.tudominio.com/' /etc/caddy/Caddyfile
   sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   sudo systemctl reload caddy
   ```
   Si el punto de venta ya usa Caddy en ese servidor, **no reemplaces** su archivo: agrega al final de
   `/etc/caddy/Caddyfile` solo el bloque `jarvis.tudominio.com { … }`.
7. Abre `https://jarvis.tudominio.com` y entra con tu contraseña.

### 3.2 Día a día
```bash
docker compose logs -f                   # mensajes en vivo
docker compose restart                   # reiniciar
git pull && docker compose up -d --build # actualizar
```
**Nunca** uses `docker compose down -v`: borra el volumen con tus datos.

---

## 4. Activar la inteligencia de Claude
1. Crea una cuenta en <https://console.anthropic.com>, agrega saldo en **Billing** y crea una clave en
   **API Keys**.
2. En JARVIS: **Ajustes → Inteligencia (Claude)** → pega la clave → **Guardar** → **Probar conexión**.
3. Elige el modelo: **Opus 5.5** (el más inteligente, predeterminado), **Sonnet 5.5** (más económico) o **Haiku 5.5**
   (el más rápido y barato). Si quieres gastar menos, empieza con Sonnet 5.5.

La clave se guarda solo en la base de datos de JARVIS y nunca se muestra completa ni se incluye en los respaldos.

---

## 5. Actualizar JARVIS
- **Windows (ZIP):** cierra JARVIS, descarga el ZIP nuevo, extráelo y **copia la carpeta `jarvis\data`** de la
  instalación anterior a la nueva (ahí están tu agenda, tus proyectos y tus ajustes). Abre `iniciar-jarvis.bat`.
- **Con git (Mac, Linux o Windows):** `git pull` y vuelve a abrir JARVIS; el lanzador instala lo que haga falta.
- **Docker:** `git pull && docker compose up -d --build`.

Antes de actualizar, descarga un respaldo en **Ajustes → Respaldo**.

---

## 6. Solución de problemas
| Problema | Solución |
|---|---|
| «El puerto 3100 ya está en uso» | JARVIS ya está abierto: usa esa ventana o abre http://localhost:3100. |
| Desde otro dispositivo dice «define una contraseña» | Defínela en **Ajustes → Seguridad y acceso** desde la computadora donde corre JARVIS. |
| El micrófono no funciona | Usa Chrome o Edge, permite el micrófono y abre JARVIS por `http://localhost` o `https://` (opción B o C). |
| Los recordatorios no suenan | Deja una pestaña de JARVIS abierta, permite las notificaciones y evita que la PC se suspenda. |
| La hora de los eventos está mal (servidor) | Revisa `ZONA_HORARIA` en `.env` y ejecuta `docker compose up -d`. |
| «La clave de Claude no es válida» | Revisa la clave y el saldo en <https://console.anthropic.com>. Mientras tanto JARVIS sigue en modo básico. |
| Olvidé la contraseña | En tu computadora: dentro de la carpeta `jarvis` ejecuta `node scripts/quitar-contrasena.js` y define una nueva en Ajustes. En Docker: cambia `JARVIS_CLAVE` en `.env` y ejecuta `docker compose up -d`. |
