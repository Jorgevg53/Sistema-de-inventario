@echo off
rem Inicia JARVIS en Windows (doble clic sobre este archivo).
rem Los mensajes van sin acentos a proposito: asi se ven bien en cualquier consola.
chcp 65001 >nul
setlocal
title JARVIS - Asistente personal
cd /d "%~dp0"

rem Si se abre desde dentro de un ZIP, Windows usa una carpeta temporal y los datos se perderian.
set "CARPETA=%~dp0"
if /i not "%CARPETA:\AppData\Local\Temp\=%"=="%CARPETA%" goto :sin_carpeta
if not exist "server\index.js" goto :sin_carpeta

rem Puerto de JARVIS (se puede cambiar con la variable PORT). El punto de venta usa el 3000.
set "PUERTO=%PORT%"
if not defined PUERTO set "PUERTO=3100"

rem Buscar Node.js. Si se acaba de instalar y aun no esta en el PATH, se busca en su carpeta habitual.
where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto :sin_node

rem Version minima 22.13 (en la serie 23, la 23.4): desde ahi node:sqlite viene integrado.
node -e "var v=process.versions.node.split('.').map(Number);process.exit(v[0]>23||(v[0]==23&&v[1]>=4)||(v[0]==22&&v[1]>=13)?0:1)"
if errorlevel 1 goto :node_viejo

rem Instalar componentes si faltan (primera vez, o si la carpeta node_modules quedo incompleta).
set "FALTAN="
for %%p in (express vue @anthropic-ai\sdk) do if not exist "node_modules\%%p\package.json" set "FALTAN=1"
if not defined FALTAN goto :revisar_abierto
echo.
echo  Instalando los componentes de JARVIS. Esto tarda un momento...
echo  Se necesita conexion a internet solo esta vez.
echo.
call npm ci --omit=dev --no-audit --no-fund
if errorlevel 1 goto :error_npm
if not exist "node_modules\express\package.json" goto :error_npm

:revisar_abierto
rem Si JARVIS ya esta abierto, solo se abre el navegador.
node -e "require('http').get('http://127.0.0.1:'+process.env.PUERTO+'/api/status',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)}).setTimeout(3000,function(){process.exit(1)})"
if errorlevel 1 goto :arrancar
echo.
echo  JARVIS ya estaba abierto. Abriendo el navegador...
start "" "http://localhost:%PUERTO%"
timeout /t 3 /nobreak >nul
exit /b 0

:arrancar
if not defined ABRIR_NAVEGADOR set "ABRIR_NAVEGADOR=1"
node --disable-warning=ExperimentalWarning server/index.js
set "CODIGO=%errorlevel%"
if "%CODIGO%"=="0" exit /b 0
if "%CODIGO%"=="-1073741510" exit /b 0
echo.
echo  ==============================================================
echo   JARVIS se cerro por un error (codigo %CODIGO%).
echo   Lee los mensajes de arriba para saber que paso.
echo   - Si dice que el puerto %PUERTO% ya esta en uso, JARVIS ya esta
echo     abierto en otra ventana: abre http://localhost:%PUERTO%
echo  ==============================================================
echo.
pause
exit /b %CODIGO%

:sin_carpeta
echo.
echo  No se encontraron los archivos de JARVIS junto a este archivo.
echo  Esto pasa cuando se abre desde dentro de un archivo ZIP.
echo  Extrae primero todo el ZIP en una carpeta fija y abre este archivo desde ahi.
echo.
pause
exit /b 1

:sin_node
echo.
echo  No se encontro Node.js en esta computadora.
echo  Descarga e instala la version LTS desde https://nodejs.org/es/download
echo  y despues vuelve a abrir este archivo.
echo.
start "" "https://nodejs.org/es/download"
pause
exit /b 1

:node_viejo
set "NODE_VER=desconocida"
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo.
echo  La version de Node.js instalada (%NODE_VER%) no sirve para JARVIS.
echo  Necesita Node.js 22.13 o mas reciente. Descarga la version LTS desde
echo  https://nodejs.org/es/download y despues vuelve a abrir este archivo.
echo.
start "" "https://nodejs.org/es/download"
pause
exit /b 1

:error_npm
echo.
echo  No se pudieron instalar los componentes de JARVIS.
echo  Revisa tu conexion a internet y vuelve a abrir este archivo.
echo.
pause
exit /b 1
