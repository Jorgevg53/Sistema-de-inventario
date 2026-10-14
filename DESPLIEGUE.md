# Guía de instalación y despliegue

**Sistema de Punto de Venta e Inventario — Tienda de Natación y Deportes**

Esta guía explica paso a paso cómo instalar el sistema y dejarlo funcionando en la tienda.

- Las secciones **0, 1 y 2** son para el dueño o encargado de la tienda y no piden conocimientos técnicos.
- Las secciones **3 y 4** (acceso desde internet, nube y servidores) y la **9** (referencia técnica) son para la
  persona que te ayude con la parte técnica.
- Las secciones **5 a 8** (respaldos, actualizaciones, seguridad y problemas) sirven para todos.

> **Importante: una sola instalación.** Toda la información (productos, ventas, caja, clientes y usuarios) se
> guarda en **una sola base de datos**, en la computadora o el servidor donde instalas el sistema. Instálalo en
> **un solo lugar** y haz que todas las cajas, tablets y celulares entren a ese mismo lugar. Si lo instalas en dos
> computadoras, cada una tendrá su propia información y **no se sincronizan entre sí**.

---

## Índice

0. [¿Qué opción me conviene?](#0-qué-opción-me-conviene)
1. [Opción A: una computadora con Windows en la tienda (recomendada)](#1-opción-a-una-computadora-con-windows-en-la-tienda-recomendada)
2. [Opción B: usar el sistema desde otras cajas, tablets o celulares de la tienda](#2-opción-b-usar-el-sistema-desde-otras-cajas-tablets-o-celulares-de-la-tienda)
3. [Opción C: acceso desde fuera de la tienda](#3-opción-c-acceso-desde-fuera-de-la-tienda)
4. [Opción D: servidor Linux (VPS Ubuntu) sin Docker](#4-opción-d-servidor-linux-vps-ubuntu-sin-docker)
5. [Respaldos](#5-respaldos)
6. [Actualizar el sistema y cambiarlo de computadora](#6-actualizar-el-sistema-y-cambiarlo-de-computadora)
7. [Seguridad: lista de verificación](#7-seguridad-lista-de-verificación)
8. [Solución de problemas](#8-solución-de-problemas)
9. [Referencia técnica](#9-referencia-técnica)

---

## 0. ¿Qué opción me conviene?

| Tu situación | Qué instalar | Costo aproximado | Dificultad |
|---|---|---|---|
| Una sola computadora (la caja) en la tienda | [Opción A](#1-opción-a-una-computadora-con-windows-en-la-tienda-recomendada) | Gratis | Fácil |
| Varias cajas, tablets o celulares **dentro** de la tienda | Opción A + [Opción B](#2-opción-b-usar-el-sistema-desde-otras-cajas-tablets-o-celulares-de-la-tienda) | Gratis | Fácil |
| Revisar ventas e inventario **desde tu casa o tu celular**, fuera de la tienda | Opción A + [Opción C.1 o C.2](#3-opción-c-acceso-desde-fuera-de-la-tienda) | Gratis + dominio (≈ US$10–12 al año), o ≈ US$8 al mes por usuario | Media: pide ayuda la primera vez |
| Que el sistema viva en internet y no dependa de una computadora de la tienda (por ejemplo, varias sucursales) | [Opción C.3 (Docker en la nube)](#33-servidor-en-la-nube-con-docker) u [Opción D (servidor Linux)](#4-opción-d-servidor-linux-vps-ubuntu-sin-docker) | ≈ US$5–7 al mes | Técnica |

**Recomendación:** empieza con la **Opción A** en una computadora de la tienda y, si tienes tablets u otras cajas,
agrega la **Opción B**. No cuesta nada, es lo más rápido y **sigue funcionando aunque se caiga el internet**.
Más adelante, si quieres ver el sistema desde fuera, agrega la **Opción C** sin reinstalar nada.

---

## 1. Opción A: una computadora con Windows en la tienda (recomendada)

### 1.1 Qué necesitas

- Una computadora con **Windows 10 u 11 de 64 bits**. La de la caja sirve; el sistema usa poca memoria.
  (Para saberlo: *Configuración → Sistema → Acerca de → Tipo de sistema*.)
- **Internet solo durante la instalación**. Después funciona sin internet.
- **Node.js**, versión **LTS**, **22.13 o más reciente**. Es el programa gratuito que hace funcionar el sistema.

> **¿Windows de 32 bits?** Las versiones LTS más nuevas de Node.js (24 en adelante) ya no traen instalador de 32 bits.
> En ese caso instala **Node.js 22** de 32 bits: en <https://nodejs.org/dist/latest-v22.x/> descarga el archivo que
> termina en **`-x86.msi`**. Sirve (es 22.13 o más reciente) y tiene soporte hasta abril de 2027.

### 1.2 Instalar Node.js

1. Abre <https://nodejs.org/es/download>.
2. Descarga el **instalador para Windows (.msi)** de la versión **LTS** (22 o 24; no uses la 23).
3. Ábrelo y da clic en **Siguiente** hasta **Finalizar**. Si aparece la casilla *"Automatically install the
   necessary tools"* (herramientas para módulos nativos), déjala **sin marcar**: este sistema no las necesita.
4. Comprueba que quedó bien instalado:
   1. Presiona la tecla **Windows**, escribe `cmd` y presiona **Enter**.
   2. En la ventana negra escribe lo siguiente y presiona **Enter**:
      ```bat
      node -v
      ```
   3. Debe aparecer una versión como `v22.13.0` o mayor (por ejemplo `v22.22.0` o `v24.21.0`).
      - Si dice *"no se reconoce como un comando"*, reinicia la computadora y vuelve a probar.
      - Si la versión es menor a 22.13 (por ejemplo `v20.x` o `v18.x`), instala de nuevo la versión LTS.

### 1.3 Descargar el sistema

**Forma fácil (ZIP):**

1. Abre <https://github.com/Jorgevg53/Sistema-de-inventario>.
2. Da clic en el botón verde **Code** y luego en **Download ZIP**. Se descarga la versión vigente: la rama
   predeterminada del repositorio.

**Forma técnica (con Git):** si la computadora tiene [Git para Windows](https://git-scm.com/download/win), esto deja
el sistema directamente en `C:\PuntoDeVenta` y facilita las actualizaciones
(ver [sección 6.2](#62-windows-instalado-con-git)):

```bat
git clone https://github.com/Jorgevg53/Sistema-de-inventario.git C:\PuntoDeVenta
```

### 1.4 Dónde guardarlo (muy importante)

1. **Desbloquea el ZIP antes de extraerlo.** Windows marca como "descargados de internet" los archivos que vienen
   de un ZIP, y al abrir los `.bat` mostraría el aviso *"Windows protegió su PC"*. Para evitarlo: clic derecho sobre
   el ZIP → **Propiedades** → abajo, en *Seguridad*, marca **Desbloquear** → **Aceptar**. (Si no aparece la casilla,
   no hace falta.)
2. Da clic derecho sobre el ZIP, elige **"Extraer todo..."** y luego **Extraer**.
3. Entra a las carpetas que se crearon hasta ver los archivos `iniciar.bat` y `package.json` y las carpetas
   `server` y `public`. La carpeta que los contiene se llama algo como `Sistema-de-inventario-…`: **esa es la
   carpeta del sistema**.
4. Mueve esa carpeta a `C:\` y cámbiale el nombre a `PuntoDeVenta`. Al final debe existir
   `C:\PuntoDeVenta\iniciar.bat`.

Si ya extrajiste el ZIP sin desbloquearlo, puedes desbloquear todo de una vez: abre **PowerShell** (tecla Windows,
escribe `powershell`, Enter) y ejecuta:

```powershell
Get-ChildItem C:\PuntoDeVenta -Recurse | Unblock-File
```

**¿Por qué ahí?** Toda la información de la tienda se guarda dentro de la carpeta del sistema, en
`C:\PuntoDeVenta\data`. Esa carpeta contiene la base de datos `tienda.db` y los respaldos automáticos (`respaldos`).

**No la guardes en estos lugares:**

- **Dentro del ZIP** (abriéndolo con doble clic sin extraerlo). Windows usa una carpeta temporal y los datos se
  perderían. `iniciar.bat` se niega a arrancar en ese caso.
- **Descargas**, ni **Escritorio** o **Documentos** si están dentro de **OneDrive**, ni otra carpeta que se sincronice
  con la nube. OneDrive puede bloquear o duplicar la base de datos mientras sincroniza, lo que causa errores o pérdida
  de información. `instalar-inicio-automatico.bat` te avisa si detecta OneDrive.
- **Memorias USB** ni **unidades de red**.

### 1.5 Primer inicio

1. En `C:\PuntoDeVenta` da **doble clic en `iniciar.bat`**. Se abre una ventana negra.
   - Si aparece una ventana azul *"Windows protegió su PC"*, da clic en **Más información** y luego en **Ejecutar de
     todas formas** (o desbloquea el ZIP como en la sección 1.4). Si aparece *"Advertencia de seguridad: Abrir
     archivo"*, da clic en **Ejecutar**.
   - La primera vez dice *"Instalando los componentes del sistema..."*. Necesita internet y tarda unos minutos.
   - Si falta Node.js o la versión no sirve, la ventana te lo dice y abre la página de descarga.
2. Puede aparecer un aviso del **Firewall de Windows** sobre **Node.js**. Si vas a usar tablets u otras cajas
   (Opción B), deja marcada **Redes privadas** y da clic en **Permitir acceso**. Si das clic en *Cancelar* por error,
   `permitir-acceso-en-red.bat` lo corrige después (ver [sección 2.2](#22-permitir-el-acceso-en-el-firewall)).
3. Se abre el navegador en **http://localhost:3000**. Entra con:
   - **Usuario:** `admin`
   - **Contraseña:** `admin123`
4. **Cambia la contraseña de inmediato.** Arriba aparece un aviso amarillo: *"Estás usando la contraseña inicial.
   Por seguridad, cámbiala ahora."* Da clic en **Cambiar contraseña**. También está el ícono de llave
   (**Cambiar contraseña**) abajo del menú lateral. La contraseña nueva necesita mínimo 6 caracteres. Anótala en un
   lugar seguro.
5. **La ventana negra debe quedarse abierta** mientras uses el sistema. Puedes minimizarla, pero si la cierras, el
   sistema se apaga. Para cerrarlo, cierra esa ventana (lo más sencillo) o presiona **Ctrl + C** dentro de ella. Con
   Ctrl + C, Windows pregunta *"¿Desea terminar el trabajo por lotes (S/N)?"*: escribe **S** y presiona **Enter**.

La ventana negra muestra datos útiles, por ejemplo:

```text
   Abre en este equipo:   http://localhost:3000
   Desde otro dispositivo: http://192.168.1.50:3000
   Base de datos: C:\PuntoDeVenta\data\tienda.db
   Respaldos automáticos: C:\PuntoDeVenta\data\respaldos (diarios, se conservan 30)
```

Si aparecen **varias** líneas *"Desde otro dispositivo"*, algunas son de adaptadores virtuales (VPN, máquinas
virtuales) que no sirven para las tablets. Usa la que `permitir-acceso-en-red.bat` marca como **[recomendada]**
(sección 2.2).

### 1.6 Configuración inicial

Los puntos 1 a 3 están en el menú **Configuración** (solo lo ve el administrador); los demás, en su propio menú del
lateral:

1. **Configuración → Tienda:** nombre, eslogan, dirección, teléfono, correo y RFC; IVA (16 % incluido en el precio
   por defecto); permitir o no vender sin existencias; stock mínimo por defecto; descuento máximo para cajeros. Da
   clic en **Guardar configuración**.
2. **Configuración → Ticket:** ancho del papel (**80 mm** o **58 mm**), mensaje al pie del ticket e *"Imprimir ticket
   automáticamente al cobrar"*. Prueba con **Imprimir prueba** y da clic en **Guardar**. Más detalles de la impresora
   en la [sección 8.5](#85-la-impresora-de-tickets-no-imprime-bien).
3. **Configuración → Usuarios → Nuevo usuario:** crea **una cuenta para cada persona**, con su rol:
   - **Administrador:** todo.
   - **Cajero:** punto de venta, su caja, clientes e historial de ventas.
   - **Almacén:** productos, ajustes, conteos, compras y proveedores.
4. **Productos:** dalos de alta en el menú **Productos** o impórtalos desde Excel:
   1. Ve a **Configuración → Respaldo e importación → Descargar plantilla**.
   2. Llena la plantilla en Excel y guárdala con *Guardar como → CSV UTF-8*.
   3. Súbela con **Importar archivo CSV**.
   - **Para practicar** puedes cargar productos y ventas de ejemplo con **Cargar ejemplo** (en *Configuración →
     Respaldo e importación*) o **Datos de ejemplo** (en *Inicio*). Solo funciona si no hay productos registrados.
   - **Para empezar de cero después de practicar:** cierra el sistema y cambia el nombre de la carpeta
     `C:\PuntoDeVenta\data` (por ejemplo, a `data-practica`). Al abrirlo de nuevo, el sistema empieza vacío con
     `admin` / `admin123`.
5. **Etiquetas:** imprime códigos de barras para los productos que no traen.
6. **Caja y cortes:** abre la caja con tu fondo inicial y empieza a vender. Al final del día haz el corte.

### 1.7 Que el sistema se abra solo al prender la computadora

1. En `C:\PuntoDeVenta` da **doble clic en `instalar-inicio-automatico.bat`**. No necesita permisos de administrador.
   Crea dos accesos directos llamados **"Punto de Venta"**:
   - En la carpeta **Inicio** de Windows: el sistema se abre solo, en una ventana minimizada, cada vez que entras a
     Windows con ese usuario, y **también abre el navegador** en el sistema. Si no quieres que se abra el navegador
     (por ejemplo, porque usas el acceso de Chrome de la sección 8.5), ejecuta una vez `setx ABRIR_NAVEGADOR 0` en
     `cmd`.
   - En el **Escritorio**: para abrirlo con doble clic. Si el sistema ya está abierto, solo abre el navegador.

   Al final te pregunta *"Quieres abrir el sistema ahora? [S/N]"*.
2. **No muevas ni cambies de nombre la carpeta.** Si lo haces, vuelve a ejecutar `instalar-inicio-automatico.bat`.
3. Para desactivarlo, usa **`quitar-inicio-automatico.bat`**. También te pregunta si quieres quitar el acceso del
   Escritorio.

Ten en cuenta lo siguiente:

- **No es un servicio de Windows.** El sistema arranca cuando alguien **inicia sesión en Windows**. Si la
  computadora se reinicia (por un apagón o una actualización), alguien tiene que entrar a Windows para que el sistema
  vuelva a funcionar.
- **Evita que la computadora se suspenda.** Ve a *Configuración → Sistema → Inicio/apagado y suspensión* (Windows 10)
  o *Configuración → Sistema → Energía* (Windows 11) y pon **Suspender: Nunca** cuando esté conectada a la corriente.
  Si la computadora se suspende, las tablets y cajas pierden la conexión.
- **Windows Update:** configura las **Horas activas** para que no reinicie la computadora en horario de la tienda:
  *Configuración → Actualización y seguridad → Windows Update → Cambiar horas activas* (Windows 10) o
  *Configuración → Windows Update → Opciones avanzadas → Horas activas* (Windows 11).
- Un **no-break (UPS)** protege la base de datos de los apagones.

### 1.8 Si la computadora es Mac o Linux de escritorio

Instala Node.js LTS (22.13 o más reciente) desde <https://nodejs.org>. Después, en una terminal, dentro de la carpeta
del sistema:

```bash
./iniciar.sh
```

El script revisa la versión de Node.js, instala los componentes cuando faltan (o cuando cambiaron con una
actualización) y abre el navegador. Si el sistema ya estaba abierto, solo abre el navegador. La carpeta `data` queda
legible solo para tu usuario. Para detenerlo, presiona **Ctrl + C** en la terminal. Para Mac y Linux de escritorio no
se incluyen scripts de inicio automático. Para un servidor Linux usa la
[Opción D](#4-opción-d-servidor-linux-vps-ubuntu-sin-docker).

---

## 2. Opción B: usar el sistema desde otras cajas, tablets o celulares de la tienda

Una computadora de la tienda hace de **"servidor"** (la de la Opción A) y los demás dispositivos entran a ella por el
navegador. **En los otros dispositivos no se instala nada.**

Para que funcione:

- La computadora servidor debe estar **encendida y con el sistema abierto**.
- Todos los dispositivos deben estar conectados a la **misma red** (el mismo Wi-Fi o el mismo módem) que la computadora
  servidor.

### 2.1 Dale a la computadora una dirección fija (IP reservada)

Cada aparato conectado al módem tiene una dirección, por ejemplo `192.168.1.50`. El módem las reparte solo y a veces
**las cambia**, por ejemplo después de un apagón. Si la dirección de la computadora servidor cambia, las tablets ya no
la encuentran. Por eso conviene pedirle al módem que **siempre le dé la misma** ("reservar la IP").

1. En la computadora servidor abre `cmd` (tecla Windows, escribe `cmd`, Enter) y escribe:
   ```bat
   ipconfig /all
   ```
   Busca el adaptador con el que te conectas (Wi-Fi o Ethernet) y anota tres datos:
   - **Dirección IPv4** (por ejemplo `192.168.1.50`): la dirección de la computadora.
   - **Dirección física** (por ejemplo `A4-5E-60-12-34-56`): el identificador de la tarjeta de red.
   - **Puerta de enlace predeterminada** (por ejemplo `192.168.1.254`): la dirección del módem.
2. En el navegador abre `http://` + la puerta de enlace (por ejemplo `http://192.168.1.254`). Entra con el usuario y la
   contraseña que vienen en la etiqueta del módem.
3. Busca una opción llamada **DHCP**, **Reserva de IP**, **IP estática**, **Asignación de direcciones** o
   **Address Reservation**. Agrega la computadora (por su nombre o por la dirección física) con su dirección IPv4
   actual y guarda.
4. Si no la encuentras, llama a tu compañía de internet y pide que **reserven una IP fija por DHCP** para la computadora
   de la tienda, o pídeselo a tu técnico.

### 2.2 Permitir el acceso en el firewall

En la computadora servidor, dentro de `C:\PuntoDeVenta`, da **doble clic en `permitir-acceso-en-red.bat`**. Windows te
pedirá permiso de administrador: elige **Sí**. El archivo hace cuatro cosas:

1. Crea la regla del firewall **"Punto de Venta - TCP 3000"**. Permite la entrada al puerto 3000 **solo en redes
   privadas** y **solo desde equipos de la misma red local**. Si la regla ya existía, la vuelve a crear. (Si
   cambiaste el puerto con `setx PORT`, usa ese puerto; ver sección 8.1.)
2. Muestra el **tipo de red**. La red de la tienda debe estar como **Privada**. Si aparece como **PUBLICA**, te
   pregunta si quieres cambiarla: contesta `S` **solo si es la red de tu tienda** (no la de una cafetería u otro lugar
   público).
3. Busca bloqueos de **Node.js** en el firewall (aparecen cuando alguien eligió *Cancelar* en el aviso del primer
   inicio) y te pregunta si quieres desactivarlos.
4. Muestra la **dirección para las tablets**, por ejemplo `http://192.168.1.50:3000   (Wi-Fi)   [recomendada]`.

Puedes volver a ejecutarlo cuando quieras para ver la dirección actual.

Para cambiar el tipo de red a mano: *Configuración → Red e Internet → Wi-Fi* (o *Ethernet*) → propiedades de tu red →
*Tipo de perfil de red* → **Privada**.

### 2.3 Abrir el sistema en la tablet, el celular o la otra caja

1. Conecta el dispositivo al **mismo Wi-Fi de la tienda**, no a la red de invitados.
2. Abre el navegador (Chrome, Safari o Edge) y escribe la dirección que mostró `permitir-acceso-en-red.bat`, por ejemplo
   `http://192.168.1.50:3000`. Fíjate en dos cosas:
   - Empieza con `http://` (no `https://`).
   - Lleva `:3000` al final.
3. Entra con el usuario de la persona que va a usar ese dispositivo.
4. Agrégalo a la pantalla de inicio para abrirlo como si fuera una app:
   - **Android (Chrome):** menú **⋮** → **Agregar a la pantalla principal**.
   - **iPad o iPhone (Safari):** botón **Compartir** (el cuadro con flecha) → **Agregar a inicio**.

Recuerda:

- **Los tickets se imprimen en la impresora del dispositivo donde se cobra.** Lo más práctico es cobrar en la
  computadora que tiene la impresora de tickets conectada.
- Los lectores de código de barras que funcionan **como teclado** (USB en computadoras, o Bluetooth en modo teclado)
  funcionan en el navegador sin configurar nada.

---

## 3. Opción C: acceso desde fuera de la tienda

> **Nunca abras el puerto 3000 en el módem** (lo que se conoce como "abrir puertos", *port forwarding* o *DMZ*). La
> información viajaría por internet **sin cifrar** y cualquier persona podría intentar entrar. Usa alguna de las
> opciones de abajo.

| | C.1 Tailscale | C.2 Cloudflare Tunnel | C.3 Servidor en la nube (Docker) |
|---|---|---|---|
| Dónde vive la información | En la computadora de la tienda | En la computadora de la tienda | En un servidor rentado |
| Quién puede entrar | Solo dispositivos con la app de Tailscale y tu cuenta | Cualquier navegador con la dirección (protegido con Cloudflare Access) | Cualquier navegador con la dirección |
| ¿Necesita dominio propio? | No | Sí (≈ US$10–12 al año) | Recomendado |
| Costo | Plan Personal gratis **solo para uso no comercial**; para una tienda, plan Standard ≈ US$8 por usuario al mes | Gratis (más el dominio) | ≈ US$5–7 al mes |
| Si se va la luz o el internet en la tienda | En la tienda sigue funcionando; desde fuera no hay acceso | Igual que C.1 | Sigue en línea, pero la tienda sin internet no puede vender |
| Dificultad | Fácil | Media | Técnica |

Las opciones C.1 y C.2 **no mueven la información**: la computadora de la tienda sigue siendo el servidor (Opción A),
con su inicio automático y sin suspenderse.

### 3.1 Tailscale (lo más sencillo; solo tus dispositivos)

Tailscale crea una red privada cifrada entre tus dispositivos.

1. En la computadora de la tienda, descarga Tailscale para Windows desde <https://tailscale.com/download>, instálalo e
   inicia sesión.
2. En el ícono de Tailscale (junto al reloj) ve a **Preferences → Run unattended**, para que siga conectado aunque se
   cierre la sesión o se reinicie la computadora.
3. En la consola web (<https://login.tailscale.com/admin/machines>) busca la computadora de la tienda y desactiva la
   caducidad de su llave (**Disable key expiry**). Por defecto caduca a los 180 días.
4. Abre `cmd` **como administrador** y ejecuta:
   ```bat
   tailscale serve --bg 3000
   ```
   Te mostrará una dirección como `https://nombre-de-la-pc.tu-red.ts.net`. Si te pide activar HTTPS, abre el enlace
   que aparece y actívalo.
5. En tu celular instala la app de Tailscale, entra con **la misma cuenta** y abre esa dirección `https://…`.

Tailscale entra al sistema por `localhost:3000`, así que no necesitas la regla del firewall para esto.

### 3.2 Cloudflare Tunnel (desde cualquier navegador, con tu dominio)

Cloudflare Tunnel publica el sistema en una dirección como `https://pos.tudominio.com` **sin abrir puertos** del módem.
Necesitas un dominio propio. Conviene que esta configuración la haga un técnico una sola vez; después no requiere
mantenimiento.

1. Ten funcionando la Opción A con el inicio automático y sin suspensión.
2. Crea una cuenta gratis en Cloudflare. Compra el dominio en *Cloudflare Registrar* o pasa a Cloudflare uno que ya
   tengas (cambiando sus *nameservers*).
3. En el panel ve a **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**. Ponle un nombre (por ejemplo
   `tienda`) y elige **Windows**.
4. Descarga `cloudflared` para Windows desde el enlace del panel. Abre `cmd` como administrador y pega el comando que
   te muestra el panel. Es parecido a este (con tu propio token):
   ```bat
   cloudflared.exe service install <TOKEN>
   ```
   Esto lo instala como **servicio de Windows**, que arranca solo con la computadora.
5. En el túnel agrega un **Public hostname**:
   - Subdominio: `pos`
   - Dominio: el tuyo
   - Servicio: tipo **HTTP**, URL **`localhost:3000`**
6. **Recomendado:** en **Zero Trust → Access → Applications → Self-hosted** protege `pos.tudominio.com` con una política
   *Allow* que solo deje pasar los correos del dueño y los empleados. Al entrar, Cloudflare les pide un código que
   llega a su correo. Así la pantalla de inicio de sesión del sistema no queda expuesta directamente a internet. El
   plan gratuito de Zero Trust admite hasta 50 usuarios.
7. Prueba `https://pos.tudominio.com` desde el celular **con datos móviles** (sin el Wi-Fi de la tienda).

Ten en cuenta:

- En el plan gratuito, Cloudflare no deja subir archivos de más de **100 MB** por petición. Si tu respaldo pesa más,
  restáuralo desde la tienda, en `http://localhost:3000`.
- Los nombres de los menús de Cloudflare cambian con frecuencia. Si no los encuentras, sigue la guía oficial:
  <https://developers.cloudflare.com/tunnel/get-started/>.

### 3.3 Servidor en la nube con Docker

*Sección técnica.* El sistema corre en un servidor rentado y en la tienda se abre `https://tienda.tudominio.mx` en el
navegador. La tienda **necesita internet para vender**.

El repositorio incluye `Dockerfile`, `docker-compose.yml` y `.dockerignore`. La imagen:

- Parte de `node:22-alpine` e instala `tzdata`.
- Usa la zona horaria `America/Mexico_City` y corre como el usuario `node` (sin root).
- Guarda los datos en `/app/data`, dentro del volumen `sistema-inventario_datos`.
- Expone el puerto 3000 y trae *healthcheck*.

El servicio de compose se llama `tienda`, usa `restart: unless-stopped` y limita los registros a 3 archivos de 10 MB.

#### Paso a paso en un VPS con Ubuntu

1. **Prepara el servidor y el dominio.**
   - Renta un VPS con Ubuntu 24.04; 1 GB de RAM basta (ver la [tabla de proveedores](#34-proveedores-y-costos-aproximados)).
   - Crea un registro DNS tipo **A** (por ejemplo `tienda.tudominio.mx`) que apunte a la IP pública del VPS.
   - Si el proveedor tiene firewall en su panel, abre ahí los puertos **22, 80 y 443**.
2. **Instala Docker Engine** con el plugin de compose, siguiendo la guía oficial:
   <https://docs.docker.com/engine/install/ubuntu/>. Comprueba:
   ```bash
   docker compose version
   ```
3. **Descarga el código:**
   ```bash
   git clone https://github.com/Jorgevg53/Sistema-de-inventario.git
   cd Sistema-de-inventario
   ```
4. **Crea los ajustes locales.** Van en archivos propios, sin editar los del repositorio, para que `git pull` no
   choque al actualizar:
   ```bash
   cat > .env <<'EOF'
   PUERTO=127.0.0.1:3000
   ZONA_HORARIA=America/Mexico_City
   EOF

   cat > docker-compose.override.yml <<'EOF'
   services:
     tienda:
       environment:
         TRUST_PROXY: "1"
   EOF
   ```
   Qué hace cada ajuste:
   - `PUERTO=127.0.0.1:3000` publica el sistema **solo dentro del servidor**: únicamente Caddy (HTTPS) puede llegar a
     él. Es importante porque **Docker se salta las reglas de `ufw`** en los puertos que publica.
   - `TRUST_PROXY: "1"` hace que el sistema confíe en los encabezados del proxy. Así la cookie de sesión se marca
     `Secure` y el límite de intentos de inicio de sesión usa la IP real del cliente.
   - `ZONA_HORARIA` es la zona horaria de las ventas y los cortes. Otras: `America/Monterrey`, `America/Cancun`,
     `America/Tijuana`, `America/Hermosillo`, `America/Mazatlan`, `America/Chihuahua`, `America/Merida`.
   - *Solo para una red local sin HTTPS* (por ejemplo, una computadora Linux dentro de la tienda): no crees estos
     archivos. Así el puerto 3000 queda publicado en todas las interfaces.
5. **Construye y arranca el sistema:**
   ```bash
   docker compose up -d --build
   ```
6. **Comprueba que funciona.** `docker compose ps` debe mostrar `(healthy)` y el `curl` debe responder
   `{"ok":true,...}`:
   ```bash
   docker compose ps
   curl http://127.0.0.1:3000/api/health
   ```
   Dentro de Docker el sistema no conoce la IP del servidor: en `docker compose logs` muestra
   `Abre: http://IP-DEL-SERVIDOR:PUERTO`. Se entra por el dominio, o por la IP del servidor y el puerto publicado.
7. **Activa HTTPS con Caddy en el servidor.**
   1. Instala Caddy con los comandos oficiales (<https://caddyserver.com/docs/install#debian-ubuntu-raspbian>):
      ```bash
      sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
      sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
      sudo apt update
      sudo apt install caddy
      ```
   2. Usa la plantilla `deploy/Caddyfile` del repositorio con tu dominio:
      ```bash
      sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
      sudo sed -i 's/{$DOMINIO:tienda.ejemplo.com}/tienda.tudominio.mx/' /etc/caddy/Caddyfile
      sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
      sudo systemctl reload caddy
      ```
      La plantilla:
      - Obtiene y renueva el certificado de Let's Encrypt sola.
      - Comprime las respuestas y agrega HSTS.
      - Acepta archivos de hasta 512 MiB solo en la restauración de respaldos; en todo lo demás, hasta 25 MB.
      - Reenvía el tráfico a `127.0.0.1:3000`. El `TRUST_PROXY: "1"` del paso 4 es lo que hace que el sistema
        confíe en Caddy (cookie `Secure` e IP real del cliente).

      Para recibir avisos de Let's Encrypt en tu correo, agrega el bloque `{ email … }` que se explica al inicio del
      archivo.
8. **Activa el firewall** (deja abiertos SSH, 80 y 443):
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
9. **Entra al sistema en cuanto el dominio responda.** En Docker la contraseña inicial de `admin` **no es
   `admin123`**: es aleatoria y aparece en los mensajes del primer arranque:
   ```bash
   docker compose logs tienda | grep "Usuario inicial"
   ```
   Abre `https://tienda.tudominio.mx`, entra con `admin` y esa contraseña, y **cámbiala** (el sistema te lo pide). Si
   ya no aparece en los mensajes, genera otra con la [sección 8.6](#86-olvidé-la-contraseña-del-administrador).

#### Comandos del día a día (en la carpeta `Sistema-de-inventario`)

| Para… | Comando |
|---|---|
| Ver el estado y la salud | `docker compose ps` |
| Ver los mensajes en vivo | `docker compose logs -f` |
| Reiniciar | `docker compose restart` |
| Detener / volver a iniciar | `docker compose stop` / `docker compose start` |
| Apagar y quitar el contenedor (los datos se conservan) | `docker compose down` |
| Cargar datos de ejemplo (solo con la base vacía) | `docker compose exec tienda npm run demo` |
| Actualizar a una versión nueva | `git pull && docker compose up -d --build` |
| Copiar los respaldos automáticos al servidor | `docker compose cp tienda:/app/data/respaldos/. ./respaldos` |
| Restablecer la contraseña del administrador | ver la [sección 8.6](#86-olvidé-la-contraseña-del-administrador) |

> **¡Cuidado!** `docker compose down -v` **borra el volumen con la base de datos**. Nunca uses `-v`.

Docker Desktop en Windows o Mac también funciona con los mismos comandos, pero para una computadora en la tienda la
Opción A es más sencilla.

#### Plataformas que administran Docker por ti (Railway, Render, Fly.io)

Cualquier plataforma que ejecute un `Dockerfile` necesita estos ajustes:

| Ajuste | Valor |
|---|---|
| Dockerfile | El de la raíz del repositorio |
| Puerto interno | `3000` |
| Disco o volumen persistente | Montado en **`/app/data`**. **Sin esto, la información se borra en cada despliegue.** |
| Instancias o réplicas | **Exactamente 1**. SQLite no admite varias copias del servidor escribiendo a la vez. |
| `TZ` | `America/Mexico_City` (ya viene en la imagen) |
| `DATA_DIR` | `/app/data` (ya viene en la imagen) |
| `TRUST_PROXY` | `1` para empezar. No se verificó cuántos saltos de proxy usa cada plataforma. |
| Health check | `/api/health` |
| Contraseña inicial de `admin` | Aleatoria; aparece en los registros (*logs*) del primer arranque: `Usuario inicial creado → usuario: admin  contraseña: …` |

Notas por plataforma. **Ninguna se probó en esta versión**; los detalles vienen de la documentación de cada proveedor:

- **Railway:** el `Dockerfile` actual **no funciona tal cual**, porque Railway rechaza la instrucción `VOLUME`. Además
  monta el volumen como root, así que hay que definir `RAILWAY_RUN_UID=0`. Requiere un ajuste técnico previo.
- **Render:** necesita la instancia de pago *Starter* con *Persistent Disk* en `/app/data`, porque el plan gratuito no
  guarda datos. Define `PORT=3000`. No se verificó si el disco se monta con permisos para el usuario `node`: si en los
  registros aparece `Error: unable to open database file` (o `EACCES` / `permission denied`), el disco está montado
  como root y el usuario `node` no puede escribir en `/app/data`: hay que ajustar la imagen.
- **Fly.io:** se maneja con la herramienta `flyctl`. En `fly.toml` se declara `[mounts]` con `destination = "/app/data"`
  y `internal_port = 3000`.

### 3.4 Proveedores y costos aproximados

> **Precios consultados en octubre de 2026. Pueden cambiar.** Se obtuvieron de las páginas oficiales de cada proveedor
> (citadas abajo) mediante búsquedas, sin abrir cada página en vivo. **Confírmalos antes de contratar.** Los marcados
> con "sin confirmar" no se pudieron verificar.

| Proveedor | Tipo | Costo aproximado | Notas | Fuente |
|---|---|---|---|---|
| Vultr (Ciudad de México) | VPS | ≈ US$5 al mes (1 GB) | Centro de datos en CDMX, la menor latencia; precio y disponibilidad en CDMX sin confirmar | <https://www.vultr.com/pricing/> |
| DigitalOcean Droplet | VPS | US$6 al mes (1 GiB) o US$4 (512 MiB); respaldos semanales +20 % | Sin centro de datos en México | <https://www.digitalocean.com/pricing/droplets> |
| AWS Lightsail | VPS | US$7 al mes (1 GB) o US$5 (512 MB), con IPv4 | Lightsail no está en la región de México | <https://aws.amazon.com/lightsail/pricing/> |
| Hetzner Cloud CX23 | VPS | ≈ €5.49 al mes (solo Alemania y Finlandia) | Mayor latencia desde México; en EE. UU. es mucho más caro | <https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/> |
| Oracle Cloud Always Free | VM | US$0 | Regiones en Querétaro y Monterrey. Oracle puede reclamar instancias "ociosas"; conviene pasar la cuenta a *Pay As You Go*. Consola compleja | <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm> |
| Google Cloud e2-micro | VM | VM gratis en us-west1, us-central1 o us-east1; la IPv4 pública podría cobrarse (≈ US$3.65 al mes, sin confirmar) | Solo 1 GB de salida gratis al mes | <https://cloud.google.com/free> |
| Fly.io | Docker administrado | ≈ US$2.35–3.85 al mes | Sin nivel gratuito; se maneja por línea de comandos | <https://fly.io/docs/about/pricing/> |
| Railway (Hobby) | Docker administrado | ≈ US$5 al mes | Requiere ajustar el Dockerfile (`VOLUME`) y `RAILWAY_RUN_UID=0` | <https://docs.railway.com/pricing/plans> |
| Render (Starter + disco de 1 GB) | Docker administrado | ≈ US$7.25 al mes | Instantánea diaria del disco incluida; permisos del disco sin verificar | <https://render.com/pricing>, <https://render.com/docs/disks> |
| Tailscale (C.1) | VPN | Personal: gratis, solo uso no comercial. Standard: ≈ US$8 por usuario al mes | Cada dispositivo necesita la app | <https://tailscale.com/pricing> |
| Cloudflare Tunnel + Access (C.2) | Túnel | Gratis (Access gratis hasta 50 usuarios) | Límite de 100 MB por petición en el plan gratuito | <https://developers.cloudflare.com/tunnel/get-started/>, <https://www.cloudflare.com/plans/> |
| Dominio `.com` | Dominio | ≈ US$10–12 al año (sin confirmar) | Necesario para C.2, y recomendado para C.3 y D | <https://www.cloudflare.com/domains/> |

**Sugerencia:**

- **Si no tienes técnico:** quédate con la Opción A y agrega C.2 (o C.1 si solo entras tú).
- **Si tienes técnico:** un VPS de US$5–6 al mes (Vultr CDMX o DigitalOcean) con la
  [Opción D](#4-opción-d-servidor-linux-vps-ubuntu-sin-docker), que deja HTTPS automático con un solo comando.

### 3.5 Plataformas que NO sirven

El sistema necesita un proceso Node.js encendido todo el tiempo y un **disco persistente** para el archivo SQLite.
Por eso estas plataformas no sirven:

- **Vercel y Netlify (Functions):** el sistema de archivos es de solo lectura o temporal; Vercel dice expresamente que
  SQLite no funciona ahí.
- **Cloudflare Workers o Pages, GitHub Pages y otros hostings estáticos o *serverless*:** no ejecutan un servidor
  Express ni tienen disco.
- **DigitalOcean App Platform:** no admite volúmenes y su disco se borra en cada despliegue. El Droplet de
  DigitalOcean sí sirve.
- **Render, plan gratuito:** no admite discos persistentes y se apaga cuando no hay uso.
- **Heroku:** el disco se borra al menos una vez al día y ya no tiene plan gratuito.
- **Koyeb, instancia gratuita:** no admite volúmenes.
- **Google Cloud Run** y otros contenedores *serverless*: el disco se pierde al detenerse la instancia y escala a
  varias copias.
- **Railway, plan Free o Trial:** solo para pruebas; el crédito mensual no alcanza para una tienda.
- **Cualquier configuración con varias réplicas o instancias** usando la misma base de datos.

---

## 4. Opción D: servidor Linux (VPS Ubuntu) sin Docker

*Sección técnica.* El script `deploy/instalar-ubuntu.sh` instala todo en un servidor **Ubuntu 22.04 o 24.04** y se
puede ejecutar varias veces: también sirve para actualizar, y conserva los datos. Esto es lo que hace:

- Instala Node.js 22 desde NodeSource, o usa el que ya exista si es 22.13 o más reciente.
- Crea el usuario de sistema `pdv`.
- Pone el código en `/opt/punto-de-venta`; el usuario `pdv` solo puede leerlo.
- Guarda los datos en `/var/lib/punto-de-venta`.
- Instala el servicio **systemd `punto-de-venta`** (archivo `deploy/punto-de-venta.service`, con endurecimiento de
  seguridad).
- Si le das un dominio, instala **Caddy** con HTTPS automático (Let's Encrypt) y bloquea el acceso directo al puerto
  3000: el sistema escucha solo en `127.0.0.1` y systemd descarta lo que no venga del mismo equipo, de modo que solo
  Caddy puede entrar.
- La primera vez crea el usuario `admin` con una **contraseña aleatoria** y te la muestra al final (nunca `admin123`).

### 4.1 Instalación

1. **Prepara el servidor.**
   - Contrata un VPS con **Ubuntu 24.04 o 22.04** (1 GB de RAM basta).
   - Ten un usuario con `sudo` y acceso por SSH.
2. **Prepara el dominio** (para tener HTTPS).
   - Crea un registro DNS tipo **A** (por ejemplo `tienda.tudominio.mx`) con la IP pública del VPS.
   - Si el proveedor tiene firewall en su panel (AWS, Google Cloud, Oracle, etc.), abre ahí los puertos **22, 80 y 443**.
3. **Entra al servidor y descarga el código:**
   ```bash
   ssh usuario@IP_DEL_SERVIDOR
   git clone https://github.com/Jorgevg53/Sistema-de-inventario.git
   cd Sistema-de-inventario
   ```
4. **Instala el sistema.** Con dominio (HTTPS) y firewall:
   ```bash
   sudo DOMINIO=tienda.tudominio.mx CORREO=tu@correo.com TZ_TIENDA=America/Mexico_City FIREWALL=1 bash deploy/instalar-ubuntu.sh
   ```
   **Sin dominio** la conexión **no va cifrada**, así que solo sirve para una computadora Linux **dentro de la red de
   la tienda**. Indica tu red local en `RED_LOCAL` para que el firewall solo la deje entrar:
   ```bash
   sudo TZ_TIENDA=America/Mexico_City FIREWALL=1 RED_LOCAL=192.168.1.0/24 bash deploy/instalar-ubuntu.sh
   ```
   Se entra por `http://IP_DEL_SERVIDOR:3000`. Con `FIREWALL=1` y sin `RED_LOCAL`, el puerto 3000 queda **cerrado**
   hacia fuera.
   - **En un VPS sin dominio no abras el puerto 3000** (el VPS no tiene "red local": quedaría abierto a todo internet
     sin cifrar). Usa un dominio, o entra con un túnel SSH desde tu computadora:
     `ssh -L 3000:127.0.0.1:3000 usuario@IP_DEL_SERVIDOR` y luego abre `http://localhost:3000` en tu navegador.
5. **Entra al sistema en cuanto termine.** Al final el script muestra
   `Primer ingreso:  usuario admin  /  contraseña …`: es una contraseña **aleatoria y temporal**; anótala. Abre
   `https://tienda.tudominio.mx` (la primera vez el certificado puede tardar uno o dos minutos), entra con `admin` y
   esa contraseña, y **cámbiala** (el sistema te lo pide). Si la pierdes, genera otra con la
   [sección 8.6](#86-olvidé-la-contraseña-del-administrador).

Variables del script (todas opcionales):

| Variable | Para qué sirve |
|---|---|
| `DOMINIO` | Dominio que ya apunta al servidor. Instala Caddy con HTTPS y bloquea el acceso directo al puerto 3000. |
| `CORREO` | Correo para los avisos de Let's Encrypt. |
| `TZ_TIENDA` | Zona horaria del servidor, por ejemplo `America/Mexico_City`. Si el servidor queda en UTC, el script lo advierte. |
| `FIREWALL=1` | Activa `ufw`. Abre SSH y, con dominio, 80 y 443. Sin dominio, el puerto del sistema solo se abre para `RED_LOCAL`. Quita las reglas del sistema que haya dejado una instalación anterior. |
| `RED_LOCAL` | Sin dominio y con `FIREWALL=1`: red que puede entrar al puerto del sistema, por ejemplo `192.168.1.0/24`. |
| `PUERTO` | Puerto interno del sistema (3000). |
| `REPO_URL` / `RAMA` | Repositorio y rama a instalar. Por defecto, la rama principal de `https://github.com/Jorgevg53/Sistema-de-inventario.git`. |
| `ORIGEN_LOCAL` | Instala una carpeta local en vez de descargar de GitHub, por ejemplo `ORIGEN_LOCAL=$PWD`. |

### 4.2 Día a día

```bash
systemctl status punto-de-venta            # estado
journalctl -u punto-de-venta -f            # mensajes en vivo (Ctrl + C para salir)
sudo systemctl restart punto-de-venta      # reiniciar
sudo systemctl stop punto-de-venta         # detener
sudo systemctl start punto-de-venta        # iniciar
journalctl -u caddy -f                     # mensajes de Caddy (HTTPS)
```

- **Ajustes propios**, como `RESPALDOS_DIAS=60` o `AUTO_RESPALDO=0`: edita `/etc/punto-de-venta/entorno` y luego
  ejecuta `sudo systemctl restart punto-de-venta`.
- **Datos de ejemplo** (solo con la base vacía): usa el botón **Cargar ejemplo** del sistema, o este comando:
  ```bash
  sudo -u pdv env DATA_DIR=/var/lib/punto-de-venta node --disable-warning=ExperimentalWarning /opt/punto-de-venta/server/seed-demo.js
  ```
- **Acceso directo por la red local:** con `DOMINIO`, el archivo
  `/etc/systemd/system/punto-de-venta.service.d/solo-local.conf` impide entrar directo al puerto 3000 (el sistema
  escucha solo en `127.0.0.1`). Si necesitas entrar directo por la red local, borra ese archivo y ejecuta
  `sudo systemctl daemon-reload && sudo systemctl restart punto-de-venta`; con firewall, abre el puerto solo para tu
  red: `sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp`.

### 4.3 Actualizar

```bash
cd ~/Sistema-de-inventario
git pull
sudo bash deploy/instalar-ubuntu.sh
```

El script descarga de nuevo la última versión de GitHub en `/opt/punto-de-venta`, reinstala las dependencias y
reinicia el servicio. **Conserva** los datos, la configuración de Caddy y el bloqueo del puerto 3000. Para instalar
exactamente tu copia local, usa `sudo ORIGEN_LOCAL=$PWD bash deploy/instalar-ubuntu.sh`.

Sin `FIREWALL=1` el script no toca el firewall. Si lo vuelves a ejecutar **con** `FIREWALL=1` y sin dominio, repite
también `RED_LOCAL=…`: el script rehace las reglas del sistema y, sin `RED_LOCAL`, deja el puerto 3000 cerrado.

---

## 5. Respaldos

### 5.1 Respaldos automáticos (diarios)

El sistema guarda **solo** una copia completa de la base de datos cada día:

- La primera unos segundos después de arrancar. Después revisa cada hora si ya existe la del día.
- El archivo se llama `auto-AAAA-MM-DD.db` (por ejemplo `auto-2026-10-14.db`).
- Se conservan las **30 más recientes**. La variable `RESPALDOS_DIAS` cambia ese número; cuenta archivos, no días del
  calendario.
- Antes de cada restauración también se guarda una copia llamada `antes-de-restaurar-….db`. Estas no se borran solas.

| Instalación | Base de datos | Respaldos automáticos |
|---|---|---|
| Windows (Opción A) | `C:\PuntoDeVenta\data\tienda.db` | `C:\PuntoDeVenta\data\respaldos\` |
| Mac / Linux con `iniciar.sh` | `<carpeta del sistema>/data/tienda.db` | `<carpeta del sistema>/data/respaldos/` |
| Docker (C.3) | `/app/data/tienda.db` en el volumen `sistema-inventario_datos` | `/app/data/respaldos/` |
| Servidor Linux (Opción D) | `/var/lib/punto-de-venta/tienda.db` | `/var/lib/punto-de-venta/respaldos/` |

Para descargarlos ve a **Configuración → Respaldo e importación → Respaldos automáticos**. La tabla muestra el archivo,
el tipo, la fecha y el tamaño, y cada uno tiene un botón **Descargar**. **Actualizar** recarga la lista.

> Los respaldos automáticos están **en el mismo disco** que la base de datos. Si el disco falla o roban la
> computadora, se pierden junto con ella. **No sustituyen** una copia fuera de la computadora (ver 5.3).

### 5.2 Respaldo manual (con un clic)

Ve a **Configuración → Respaldo e importación → Descargar respaldo**. Se descarga un archivo
`respaldo-tienda-AAAA-MM-DD-HH-MM-SS.db` con **toda** la información: productos, ventas, clientes, usuarios e imágenes.
Hazlo **al menos una vez por semana**.

### 5.3 Guarda una copia fuera de la computadora

- Copia el respaldo descargado a una **memoria USB** que no se quede en la tienda, o súbelo a **Google Drive,
  OneDrive o Dropbox**. Los archivos de respaldo sí se pueden sincronizar sin problema; lo que no debe sincronizarse
  es la carpeta `data` con el sistema abierto.
- Conserva varios: por ejemplo, los de las últimas 4 semanas.
- Los archivos de `data\respaldos` también se pueden copiar a la USB en cualquier momento, aunque el sistema esté
  abierto, porque son copias completas.
- El respaldo contiene datos de clientes, ventas y usuarios (con sus contraseñas cifradas): **guárdalo en un lugar
  privado**. No incluye las sesiones abiertas, así que no sirve para entrar al sistema sin contraseña.

### 5.4 Restaurar un respaldo

1. Si el respaldo que quieres es uno automático, primero descárgalo con su botón **Descargar** (ver 5.1).
2. Ve a **Configuración → Respaldo e importación → Restaurar respaldo…** y elige el archivo `.db`.
3. Confirma con **Restaurar**. Se reemplaza **toda** la información actual por la del archivo. Antes, el sistema guarda
   automáticamente una copia de la base actual en `respaldos/antes-de-restaurar-….db`.
4. La página se recarga y **todas las sesiones se cierran** (en todos los dispositivos). Entra de nuevo con los
   usuarios y contraseñas **que había en el respaldo**.

El archivo puede pesar hasta 500 MB; por Cloudflare Tunnel, hasta 100 MB.

### 5.5 Advertencia: no copies `tienda.db` a mano con el sistema abierto

Mientras el sistema está abierto, los últimos cambios pasan un momento por archivos auxiliares (`tienda.db-wal` y
`tienda.db-shm`) antes de llegar a `tienda.db`. Si copias solo `tienda.db` con el sistema abierto, la copia puede salir
**incompleta o dañada**. Usa siempre una de estas formas:

- El botón **Descargar respaldo**, o los archivos de `respaldos/`.
- O **cierra primero el sistema** y luego copia la carpeta `data` **completa**.

En Docker y en Linux, desde la línea de comandos:

```bash
# Docker: respaldos automáticos (funciona con el sistema encendido). El "/." copia el contenido de la carpeta:
# así se puede repetir sin que quede ./respaldos/respaldos/...
docker compose cp tienda:/app/data/respaldos/. ./respaldos
# Docker: copia completa de la carpeta de datos (detén primero el sistema)
docker compose stop && docker compose cp tienda:/app/data/. ./copia-datos && docker compose start

# Linux (Opción D): empaqueta los respaldos y bájalos a tu computadora
sudo tar czf ~/respaldos.tgz -C /var/lib/punto-de-venta respaldos
scp usuario@IP_DEL_SERVIDOR:respaldos.tgz .      # este se ejecuta en TU computadora
```

---

## 6. Actualizar el sistema y cambiarlo de computadora

> **Antes de cualquier actualización descarga un respaldo** (ver [sección 5.2](#52-respaldo-manual-con-un-clic)).

### 6.1 Windows (instalado con ZIP)

Los datos viven en la carpeta `data`, que **no viene en el ZIP**. La forma más segura de actualizar es armar una
carpeta nueva y pasarle tu carpeta `data`:

1. Cierra el sistema: cierra la ventana negra.
2. Cámbiale el nombre a `C:\PuntoDeVenta` por `C:\PuntoDeVenta-anterior`.
3. Descarga el ZIP nuevo (**Code → Download ZIP**), desbloquéalo, extráelo y deja la carpeta nueva como
   `C:\PuntoDeVenta`, igual que en la [sección 1.4](#14-dónde-guardarlo-muy-importante).
4. Copia la carpeta **`data`** de `C:\PuntoDeVenta-anterior` a `C:\PuntoDeVenta`.
5. Da doble clic en `iniciar.bat`. Instalará de nuevo los componentes, así que necesita internet.
6. Revisa que estén tus productos y ventas. Ya con todo bien, puedes borrar `C:\PuntoDeVenta-anterior`.

Los accesos directos siguen funcionando porque la ruta `C:\PuntoDeVenta` no cambió.

### 6.2 Windows (instalado con Git)

Cierra el sistema y, en `cmd`:

```bat
cd /d C:\PuntoDeVenta
git checkout -- package-lock.json
git pull
npm ci --omit=dev --no-audit --no-fund
```

Después abre `iniciar.bat`.

- `git checkout -- package-lock.json` deshace cambios que una versión anterior de `iniciar.bat` pudo dejar en ese
  archivo; sin esto, `git pull` puede detenerse con *"Your local changes to the following files would be overwritten
  by merge: package-lock.json"*.
- `npm ci` instala exactamente las versiones de `package-lock.json` y nunca lo modifica.

### 6.3 Mac o Linux de escritorio (`iniciar.sh`)

Detén el sistema con **Ctrl + C** en su terminal.

- **Si lo descargaste como ZIP:** igual que en la [sección 6.1](#61-windows-instalado-con-zip): cambia el nombre de
  la carpeta vieja, extrae la nueva en el mismo lugar, copia ahí la carpeta **`data`** de la vieja y ejecuta
  `./iniciar.sh` (instala los componentes de nuevo, necesita internet).
- **Si lo instalaste con `git clone`:** en la carpeta del sistema:
  ```bash
  git checkout -- package-lock.json
  git pull
  ./iniciar.sh
  ```
  `iniciar.sh` detecta que cambió `package-lock.json` y reinstala los componentes con `npm ci`.

### 6.4 Docker

```bash
cd Sistema-de-inventario
git pull
docker compose up -d --build
```

Los datos del volumen se conservan.

### 6.5 Servidor Linux (Opción D)

```bash
cd ~/Sistema-de-inventario && git pull && sudo bash deploy/instalar-ubuntu.sh
```

### 6.6 Cambiar el sistema a otra computadora o servidor

Esta forma sirve entre cualquier combinación: de Windows a Windows, de Windows a la nube, etc.

1. En la instalación vieja: **Configuración → Respaldo e importación → Descargar respaldo**.
2. En la nueva: instala el sistema desde cero (Opción A, C.3 o D) y entra con el usuario inicial: en una computadora
   con Windows, Mac o Linux de escritorio, `admin` / `admin123`; en Docker y en la Opción D, `admin` con la contraseña
   aleatoria que mostró la instalación (secciones 3.3 y 4.1). Hazlo en cuanto termine la instalación.
3. En la nueva: **Configuración → Respaldo e importación → Restaurar respaldo…** y elige el archivo.
4. Entra con tus usuarios de siempre.
5. En Windows, ejecuta de nuevo `instalar-inicio-automatico.bat` y `permitir-acceso-en-red.bat` en la computadora nueva
   y actualiza la dirección guardada en las tablets.
6. **Deja de usar la instalación vieja.** Desactiva su inicio automático con `quitar-inicio-automatico.bat`, para que
   no haya dos sistemas con información distinta.

Entre dos computadoras con Windows también puedes copiar la carpeta `C:\PuntoDeVenta\data` completa, **con el sistema
cerrado** en ambas.

---

## 7. Seguridad: lista de verificación

**En la tienda:**

- [ ] Cambiaste la contraseña inicial `admin123`.
- [ ] **Cada persona tiene su propio usuario** con el rol correcto (Administrador, Cajero o Almacén), y nadie comparte
      contraseñas.
- [ ] Cuando alguien deja de trabajar en la tienda, lo desactivas: **Configuración → Usuarios** → su nombre → quita
      *"Usuario activo (puede iniciar sesión)"* → **Guardar**.
- [ ] El puerto 3000 **nunca** está abierto en el módem. El acceso desde fuera es solo por Tailscale, Cloudflare Tunnel
      o HTTPS (Opción C o D).
- [ ] El firewall solo permite la red privada de la tienda (regla de `permitir-acceso-en-red.bat`) y la red de la tienda
      está marcada como **Privada**.
- [ ] Las tablets y cajas usan la red de la tienda, y los clientes usan **otra red de invitados** (si tu módem la tiene).
- [ ] La computadora servidor tiene **contraseña de Windows** y se bloquea cuando nadie la usa (**Windows + L**).
      Quien tiene acceso a esa computadora puede copiar la base de datos y restablecer la contraseña del administrador
      (ver 8.6).
- [ ] Hay **respaldos fuera de la computadora**, al menos uno por semana (ver 5.3).
- [ ] Windows, Node.js y el sistema se mantienen actualizados (ver sección 6).

**En servidores (C.3 y D):**

- [ ] Entraste y **cambiaste la contraseña inicial** (la aleatoria de la instalación) en cuanto el sistema respondió.
- [ ] Solo se entra por **HTTPS** (Caddy o el de la plataforma).
- [ ] El firewall solo deja abiertos SSH, 80 y 443 (`FIREWALL=1` o `ufw`), y SSH se usa con llaves.
- [ ] En Docker detrás de Caddy, el puerto está publicado solo en `127.0.0.1` (`PUERTO=127.0.0.1:3000`).
- [ ] `TRUST_PROXY` vale un **número de saltos** (`1`) o `loopback`, **nunca `true`**: con `true` cualquiera puede
      falsificar su IP y saltarse el límite de intentos de inicio de sesión.
- [ ] Nadie ejecuta `docker compose down -v`.

**Protecciones que ya trae el sistema:**

- Las contraseñas se guardan cifradas.
- Las sesiones expiran después de 12 horas sin uso.
- Límite de intentos de inicio de sesión, por ventanas de 10 minutos: tras **8 intentos fallidos con el mismo usuario
  desde el mismo dispositivo**, o **30 fallidos desde el mismo dispositivo con cualquier usuario**, ese dispositivo
  queda bloqueado unos minutos. Frena a quien prueba contraseñas desde una sola dirección; no sustituye una contraseña
  fuerte.
- En servidores (Docker y Opción D) el usuario inicial recibe una contraseña aleatoria, nunca `admin123`.
- Sin sesión, el sistema solo acepta mensajes pequeños (el inicio de sesión); los grandes (imágenes, CSV, respaldos)
  exigen haber entrado.
- Los respaldos no incluyen las sesiones abiertas: un archivo de respaldo no sirve para entrar al sistema.

---

## 8. Solución de problemas

### 8.1 "El puerto 3000 ya está en uso"

- **Lo más común: el sistema ya está abierto**, por ejemplo minimizado o por el inicio automático. `iniciar.bat` (y
  `iniciar.sh`) lo detectan y solo abren el navegador. Busca la ventana negra en la barra de tareas o abre
  `http://localhost:3000`. **No abras una segunda copia con otro puerto**: las dos usarían la misma base de datos.
- **Si otro programa ocupa el puerto 3000:**
  1. Averigua cuál es: en `cmd` ejecuta `netstat -ano | findstr :3000`. El último número de cada línea es el PID.
  2. Búscalo en el *Administrador de tareas*, pestaña *Detalles*.
  3. Si no puedes cerrar ese programa, cambia el puerto del sistema con el comando de abajo y luego cierra y vuelve a
     abrir el sistema. Después se entra por `http://localhost:3001`.
     ```bat
     setx PORT 3001
     ```
  4. Para las tablets, vuelve a ejecutar `permitir-acceso-en-red.bat`: toma el puerto de `PORT`, crea la regla
     **"Punto de Venta - TCP 3001"** y muestra las direcciones con `:3001`. Si no la creara, hazla a mano en `cmd`
     como administrador:
     ```bat
     netsh advfirewall firewall add rule name="Punto de Venta - TCP 3001" dir=in action=allow protocol=TCP localport=3001 profile=private remoteip=localsubnet
     ```
- **En Mac o Linux:** `PORT=3001 ./iniciar.sh`.
- **En Docker:**
  - Si seguiste la sección 3.3 (con Caddy): pon `PUERTO=127.0.0.1:3001` en `.env` (**con** `127.0.0.1:`), cambia
    `reverse_proxy 127.0.0.1:3000` por `reverse_proxy 127.0.0.1:3001` en `/etc/caddy/Caddyfile` y ejecuta
    `docker compose up -d` y `sudo systemctl reload caddy`. Sin el `127.0.0.1:` el puerto quedaría abierto a todo
    internet sin cifrar (Docker se salta `ufw`) y, con `TRUST_PROXY: "1"`, cualquiera podría saltarse el límite de
    intentos.
  - Solo en una red local, sin Caddy ni `TRUST_PROXY`: `PUERTO=3001` en `.env` y `docker compose up -d`.

### 8.2 Problemas con la versión de Node.js

| Mensaje | Qué hacer |
|---|---|
| `No se encontro Node.js en esta computadora.` | Instala Node.js LTS (sección 1.2). Si ya lo instalaste, reinicia la computadora. |
| `La version de Node.js instalada (v…) no sirve para este sistema.` o `Este sistema necesita Node.js 22.13 o superior…` | Instala la versión LTS más reciente (22 o 24) desde <https://nodejs.org/es/download>. Se instala encima de la anterior. Las 23.0 a 23.3 tampoco sirven. |
| `No se pudieron instalar los componentes del sistema.` | Revisa la conexión a internet y vuelve a abrir `iniciar.bat`. |

### 8.3 "No abre desde la tablet o el celular"

Revisa en este orden:

1. ¿El sistema está **abierto** en la computadora servidor? ¿Abre ahí con `http://localhost:3000`?
2. ¿La tablet está en el **mismo Wi-Fi**? Las redes de invitados suelen aislar a los dispositivos entre sí.
3. ¿Escribiste bien la dirección, con `http://` y `:3000`?
4. **¿Cambió la dirección de la computadora?** Vuelve a ejecutar `permitir-acceso-en-red.bat` para ver la actual, y
   reserva la IP en el módem (sección 2.1).
5. **¿La red está como Pública?** Ese mismo archivo te lo dice y te ofrece cambiarla a Privada.
6. **¿Alguien dio "Cancelar" en el aviso del firewall?** El archivo detecta esos bloqueos y te ofrece quitarlos.
7. ¿Tienes un antivirus con firewall propio (Norton, ESET, Avast…)? Permite también ahí el puerto 3000.
8. Prueba desde la misma computadora servidor con `http://IP:3000` (su propia IP). Si ahí abre pero en la tablet no, el
   problema es la red o el firewall, no el sistema.

### 8.4 La hora de las ventas o los reportes está mal

El sistema guarda las fechas con la **hora local de la computadora o servidor** donde está instalado. Si la zona
horaria está mal, las ventas aparecen en el día equivocado en los reportes y cortes.

- **Windows:** *Configuración → Hora e idioma → Fecha y hora* → zona horaria **(UTC-06:00) Guadalajara, Ciudad de
  México, Monterrey** (o la de tu ciudad), con *Establecer la hora automáticamente* activado. Después cierra y vuelve a
  abrir el sistema.
- **Docker:** pon `ZONA_HORARIA=America/Mexico_City` (o la tuya) en el archivo `.env` y ejecuta `docker compose up -d`.
- **Linux (Opción D):**
  ```bash
  sudo timedatectl set-timezone America/Mexico_City
  sudo systemctl restart punto-de-venta
  ```
  También puedes volver a ejecutar el instalador con `TZ_TIENDA=…`.

Las ventas que ya se guardaron conservan la hora con la que se registraron; el cambio aplica a las nuevas.

### 8.5 La impresora de tickets no imprime bien

1. Instala la impresora térmica en Windows con su controlador y revisa que imprima una página de prueba desde Windows.
2. En **Configuración → Ticket** elige el ancho correcto (**80 mm** o **58 mm**), guarda y usa **Imprimir prueba**.
3. En la ventana de impresión del navegador:
   - Elige la impresora de tickets.
   - En **Márgenes** elige **Ninguno**.
   - **Desactiva "Encabezados y pies de página"**.
4. **Para imprimir sin que aparezca la ventana de impresión** (Chrome):
   1. Imprime una vez normalmente eligiendo la impresora térmica.
   2. Busca dónde está Chrome: clic derecho sobre el acceso directo de **Google Chrome** (Escritorio o menú Inicio) →
      **Propiedades** → copia el campo **Destino**. Suele ser
      `"C:\Program Files\Google\Chrome\Application\chrome.exe"`, pero si Chrome se instaló sin permisos de
      administrador está en `"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"`.
   3. Crea un acceso directo en el Escritorio (clic derecho → *Nuevo → Acceso directo*) con esa ruta, seguida de
      ` --kiosk-printing http://localhost:3000`. Por ejemplo:
      ```text
      "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing http://localhost:3000
      ```
   4. Cierra **todas** las ventanas de Chrome y abre el sistema desde ese acceso directo. Chrome imprimirá sin
      preguntar, normalmente en la última impresora que elegiste o en la predeterminada de Windows. Conviene dejar la
      impresora de tickets como **predeterminada** en Windows.
   5. **Si usas el inicio automático (sección 1.7):** `iniciar.bat` abre el navegador predeterminado al entrar a
      Windows, y si ese navegador es Chrome ya queda abierto **sin** `--kiosk-printing` (Chrome ignora la opción si ya
      está abierto). Para evitarlo:
      - En `cmd` ejecuta una vez `setx ABRIR_NAVEGADOR 0` (el sistema ya no abre el navegador al arrancar).
      - Copia tu acceso directo de Chrome con `--kiosk-printing` a la carpeta **Inicio**: tecla **Windows + R**,
        escribe `shell:startup`, Enter, y pégalo ahí. Si al entrar a Windows Chrome muestra *"No se puede acceder a este
        sitio"*, espera unos segundos a que arranque el sistema y presiona **F5**.
5. Si cobras en una tablet, el ticket sale por la impresora que tenga configurada la tablet. Muchas impresoras térmicas
   USB solo funcionan conectadas a la computadora.

### 8.6 Olvidé la contraseña del administrador

- **Si hay otro administrador**, o el problema es de un cajero o de almacén: un administrador entra a
  **Configuración → Usuarios**, da clic en la persona, escribe la **Nueva contraseña** (mínimo 6 caracteres) y da clic
  en **Guardar**.
- **Si nadie puede entrar como administrador:** el sistema no tiene opción de "¿olvidaste tu contraseña?". La
  contraseña se restablece **en la computadora o servidor donde está instalado**, con la herramienta
  `restablecer-admin`. Solo puede usarla quien tenga acceso a esa computadora. La herramienta:
  - Genera una **contraseña temporal aleatoria** para el administrador (`admin`, o el que indiques) y la muestra.
  - Deja a ese usuario **activo** y cierra sus sesiones abiertas.
  - Hace que el sistema le pida cambiar la contraseña al entrar.
  - No toca productos, ventas ni ninguna otra información.

Lo recomendable es **cerrar el sistema antes** (aunque también funciona con el sistema abierto).

**Windows (Opción A):**

1. Cierra el sistema (su ventana negra).
2. En `C:\PuntoDeVenta` da **doble clic en `restablecer-admin.bat`** y contesta `S`.
3. Aparece `Listo. Contraseña temporal del usuario "admin":` y debajo la contraseña. **Anótala.**
4. Abre el sistema con `iniciar.bat`, entra con `admin` y esa contraseña, y cámbiala.

Para otro administrador (por ejemplo `jefa`), en `cmd` dentro de `C:\PuntoDeVenta`: `restablecer-admin.bat jefa`.

**Mac o Linux de escritorio** (en una terminal, dentro de la carpeta del sistema, con el sistema detenido):

```bash
node --disable-warning=ExperimentalWarning scripts/restablecer-admin.js
```

**Docker** (en la carpeta `Sistema-de-inventario` del servidor):

```bash
docker compose stop
docker compose run --rm tienda node --disable-warning=ExperimentalWarning scripts/restablecer-admin.js
docker compose start
```

**Servidor Linux (Opción D):**

```bash
sudo systemctl stop punto-de-venta
cd /opt/punto-de-venta && sudo -u pdv env DATA_DIR=/var/lib/punto-de-venta node --disable-warning=ExperimentalWarning scripts/restablecer-admin.js
sudo systemctl start punto-de-venta
```

En los tres casos se agrega el nombre del usuario al final del comando si no es `admin`. Si dice
`No se encontró la base de datos`, el comando se ejecutó en otra carpeta o sin la `DATA_DIR` correcta: no se cambió
nada. Si el usuario no existe o no es administrador, muestra los administradores registrados.

Restaurar un respaldo **no** resuelve el olvido: el respaldo trae las mismas contraseñas que había cuando se hizo.

### 8.7 "Demasiados intentos. Espera unos minutos."

Hubo 8 intentos fallidos en 10 minutos con ese usuario desde ese dispositivo, o 30 fallidos desde ese dispositivo con
cualquier usuario. Espera 10 minutos, o reinicia el sistema: cerrar y abrir `iniciar.bat`; en Mac o Linux, **Ctrl + C**
y `./iniciar.sh`; `docker compose restart`; o `sudo systemctl restart punto-de-venta`.

### 8.8 "No se encontraron los archivos del sistema junto a este archivo"

Abriste `iniciar.bat` desde dentro del ZIP o desde una carpeta incompleta. Extrae el ZIP con **"Extraer todo..."** y
deja la carpeta en `C:\PuntoDeVenta` (sección 1.4).

### 8.9 Servidores: no arranca, no está `healthy` o no hay HTTPS

- **Docker:**
  - Revisa con `docker compose ps` y `docker compose logs --tail 50`.
  - La construcción de la imagen necesita internet: Docker Hub, `dl-cdn.alpinelinux.org` (para `tzdata`) y
    `registry.npmjs.org`. Si Docker Hub responde *429 Too Many Requests*, espera unos minutos o inicia sesión con
    `docker login`.
- **Linux (Opción D):** revisa con `systemctl status punto-de-venta` y
  `journalctl -u punto-de-venta -n 50 --no-pager`.
- **Caddy no obtiene el certificado:**
  - Revisa que el registro DNS **A** apunte a la IP del servidor.
  - Revisa que los puertos **80 y 443** estén abiertos, también en el panel del proveedor.
  - Lee los mensajes con `journalctl -u caddy -n 50 --no-pager`.
- **Comprobación rápida** en el servidor: `curl http://127.0.0.1:3000/api/health` debe responder `{"ok":true,...}`.

---

## 9. Referencia técnica

### 9.1 Requisitos y arquitectura

- **Node.js ≥ 22.13** (en la serie 23, ≥ 23.4; lo más simple es la LTS 22 o 24). El sistema usa el módulo integrado
  `node:sqlite` y no tiene dependencias nativas.
  Las pruebas automáticas (`npm test`) pasan con Node.js 22.22 y 24.21.
- Express 5 y SQLite en modo **WAL**, en un solo proceso. **No ejecutes dos instancias sobre la misma base.**
- El frontend (Vue 3, Chart.js, JsBarcode) se sirve desde `node_modules`, sin compilación ni internet.
- Consumo medido: ≈ 64 MB de RAM en reposo y ≈ 75 MB con los datos de ejemplo.
- Comandos: `npm start` (inicia), `npm run demo` (datos de ejemplo en una base vacía), `npm test` (pruebas).

### 9.2 Variables de entorno del sistema

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP. |
| `HOST` | todas las interfaces | Dirección en la que escucha. `127.0.0.1` = solo desde el mismo equipo (lo usa la Opción D con dominio). |
| `DATA_DIR` | `./data` (en la carpeta del sistema) | Carpeta de datos: `tienda.db` (más `-wal` y `-shm`), `respaldos/` y `tmp/`. |
| `DB_FILE` | `DATA_DIR/tienda.db` | Ruta del archivo de base de datos. Los respaldos y `tmp/` siguen en `DATA_DIR`. |
| `TRUST_PROXY` | `loopback` | Proxies en los que se confía para `X-Forwarded-For` y `X-Forwarded-Proto`. Acepta `true`/`false`, un número de saltos (`1`, `2`…) o una lista de IPs o subredes (por ejemplo `loopback, uniquelocal`). |
| `AUTO_RESPALDO` | activado | `0` desactiva el respaldo automático diario. |
| `RESPALDOS_DIAS` | `30` | Cuántos `auto-*.db` se conservan. Un valor inválido o menor a 1 vuelve a 30. |
| `ABRIR_NAVEGADOR` | sin definir (`iniciar.bat` e `iniciar.sh` usan `1`) | `1` abre el navegador al iniciar; `0` no lo abre (en Windows: `setx ABRIR_NAVEGADOR 0`). |
| `TZ` | la del sistema operativo | Zona horaria. La imagen Docker usa `America/Mexico_City`. |
| `NODE_ENV` | sin definir | `production` (la imagen Docker y la Opción D) hace que el usuario `admin` inicial reciba una contraseña aleatoria, que se muestra en los mensajes del primer arranque. |
| `ADMIN_PASSWORD_INICIAL` | sin definir | Contraseña del usuario `admin` cuando se crea la base (mínimo 6 caracteres; no se escribe en los mensajes). Solo se usa la primera vez. Siempre pide cambiarla al entrar. |

Exclusivas de `docker-compose.yml` (se ponen en `.env`):

- `PUERTO`: puerto publicado en el equipo, `3000` por defecto. Acepta `IP:puerto`, por ejemplo `127.0.0.1:3000`.
- `ZONA_HORARIA`: `America/Mexico_City` por defecto.

Las variables de `deploy/instalar-ubuntu.sh` están en la [sección 4.1](#41-instalación).

En Windows, una variable se fija para el usuario con `setx NOMBRE valor` (por ejemplo `setx RESPALDOS_DIAS 60`). Toma
efecto la siguiente vez que se abre el sistema.

### 9.3 `TRUST_PROXY`: qué valor usar

| Escenario | Valor |
|---|---|
| Sin proxy (red local, Opción A o B) | Por defecto (`loopback`) |
| Caddy en el mismo equipo, sin Docker (Opción D) | `loopback`; ya viene en `punto-de-venta.service` |
| `cloudflared` o `tailscale serve` en la computadora de la tienda (C.1 o C.2) | Por defecto (`loopback`) |
| Docker con Caddy u otro proxy en el equipo anfitrión (C.3) | `1`, con el puerto publicado solo en `127.0.0.1` |
| Plataformas administradas (Railway, Render, Fly.io) | `1` para empezar (no verificado por plataforma) |
| Nunca | `true` (permite falsificar la IP del cliente) |

Con HTTPS y un proxy de confianza, la cookie de sesión `sid` (`HttpOnly`, `SameSite=Lax`) se marca además como
`Secure`.

### 9.4 Rutas útiles de la API

| Ruta | Sesión | Uso |
|---|---|---|
| `GET /api/health` | No | Monitoreo. Responde `200 {"ok":true,"version":"1.0.0","time":"…"}`, o `503 {"ok":false}` si la base no responde. |
| `GET /api/public/settings` | No | Datos mínimos de la tienda (lo usa el *healthcheck* de Docker). |
| `GET /api/backup` | Administrador | Descarga un respaldo completo (`VACUUM INTO`), sin la tabla de sesiones. |
| `POST /api/backup/restore` | Administrador | Restaura; cuerpo binario `application/octet-stream`, máximo 500 MB. Cierra todas las sesiones. |
| `GET /api/backups` | Administrador | Lista de respaldos guardados: `{dir, keep, files:[…]}`. |
| `GET /api/backups/<nombre>` | Administrador | Descarga un `auto-AAAA-MM-DD.db` o un `antes-de-restaurar-….db`. |

### 9.5 Archivos de despliegue del repositorio

| Archivo | Para qué sirve |
|---|---|
| `iniciar.bat` | Windows: revisa Node.js ≥ 22.13, instala componentes (`npm ci`), detecta si el sistema ya está abierto y lo inicia. |
| `restablecer-admin.bat` / `scripts/restablecer-admin.js` | Contraseña temporal para un administrador que nadie recuerda (sección 8.6). |
| `instalar-inicio-automatico.bat` / `quitar-inicio-automatico.bat` | Windows: accesos directos en *Inicio* y en el *Escritorio*. |
| `permitir-acceso-en-red.bat` | Windows: regla de firewall para el puerto del sistema (3000 o `PORT`; privada, subred local), tipo de red, bloqueos de `node.exe` y dirección para las tablets. |
| `iniciar.sh` | Mac/Linux de escritorio: revisa Node.js, instala o actualiza componentes (`npm ci`), detecta si ya está abierto y lo inicia. |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore` | Imagen y servicio Docker (`tienda`, volumen `sistema-inventario_datos`). |
| `deploy/instalar-ubuntu.sh` | Instalador o actualizador para Ubuntu 22.04/24.04 (systemd, Caddy, ufw). |
| `deploy/punto-de-venta.service` | Servicio systemd (usuario `pdv`, `DATA_DIR=/var/lib/punto-de-venta`, endurecimiento). |
| `deploy/Caddyfile` | Plantilla de Caddy (HTTPS automático, límite de 25 MB por petición salvo 512 MiB en la restauración, y proxy a `127.0.0.1:3000`). |
