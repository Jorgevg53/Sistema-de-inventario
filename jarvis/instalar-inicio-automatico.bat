@echo off
rem Crea dos accesos directos (no necesita permisos de administrador):
rem  - En la carpeta Inicio de Windows: abre JARVIS minimizado al entrar a Windows.
rem  - En el Escritorio ("JARVIS"): para abrirlo con doble clic.
rem Los mensajes van sin acentos a proposito: asi se ven bien en cualquier consola.
chcp 65001 >nul
setlocal
title JARVIS - Activar inicio automatico
cd /d "%~dp0"

set "PSEXE=powershell"
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PSEXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

rem La carpeta debe estar completa y en un lugar fijo (no dentro de un ZIP ni en la carpeta temporal).
set "CARPETA=%~dp0"
if not exist "%CARPETA%iniciar-jarvis.bat" goto :sin_carpeta
if not exist "%CARPETA%server\index.js" goto :sin_carpeta
if /i not "%CARPETA:\AppData\Local\Temp\=%"=="%CARPETA%" goto :sin_carpeta
set "JARVIS_BAT=%CARPETA%iniciar-jarvis.bat"

echo.
echo  ==============================================================
echo   JARVIS - Activar inicio automatico
echo  ==============================================================
echo.
echo  Se crearan dos accesos directos:
echo   1. En la carpeta Inicio de Windows: JARVIS se abrira solo, en
echo      una ventana minimizada, cada vez que entres a Windows.
echo   2. En el Escritorio, llamado "JARVIS": para abrirlo con doble
echo      clic cuando lo necesites.
echo.

rem OneDrive puede bloquear la base de datos mientras sincroniza.
if /i "%CARPETA:OneDrive=%"=="%CARPETA%" goto :crear
echo  AVISO: la carpeta de JARVIS esta dentro de OneDrive.
echo  OneDrive puede bloquear o duplicar la base de datos mientras
echo  sincroniza, y eso puede causar errores o perdida de informacion.
echo  Lo mas seguro es mover la carpeta completa a C:\JARVIS y
echo  ejecutar este archivo desde ahi.
echo.
choice /c SN /n /m "  Continuar de todos modos con esta carpeta? [S/N]: "
if errorlevel 2 goto :sin_cambios
echo.

:crear
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference = 'Stop';" ^
 "try {" ^
 "  $bat = $env:JARVIS_BAT;" ^
 "  $dir = [IO.Path]::GetDirectoryName($bat);" ^
 "  $ws = New-Object -ComObject WScript.Shell;" ^
 "  function Crear-Acceso($ruta, $estilo) {" ^
 "    $l = $ws.CreateShortcut($ruta);" ^
 "    $l.TargetPath = $bat;" ^
 "    $l.WorkingDirectory = $dir;" ^
 "    $l.WindowStyle = $estilo;" ^
 "    $l.Description = 'Abre JARVIS, tu asistente personal';" ^
 "    $l.Save();" ^
 "  };" ^
 "  $inicio = [Environment]::GetFolderPath('Startup');" ^
 "  if (-not $inicio) { throw 'Windows no indico donde esta la carpeta Inicio.' };" ^
 "  if (-not (Test-Path -LiteralPath $inicio)) { New-Item -ItemType Directory -Path $inicio -Force | Out-Null };" ^
 "  Crear-Acceso (Join-Path $inicio 'JARVIS.lnk') 7;" ^
 "  Write-Host '  [OK] Inicio automatico activado (ventana minimizada).';" ^
 "  $escritorio = [Environment]::GetFolderPath('Desktop');" ^
 "  if ($escritorio -and (Test-Path -LiteralPath $escritorio)) {" ^
 "    Crear-Acceso (Join-Path $escritorio 'JARVIS.lnk') 1;" ^
 "    Write-Host '  [OK] Acceso directo JARVIS creado en el Escritorio.';" ^
 "  } else {" ^
 "    Write-Host '  [!] No se encontro el Escritorio; solo se activo el inicio automatico.';" ^
 "  };" ^
 "  Write-Host ('       Carpeta de JARVIS: ' + $dir);" ^
 "} catch {" ^
 "  Write-Host ('  ERROR: ' + $_.Exception.Message);" ^
 "  exit 1;" ^
 "}"
if errorlevel 1 goto :error

echo.
echo  Listo. Desde ahora JARVIS se abrira solo cada vez que entres
echo  a Windows con este usuario. Deja abierta su pestana del navegador
echo  para que te avise de tus recordatorios.
echo  - No muevas ni cambies de nombre esta carpeta. Si lo haces, vuelve
echo    a ejecutar este archivo.
echo  - Para desactivarlo usa quitar-inicio-automatico.bat
echo  - Si JARVIS ya esta abierto, el acceso del Escritorio solo abre
echo    el navegador.
echo.
choice /c SN /n /m "  Quieres abrir JARVIS ahora? [S/N]: "
if errorlevel 2 goto :fin
start "JARVIS" cmd /c call "%JARVIS_BAT%"
exit /b 0

:fin
echo.
pause
exit /b 0

:sin_carpeta
echo.
echo  No se encontraron los archivos de JARVIS junto a este archivo,
echo  o la carpeta esta dentro de un ZIP o en una carpeta temporal.
echo.
echo  Haz clic derecho sobre el archivo ZIP, elige "Extraer todo..." y
echo  guarda la carpeta en un lugar fijo, por ejemplo C:\JARVIS.
echo  Despues ejecuta este archivo desde esa carpeta.
echo.
pause
exit /b 1

:sin_cambios
echo.
echo  No se hizo ningun cambio.
echo.
pause
exit /b 1

:error
echo.
echo  No se pudieron crear los accesos directos.
echo  Puedes hacerlo a mano:
echo   1. Presiona las teclas Windows + R, escribe  shell:startup  y Enter.
echo   2. En la carpeta que se abre: clic derecho, Nuevo, Acceso directo,
echo      y elige el archivo iniciar-jarvis.bat de la carpeta jarvis.
echo   3. Cuando pregunte el nombre, escribe exactamente: JARVIS
echo      (asi quitar-inicio-automatico.bat lo podra quitar despues).
echo.
pause
exit /b 1
