@echo off
rem Desactiva el inicio automatico del Punto de Venta y, si se desea, quita el acceso del Escritorio.
rem Los mensajes van sin acentos a proposito: asi se ven bien en cualquier consola.
chcp 65001 >nul
setlocal
title Punto de Venta - Quitar inicio automatico

set "PSEXE=powershell"
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PSEXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

echo.
echo  ==============================================================
echo   Punto de Venta - Quitar inicio automatico
echo  ==============================================================
echo.
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference = 'Stop';" ^
 "try {" ^
 "  $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Punto de Venta.lnk';" ^
 "  if (Test-Path -LiteralPath $lnk) {" ^
 "    Remove-Item -LiteralPath $lnk -Force;" ^
 "    Write-Host '  [OK] Listo: el sistema ya NO se abrira solo al entrar a Windows.';" ^
 "  } else {" ^
 "    Write-Host '  No se encontro el acceso directo Punto de Venta en la carpeta Inicio.';" ^
 "    Write-Host '  Si el sistema aun se abre solo, presiona Windows + R, escribe shell:startup,';" ^
 "    Write-Host '  presiona Enter y borra de esa carpeta el acceso directo a iniciar.bat.';" ^
 "  };" ^
 "} catch {" ^
 "  Write-Host ('  ERROR: ' + $_.Exception.Message);" ^
 "  exit 1;" ^
 "}"
if errorlevel 1 goto :error

rem Codigo 0 = existe el acceso directo del Escritorio.
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "$esc = [Environment]::GetFolderPath('Desktop');" ^
 "if ($esc -and (Test-Path -LiteralPath (Join-Path $esc 'Punto de Venta.lnk'))) { exit 0 } else { exit 1 }"
if errorlevel 1 goto :fin

echo.
choice /c SN /n /m "  Quitar tambien el acceso directo Punto de Venta del Escritorio? [S/N]: "
if errorlevel 2 goto :fin
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "try {" ^
 "  $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Punto de Venta.lnk';" ^
 "  Remove-Item -LiteralPath $lnk -Force -ErrorAction Stop;" ^
 "  Write-Host '  [OK] Acceso directo del Escritorio eliminado.';" ^
 "} catch {" ^
 "  Write-Host ('  ERROR: ' + $_.Exception.Message);" ^
 "  exit 1;" ^
 "}"
if errorlevel 1 goto :error

:fin
echo.
echo  Nota: si el sistema esta abierto ahora, seguira funcionando hasta que
echo  cierres su ventana o apagues la computadora.
echo  Para volver a activar el inicio automatico usa instalar-inicio-automatico.bat
echo.
pause
exit /b 0

:error
echo.
echo  No se pudo quitar el acceso directo. Puedes hacerlo a mano:
echo  presiona las teclas Windows + R, escribe  shell:startup  y Enter,
echo  y borra el acceso directo "Punto de Venta" de esa carpeta.
echo.
pause
exit /b 1
