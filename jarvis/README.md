# 🤖 J.A.R.V.I.S. — Tu asistente personal

Asistente inteligente para **gestionar tu agenda** y **sacar adelante tus proyectos**. Le hablas (o le escribes)
en español y él agenda citas, te recuerda pendientes, organiza tus tareas, te dice cómo va cada proyecto y
—con la inteligencia de Claude— te ayuda a planearlos de principio a fin.

Funciona en el navegador (Chrome o Edge recomendados), guarda todo **en tu propia computadora** y tiene una
interfaz estilo HUD con el "reactor" que escucha, piensa y habla.

---

## ✨ Qué puede hacer

### 🗣️ Conversación por voz o texto
- Dile cosas como:
  - «Agenda dentista mañana a las 5»
  - «Recuérdame llamar a Juan en 2 horas»
  - «Junta de equipo todos los lunes a las 9:30» (empezando con «agenda…»)
  - «¿Qué tengo hoy?», «¿qué tengo esta semana?», «¿cuándo tengo tiempo libre el viernes?»
  - «Crea el proyecto Tienda en línea para el 30 de noviembre»
  - «Agrega las tareas comprar dominio, elegir plantilla y subir productos al proyecto tienda»
  - «Terminé la tarea elegir plantilla» · «¿Cómo va el proyecto tienda?» · «Cancela la cita con el dentista»
- **Micrófono**: toca el reactor o el botón 🎤 (o `Ctrl + Espacio`) y habla.
- **Manos libres** (🎧): JARVIS escucha todo el tiempo y responde cuando dices «Jarvis, …».
- **Voz**: lee sus respuestas en voz alta (se puede silenciar) y te da el **resumen del día**.

### 📅 Agenda
- Vistas de **mes, semana y lista**, con el detalle del día.
- Eventos con hora o de todo el día, lugar, categoría (con color), notas y proyecto relacionado.
- **Repeticiones**: diario, de lunes a viernes, semanal, mensual y anual (con fecha final). Se puede cancelar una
  sola ocasión o toda la serie.
- **Avisos** antes de cada evento: mensaje en pantalla, notificación del navegador y voz.
- **Alta rápida** en lenguaje natural: escribe «Café con Ana a las 4 con aviso 30 minutos antes».
- Detección de **choques de horario** y búsqueda de **huecos libres** dentro de tu jornada.

### 🗂️ Proyectos y tareas
- Proyectos con objetivo, fechas, prioridad, color y **porcentaje de avance**.
- **Tablero Kanban** (Pendiente → En progreso → Hecha) con arrastrar y soltar.
- **Bitácora** de notas por proyecto (ideas, acuerdos, avances).
- Tareas sueltas o de proyectos, con fecha y hora límite (te avisa), prioridad y notas.
- Listas de tareas para **hoy, próximos 7 días, vencidas, sin fecha** y terminadas.
- Con Claude: **«Planear con JARVIS»** propone y crea todas las tareas del proyecto con fechas realistas.

### 🧠 Dos niveles de inteligencia
| Modo | Qué necesita | Qué entiende |
|---|---|---|
| **Básico** | Nada (funciona sin internet) | Órdenes frecuentes como las de arriba. |
| **Claude** | Una clave de la API de Anthropic | Conversación libre: «mueve todas mis citas del viernes al lunes», «organiza mi semana», «desglosa mi proyecto en tareas», etc. |

Si Claude no está disponible (sin internet, clave inválida…), JARVIS responde automáticamente en modo básico.

---

## 🚀 Instalación

Requisito: **Node.js 22.13 o superior** (versión LTS) desde <https://nodejs.org>.

### Windows
1. Abre la carpeta `jarvis` y haz doble clic en **`iniciar-jarvis.bat`**.
   La primera vez instala sus componentes (necesita internet solo esa vez).
2. Se abre el navegador en **http://localhost:3100**.

### macOS / Linux
```bash
cd jarvis
./iniciar.sh
```

### Manualmente
```bash
cd jarvis
npm install
npm start        # http://localhost:3100
```

> JARVIS usa el puerto **3100**, así que puede funcionar al mismo tiempo que el punto de venta (puerto 3000).

---

## 🧠 Activar la inteligencia de Claude
1. Crea una clave en <https://console.anthropic.com/settings/keys> (el uso de la API se cobra según el consumo).
2. En JARVIS ve a **Ajustes → Inteligencia (Claude)**, pega la clave y pulsa **Guardar**.
3. Elige el modelo: **Claude Opus 5.5** (el más inteligente, recomendado), **Sonnet 5.5** (equilibrado) o
   **Haiku 5.5** (el más rápido y económico). «Probar conexión» verifica que todo esté bien.

