@echo off
chcp 65001 >nul
title Punto de Venta - Tienda de Natacion y Deportes
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No se encontro Node.js en esta computadora.
  echo  Descarga e instala la version LTS desde https://nodejs.org
  echo  y despues vuelve a abrir este archivo.
  echo.
  start "" https://nodejs.org/es/download
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo  Instalando componentes por primera vez. Esto tarda solo un momento...
  echo.
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo  No se pudieron instalar los componentes. Revisa tu conexion a internet.
    pause
    exit /b 1
  )
)

set ABRIR_NAVEGADOR=1
node --disable-warning=ExperimentalWarning server/index.js
pause
