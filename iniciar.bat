@echo off
rem Inicia el Punto de Venta en Windows (doble clic sobre este archivo).
rem Los mensajes van sin acentos a proposito: asi se ven bien en cualquier consola.
chcp 65001 >nul
setlocal
title Punto de Venta - Tienda de Natacion y Deportes
cd /d "%~dp0"

rem Si se abre desde dentro de un ZIP, Windows usa una carpeta temporal y los datos se perderian.
set "CARPETA=%~dp0"
if /i not "%CARPETA:\AppData\Local\Temp\=%"=="%CARPETA%" goto :sin_carpeta
if not exist "server\index.js" goto :sin_carpeta

rem Puerto del sistema (se puede cambiar con la variable PORT).
set "PUERTO=%PORT%"
if not defined PUERTO set "PUERTO=3000"

rem Buscar Node.js. Si se acaba de instalar y aun no esta en el PATH, se busca en su carpeta habitual.
where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto :sin_node

rem Version minima 22.13 (en la serie 23, la 23.4): desde ahi node:sqlite viene integrado.
rem Misma regla que server/db.js e iniciar.sh. Se revisa antes de usar opciones que no existen en versiones viejas.
node -e "var v=process.versions.node.split('.').map(Number);process.exit(v[0]>23||(v[0]==23&&v[1]>=4)||(v[0]==22&&v[1]>=13)?0:1)"
if errorlevel 1 goto :node_viejo

rem Instalar componentes si faltan (primera vez, o si la carpeta node_modules quedo incompleta).
set "FALTAN="
for %%p in (express vue chart.js jsbarcode) do if not exist "node_modules\%%p\package.json" set "FALTAN=1"
if not defined FALTAN goto :revisar_abierto
echo.
echo  Instalando los componentes del sistema. Esto tarda un momento...
echo  Se necesita conexion a internet solo esta vez.
echo.
rem npm ci instala exactamente lo de package-lock.json y nunca lo modifica (asi git pull no choca).
call npm ci --omit=dev --no-audit --no-fund
if errorlevel 1 goto :error_npm
if not exist "node_modules\express\package.json" goto :error_npm

:revisar_abierto
rem Si el sistema ya esta abierto (por ejemplo, por el inicio automatico), solo se abre el navegador.
node -e "require('http').get('http://127.0.0.1:'+process.env.PUERTO+'/api/public/settings',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)}).setTimeout(3000,function(){process.exit(1)})"
if errorlevel 1 goto :arrancar
echo.
echo  El sistema ya estaba abierto. Abriendo el navegador...
start "" "http://localhost:%PUERTO%"
timeout /t 3 /nobreak >nul
exit /b 0

:arrancar
rem Abre el navegador al iniciar, salvo que se haya desactivado con: setx ABRIR_NAVEGADOR 0
if not defined ABRIR_NAVEGADOR set "ABRIR_NAVEGADOR=1"
node --disable-warning=ExperimentalWarning server/index.js
set "CODIGO=%errorlevel%"
rem 0 = cerrado normalmente (tambien con Ctrl+C: el sistema cierra la base y sale con 0);
rem -1073741510 = el proceso fue interrumpido con Ctrl+C antes de poder cerrarse solo.
if "%CODIGO%"=="0" exit /b 0
if "%CODIGO%"=="-1073741510" exit /b 0
echo.
echo  ==============================================================
echo   El sistema se cerro por un error (codigo %CODIGO%).
echo   Lee los mensajes de arriba para saber que paso.
echo   - Si dice que el puerto %PUERTO% ya esta en uso, casi siempre es
echo     porque el sistema ya esta abierto en otra ventana: usala o abre
echo     http://localhost:%PUERTO% en el navegador. Si no, reinicia la
echo     computadora. NO abras una segunda copia con otro puerto.
echo   - Si el problema sigue, toma una foto de esta ventana y enviala
echo     a quien te da soporte.
echo  ==============================================================
echo.
pause
exit /b %CODIGO%

:sin_carpeta
echo.
echo  No se encontraron los archivos del sistema junto a este archivo.
echo  Esto pasa cuando se abre desde dentro de un archivo ZIP o desde una
echo  unidad de red.
echo.
echo  Haz clic derecho sobre el archivo ZIP, elige "Extraer todo..." y
echo  guarda la carpeta en un lugar fijo, por ejemplo C:\PuntoDeVenta.
echo  Despues abre iniciar.bat desde esa carpeta.
echo.
pause
exit /b 1

:sin_node
echo.
echo  No se encontro Node.js en esta computadora.
echo  Descarga e instala la version LTS desde https://nodejs.org/es/download
echo  (se abrira la pagina en tu navegador) y despues vuelve a abrir este archivo.
echo.
start "" "https://nodejs.org/es/download"
pause
exit /b 1

:node_viejo
set "NODE_VER=desconocida"
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo.
echo  La version de Node.js instalada (%NODE_VER%) no sirve para este sistema.
echo  Necesita Node.js 22.13 o mas reciente (en la serie 23, la 23.4 o mas reciente).
echo  Descarga e instala la version LTS desde https://nodejs.org/es/download
echo  (se abrira la pagina en tu navegador) y despues vuelve a abrir este archivo.
echo.
start "" "https://nodejs.org/es/download"
pause
exit /b 1

:error_npm
echo.
echo  No se pudieron instalar los componentes del sistema.
echo  Revisa tu conexion a internet y vuelve a abrir este archivo.
echo  Si el problema sigue, reinstala Node.js (version LTS) desde
echo  https://nodejs.org/es/download
echo.
pause
exit /b 1
