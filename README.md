# Sistema de Punto de Venta e Inventario — Tienda de Natación y Deportes

Sistema completo para controlar **ventas, inventario, caja, compras, clientes y reportes** de una tienda de
natación y artículos deportivos. Funciona en el navegador (Chrome, Edge, Firefox), **no necesita internet**
una vez instalado y se puede usar desde la computadora de la caja, una tablet o un celular conectados a la
misma red Wi‑Fi.

![Tecnologías](https://img.shields.io/badge/Node.js-22.13%2B-339933) ![Base de datos](https://img.shields.io/badge/SQLite-integrada-0369a1)

---

## ✨ Funciones principales

### 🛒 Punto de venta (rápido y fácil)
- Búsqueda **instantánea** por nombre, marca, SKU, talla, color o código de barras.
- Compatible con **lector de código de barras** (escanea y el producto se agrega solo). `3*CODIGO` agrega 3 piezas.
- Catálogo visual con fotos, filtros por categoría y existencias en tiempo real.
- **Selector de tallas y colores** en forma de tabla (ideal para trajes de baño, ropa y calzado).
- Descuentos por producto o a toda la venta (% o monto fijo), con **límite para cajeros**.
- Cobro en **efectivo** (con botones de billetes y cálculo de cambio), **tarjeta**, **transferencia** o **pago mixto**.
- **Ventas en espera** (pausar una venta para atender a otro cliente y recuperarla después).
- Cliente opcional con alta rápida, notas en el ticket y **ticket impreso** (58 mm u 80 mm) con código de barras.
- La venta en curso se recupera si se cierra o recarga la página por accidente.
- Atajos de teclado: `F2` buscar · `F4` cliente · `F7` recuperar · `F8` en espera · `F9` descuento · `F12` cobrar ·
  `+`/`−` cantidad · `Supr` quitar · `*` editar línea.

### 📦 Inventario
- Productos con **variantes de talla y color**, cada una con su SKU, código de barras, costo, precio, existencia,
  mínimo y ubicación. Generador automático de combinaciones (p. ej. tallas 28‑40 × colores).
- Fotos de producto, marcas, categorías con color, proveedor y género (Hombre, Mujer, Niño, Niña, Unisex).
- **Códigos de barras automáticos** (EAN‑13 interno) e **impresión de etiquetas** en hoja carta o rollo térmico.
- **Entradas de mercancía (compras)** con actualización de costo promedio y, opcionalmente, del precio de venta.
- **Ajustes** (merma, daño, robo, regalo…) y **conteo físico** escaneando las piezas.
- **Kardex**: historial completo de cada movimiento (quién, cuándo, por qué y existencia antes/después).
- Alertas de **stock bajo** y **agotados**; lista de pedido sugerido según ventas de los últimos 30 días.
- Importación/exportación de productos con **Excel (CSV)**.

### 💵 Caja
- Apertura con fondo inicial, entradas y salidas de efectivo, **corte parcial (X)** y **corte final (Z)**.
- Conteo de billetes y monedas, cálculo de **faltante o sobrante** y corte impreso.
- Historial de cortes por cajero.

### 🧾 Ventas, devoluciones y clientes
- Historial con filtros (fechas, forma de pago, vendedor, estado), reimpresión de tickets y exportación.
- **Cancelaciones** (mismo turno) y **devoluciones parciales** con reembolso proporcional y regreso al inventario.
- Directorio de clientes con historial de compras, total comprado y productos favoritos.

### 📊 Reportes
- Ventas netas, **utilidad bruta y margen**, ticket promedio, comparación con el periodo anterior.
- Estado de resultados, ventas por día/mes, por hora, por día de la semana, por forma de pago y por vendedor.
- Productos, tallas/colores, categorías y marcas más vendidos.
- Valor del inventario (a costo y a precio de venta), productos por surtir y **productos sin movimiento**.

### 👥 Usuarios y seguridad
| Rol | Puede |
|---|---|
| **Administrador** | Todo: ventas, inventario, reportes, cancelaciones, devoluciones, usuarios y configuración. |
| **Cajero** | Punto de venta, su caja, clientes e historial de ventas. Ve productos sin modificarlos. |
| **Almacén** | Productos, ajustes, conteos, compras y proveedores. No vende. |

Contraseñas cifradas, sesiones que expiran y bloqueo temporal tras varios intentos fallidos.

### 🗄️ Respaldos
- Descarga de un **respaldo completo** con un clic y restauración desde archivo (con copia automática previa).

---

## 🚀 Instalación

> **Guía completa paso a paso: [DESPLIEGUE.md](DESPLIEGUE.md).** Explica cómo instalarlo en la PC de la tienda
> con Windows, usarlo desde tablets y otras cajas, entrar desde fuera de la tienda, montarlo en un servidor con
> **Docker** o en un **servidor Linux (VPS)** con HTTPS, además de respaldos, actualizaciones, seguridad y solución
> de problemas.

### Requisito
Instala **Node.js 22.13 o superior** (versión **LTS**) desde <https://nodejs.org>. Es gratuito.

### Windows (lo más fácil)
1. Descarga este proyecto (botón verde **Code → Download ZIP**) y descomprímelo, por ejemplo en `C:\PuntoDeVenta`.
2. Haz doble clic en **`iniciar.bat`**.
   - La primera vez instalará los componentes necesarios (requiere internet solo esa vez).
   - Se abrirá el navegador automáticamente en `http://localhost:3000`.
3. Entra con el usuario inicial:
   - **Usuario:** `admin`
   - **Contraseña:** `admin123` (el sistema te pedirá cambiarla).
4. *(Opcional)* **`instalar-inicio-automatico.bat`**: el sistema se abre solo al entrar a Windows y se crea un
   acceso directo en el escritorio. `quitar-inicio-automatico.bat` lo desactiva.
5. *(Opcional)* **`permitir-acceso-en-red.bat`**: permite entrar desde tablets, celulares y otras cajas de la misma
   red y muestra la dirección que deben usar.

> Para cerrar el sistema, cierra la ventana negra. No guardes la carpeta dentro de OneDrive ni la abras desde el ZIP:
> toda la información se guarda en su carpeta `data`.

### macOS / Linux
```bash
./iniciar.sh
```

### Docker (servidor)
```bash
docker compose up -d --build   # http://localhost:3000 · datos en el volumen sistema-inventario_datos
```
En Docker la contraseña inicial de `admin` es **aleatoria**: `docker compose logs tienda | grep "Usuario inicial"`.
HTTPS, zona horaria y respaldos con Docker: [DESPLIEGUE.md › Servidor en la nube con Docker](DESPLIEGUE.md#33-servidor-en-la-nube-con-docker).

### Servidor Linux (Ubuntu 22.04 / 24.04) sin Docker
```bash
sudo DOMINIO=tienda.ejemplo.com CORREO=tu@correo.com TZ_TIENDA=America/Mexico_City FIREWALL=1 bash deploy/instalar-ubuntu.sh
```
Este comando instala Node.js, el servicio `punto-de-venta` (systemd) y HTTPS automático con Caddy, y al final muestra
la contraseña inicial (aleatoria) de `admin`. Ver
[DESPLIEGUE.md › Opción D](DESPLIEGUE.md#4-opción-d-servidor-linux-vps-ubuntu-sin-docker).

¿Olvidaste la contraseña del administrador? `restablecer-admin.bat` (Windows) o `node scripts/restablecer-admin.js`
generan una temporal: ver [DESPLIEGUE.md › 8.6](DESPLIEGUE.md#86-olvidé-la-contraseña-del-administrador).

### Manualmente (cualquier sistema)
```bash
npm install
npm start          # inicia en http://localhost:3000
```

Variables opcionales: `PORT` (puerto, por defecto 3000) y `DATA_DIR` (carpeta de datos, por defecto `./data`).
Las demás (`TRUST_PROXY`, `AUTO_RESPALDO`, `RESPALDOS_DIAS`…) están en
[DESPLIEGUE.md › Referencia técnica](DESPLIEGUE.md#9-referencia-técnica).

---

## 🧭 Primeros pasos

1. **Configuración → Tienda**: escribe el nombre, dirección, teléfono y RFC de tu tienda; revisa el IVA (16 % incluido en el precio por defecto).
2. **Configuración → Usuarios**: crea una cuenta para cada cajero o encargado de almacén.
3. **Productos**: da de alta tus productos (o impórtalos desde Excel en *Configuración → Respaldo e importación*).
   - ¿Quieres explorar antes? En el **Inicio** o en *Configuración → Respaldo e importación* puedes **cargar datos de ejemplo**.
4. **Etiquetas**: imprime los códigos de barras para pegarlos en los productos que no traen código.
5. **Punto de venta**: abre la caja con tu fondo inicial y ¡empieza a vender!
6. Al final del día: **Caja → Cerrar caja** para hacer el corte.

### Importar productos desde Excel
Descarga la plantilla en *Configuración → Respaldo e importación*. Columnas disponibles:

`nombre, categoria, marca, proveedor, genero, descripcion, sku, codigo_barras, talla, color, costo, precio, stock, stock_minimo, ubicacion, activo`

Las filas con el **mismo nombre y marca** se agrupan como tallas/colores de un mismo producto. En Excel usa
*Guardar como → CSV UTF‑8*.

---

## 🖨️ Equipo recomendado
- **Lector de código de barras USB** (cualquiera que funcione como teclado). No requiere configuración.
- **Impresora de tickets térmica** de 58 u 80 mm instalada en Windows. En el diálogo de impresión elige la
  impresora, márgenes *Ninguno* y desactiva *Encabezados y pies de página*.
  Para imprimir sin diálogo, abre Chrome con la opción `--kiosk-printing`.
- **Etiquetas**: impresora normal con hojas carta de etiquetas adheribles o impresora de etiquetas de 50 × 25 mm.

## 📱 Usar desde otra computadora, tablet o celular
Al iniciar, la ventana del sistema muestra una dirección como `http://192.168.1.50:3000`. Ábrela desde cualquier
dispositivo conectado a la misma red Wi‑Fi. (Si Windows pregunta, permite el acceso de Node.js en redes privadas.)

## 💾 Respaldos
Toda la información se guarda en `data/tienda.db`. Haz un respaldo al menos una vez por semana desde
**Configuración → Respaldo e importación → Descargar respaldo** y guárdalo en una USB o en la nube.

---

## 🛠️ Para desarrolladores

```bash
npm install
npm run dev     # reinicia el servidor al guardar cambios
npm test        # pruebas automáticas de la API
npm run demo    # carga datos de demostración en una base vacía
```

**Tecnologías:** Node.js (Express 5 + SQLite integrado `node:sqlite`), Vue 3, Chart.js y JsBarcode servidos
localmente (sin dependencias de internet ni pasos de compilación). Íconos de [Lucide](https://lucide.dev) (ISC).

```
server/
  index.js        Servidor HTTP y montaje de rutas
  db.js           Esquema SQLite, migraciones y configuración
  auth.js         Contraseñas, sesiones, roles y permisos
  stock.js        Movimientos de inventario (kardex) y costo promedio
  demo.js         Datos de demostración
  routes/         API: productos, inventario, ventas, caja, clientes, reportes, respaldos…
public/
  index.html      Aplicación (una sola página)
  css/app.css     Estilos
  js/core.js      API, estado, formatos y rutas
  js/components.js Componentes reutilizables
  js/print.js     Tickets, cortes y etiquetas
  js/views/       Pantallas (punto de venta, productos, reportes, …)
test/             Pruebas automáticas (node --test)
```
