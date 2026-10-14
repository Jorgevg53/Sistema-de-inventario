@echo off
rem Restablece la contrasena del administrador cuando nadie puede entrar al sistema.
rem Genera una contrasena temporal aleatoria y la muestra en esta ventana.
rem Uso: doble clic (usuario admin) o, en cmd, restablecer-admin.bat OTRO_USUARIO
rem Los mensajes van sin acentos a proposito: asi se ven bien en cualquier consola.
chcp 65001 >nul
setlocal
title Punto de Venta - Restablecer contrasena del administrador
cd /d "%~dp0"

if not exist "scripts\restablecer-admin.js" goto :sin_carpeta
if not exist "server\index.js" goto :sin_carpeta

rem Buscar Node.js (igual que iniciar.bat).
where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto :sin_node

set "USUARIO=%~1"
if not defined USUARIO set "USUARIO=admin"

echo.
echo  ==============================================================
echo   Punto de Venta - Restablecer contrasena del administrador
echo  ==============================================================
echo.
echo  Se creara una contrasena temporal nueva para el usuario "%USUARIO%".
echo  Lo recomendable es cerrar antes el sistema (su ventana negra).
echo  Tus productos, ventas y demas informacion NO se modifican.
echo.
choice /c SN /n /m "  Continuar? [S/N]: "
if errorlevel 2 goto :cancelado

node --disable-warning=ExperimentalWarning scripts\restablecer-admin.js "%USUARIO%"
if errorlevel 1 goto :fallo
echo  Anota la contrasena, abre el sistema con iniciar.bat y entra con ella.
echo.
pause
exit /b 0

:fallo
echo  No se cambio ninguna contrasena. Lee el mensaje de arriba.
echo.
pause
exit /b 1

:cancelado
echo.
echo  No se hizo ningun cambio.
echo.
pause
exit /b 1

:sin_carpeta
echo.
echo  No se encontraron los archivos del sistema junto a este archivo.
echo  Abre restablecer-admin.bat desde la carpeta del sistema
echo  (por ejemplo C:\PuntoDeVenta).
echo.
pause
exit /b 1

:sin_node
echo.
echo  No se encontro Node.js en esta computadora.
echo  Instala la version LTS desde https://nodejs.org/es/download
echo.
pause
exit /b 1