También puedes definir la clave con la variable de entorno `ANTHROPIC_API_KEY`.

**Privacidad:** tu agenda y tus proyectos se guardan en `jarvis/data/jarvis.db`, en tu equipo. Cuando usas Claude,
tus mensajes y la información que JARVIS consulta para responderte se envían a la API de Anthropic. En modo
básico nada sale de tu computadora (el dictado por voz de Chrome sí usa los servidores de Google).

---

## 📱 Usarlo desde el celular u otra computadora
1. En la computadora donde corre JARVIS ve a **Ajustes → Seguridad y acceso** y define una **contraseña**
   (sin contraseña, por seguridad, JARVIS solo acepta conexiones de ese mismo equipo).
2. La ventana de JARVIS muestra la dirección para otros dispositivos, por ejemplo `http://192.168.1.50:3100`.
   Ábrela en el celular (misma red Wi‑Fi) y entra con tu contraseña.

> El **micrófono** del navegador solo funciona en `http://localhost` o con **HTTPS**. Desde el celular puedes
> escribir sin problema; para hablarle, publica JARVIS con HTTPS (por ejemplo detrás de Caddy como el punto de
> venta, ver `DESPLIEGUE.md` en la carpeta principal) y usa `TRUST_PROXY` si hace falta.

### Recordatorios
Los avisos suenan mientras JARVIS esté abierto en alguna pestaña del navegador. En **Ajustes → Voz y avisos**
pulsa «Permitir notificaciones» para recibirlos aunque estés en otra ventana.

---

## 💾 Respaldos
**Ajustes → Respaldo → Descargar respaldo** genera un archivo `.json` con proyectos, tareas, notas, eventos y
preferencias (sin la clave de Claude ni la contraseña). «Restaurar…» reemplaza todo por el contenido del archivo.

---

## ⚙️ Variables de entorno (opcionales)
| Variable | Para qué sirve | Predeterminado |
|---|---|---|
| `PORT` | Puerto | `3100` |
| `HOST` | Interfaz donde escucha (p. ej. `127.0.0.1` para solo este equipo) | todas |
| `DATA_DIR` | Carpeta de datos | `jarvis/data` |
| `ANTHROPIC_API_KEY` | Clave de Claude (si no se guarda en Ajustes) | — |
| `JARVIS_CLAVE` | Contraseña de acceso (en lugar de definirla en Ajustes) | — |
| `TRUST_PROXY` | Proxies de confianza si se publica detrás de uno | `loopback` |
| `ABRIR_NAVEGADOR` | `1` abre el navegador al iniciar | `1` en los lanzadores |
| `TZ` | Zona horaria (en servidores o Docker), p. ej. `America/Mexico_City` | la del equipo |

---

## 🛠️ Para desarrolladores
```bash
npm install
npm run dev      # reinicia al guardar cambios
npm test         # pruebas automáticas (la API de Claude se simula: no gasta)
```

**Tecnologías:** Node.js (Express 5 + SQLite integrado `node:sqlite`), Vue 3 sin compilación, SDK oficial de
Anthropic (`@anthropic-ai/sdk`, tool runner) y las APIs de voz del navegador. Íconos de [Lucide](https://lucide.dev) (ISC).

```
server/
  index.js        Servidor HTTP
  db.js           Esquema SQLite y ajustes
  auth.js         Contraseña, sesiones y acceso solo local
  dates.js        Fechas y el intérprete de lenguaje natural en español
  agenda.js       Eventos, repeticiones, huecos libres y recordatorios
  projects.js     Proyectos, tareas y bitácora
  summary.js      Resumen del día y búsqueda
  routes.js       API REST
  brain/
    tools.js      Herramientas que usa Claude (consultar agenda, crear eventos, tareas, proyectos…)
    claude.js     Conversación con Claude (Opus 5.5 por defecto, respaldo automático ante negativas)
    local.js      Modo básico sin internet
    index.js      Elige el modo y guarda la conversación
public/
  index.html, css/jarvis.css
  js/core.js      API, fechas, rutas, avisos y recordatorios
  js/voice.js     Voz (lectura y dictado, manos libres)
  js/chat.js      Conversación
  js/components.js, js/views/  Pantallas: inicio, agenda, proyectos, tareas y ajustes
test/             Pruebas (node --test)
```
