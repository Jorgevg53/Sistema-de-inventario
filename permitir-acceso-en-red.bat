@echo off
rem Permite abrir el Punto de Venta desde tablets y celulares de la red local de la tienda:
rem crea (o vuelve a crear) una regla de entrada en el Firewall de Windows para el puerto
rem del sistema (3000, o el de la variable PORT), solo en redes privadas y solo desde equipos
rem de la misma red local.
rem Pide permisos de administrador por si solo.
rem Los mensajes van sin acentos a proposito: asi se ven bien en cualquier consola.
chcp 65001 >nul
setlocal
title Punto de Venta - Permitir acceso desde la red
cd /d "%~dp0"

rem Puerto del sistema: el de la variable PORT (setx PORT 3001) o 3000. Al pedir permisos de
rem administrador se pasa como segundo argumento, porque esa ventana puede no tener la variable.
set "PUERTO=%PORT%"
if /i "%~1"=="elevado" if not "%~2"=="" set "PUERTO=%~2"
if not defined PUERTO set "PUERTO=3000"
rem Solo numeros; cualquier otra cosa vuelve a 3000 (si queda algo al quitar los digitos, no es numero).
for /f "delims=0123456789" %%a in ("%PUERTO%") do set "PUERTO=3000"
set "REGLA=Punto de Venta - TCP %PUERTO%"
set "PSEXE=powershell"
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" set "PSEXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

rem fltmc solo funciona con permisos de administrador.
fltmc >nul 2>&1
if not errorlevel 1 goto :admin
if /i "%~1"=="elevado" goto :sin_admin

echo.
echo  Para abrir el puerto %PUERTO% en el Firewall de Windows se necesitan
echo  permisos de administrador. Windows te pedira confirmacion: elige "Si".
echo.
rem Se vuelve a abrir este mismo archivo como administrador. La ruta va en una
rem variable de entorno y entre comillas dobles para que funcione con espacios,
rem acentos o parentesis: cmd /c ""ruta\archivo.bat" elevado"
set "PDV_SELF=%~f0"
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "$q = [char]34;" ^
 "try {" ^
 "  Start-Process -FilePath $env:ComSpec -ArgumentList ('/c ' + $q + $q + $env:PDV_SELF + $q + ' elevado ' + $env:PUERTO + $q) -Verb RunAs -ErrorAction Stop;" ^
 "} catch {" ^
 "  exit 1;" ^
 "}"
if errorlevel 1 goto :cancelado
exit /b 0

:admin
echo.
echo  ==============================================================
echo   Punto de Venta - Permitir acceso desde tablets y celulares
echo  ==============================================================
echo.
echo  1. Regla del Firewall de Windows
echo     Permite la entrada al puerto %PUERTO% solo en redes PRIVADAS y solo
echo     desde equipos de la misma red local. En redes publicas (cafeterias,
echo     aeropuertos) el sistema sigue cerrado, por seguridad.
echo.
netsh advfirewall firewall delete rule name="%REGLA%" >nul 2>&1
netsh advfirewall firewall add rule name="%REGLA%" dir=in action=allow protocol=TCP localport=%PUERTO% profile=private remoteip=localsubnet description="Permite abrir el Punto de Venta desde tablets y celulares de la red local"
if errorlevel 1 goto :error_regla
echo     [OK] Regla "%REGLA%" lista.

echo.
echo  2. Tipo de red
echo     La red Wi-Fi o de cable de la tienda debe estar marcada como
echo     "Privada" en Windows. Si esta como "Publica", la regla no aplica
echo     y las tablets y celulares no podran entrar.
echo.
rem Codigo 10 = hay al menos una red marcada como Publica.
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "$redes = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue);" ^
 "if ($redes.Count -eq 0) { Write-Host '     No se detecto ninguna red conectada. Conecta la PC al Wi-Fi o al cable de la tienda.'; exit 0 };" ^
 "$hayPublica = $false;" ^
 "foreach ($r in $redes) {" ^
 "  $cat = [string]$r.NetworkCategory;" ^
 "  if ($cat -eq 'Private') { $tipo = 'Privada (correcto)' }" ^
 "  elseif ($cat -eq 'Public') { $tipo = 'PUBLICA (hay que cambiarla a Privada)'; $hayPublica = $true }" ^
 "  elseif ($cat -eq 'DomainAuthenticated') { $tipo = 'Dominio de empresa (esta regla no aplica)' }" ^
 "  else { $tipo = $cat };" ^
 "  Write-Host ('     - ' + $r.Name + ' [' + $r.InterfaceAlias + ']: ' + $tipo);" ^
 "};" ^
 "if ($hayPublica) { exit 10 } else { exit 0 }"
if not errorlevel 10 goto :revisar_bloqueos
echo.
echo     Si esta es la red de TU tienda (no la de una cafeteria, aeropuerto
echo     u otro lugar publico), conviene marcarla como Privada.
choice /c SN /n /m "     Marcar ahora como Privadas las redes Publicas de la lista? [S/N]: "
if errorlevel 2 goto :red_sin_cambio
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ok = $true;" ^
 "foreach ($r in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { [string]$_.NetworkCategory -eq 'Public' })) {" ^
 "  try {" ^
 "    Set-NetConnectionProfile -InterfaceIndex $r.InterfaceIndex -NetworkCategory Private -ErrorAction Stop;" ^
 "    Write-Host ('     [OK] La red ' + $r.Name + ' ahora es Privada.');" ^
 "  } catch {" ^
 "    $ok = $false;" ^
 "    Write-Host ('     No se pudo cambiar la red ' + $r.Name + ': ' + $_.Exception.Message);" ^
 "  };" ^
 "};" ^
 "if ($ok) { exit 0 } else { exit 1 }"
if errorlevel 1 goto :red_manual
goto :revisar_bloqueos

:red_sin_cambio
echo     No se cambio el tipo de red.
:red_manual
echo     Para hacerlo a mano: Configuracion, Red e Internet, Wi-Fi o Ethernet,
echo     abre las propiedades de tu red y en "Tipo de perfil de red" elige Privada.

:revisar_bloqueos
rem Si alguien eligio "Cancelar" en el aviso del firewall al abrir el sistema por primera vez,
rem Windows crea reglas que BLOQUEAN a node.exe, y un bloqueo gana sobre cualquier permiso.
rem Codigo 10 = se encontraron bloqueos que aplican a redes privadas.
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "$b = @(Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True -ErrorAction SilentlyContinue | Where-Object { ([string]$_.Profile -match 'Private|Any') -and (($_ | Get-NetFirewallApplicationFilter).Program -like '*\node.exe') });" ^
 "if ($b.Count -eq 0) { exit 0 };" ^
 "Write-Host '';" ^
 "Write-Host '     ATENCION: hay reglas del firewall que BLOQUEAN a Node.js, el programa que';" ^
 "Write-Host '     hace funcionar el sistema. Casi siempre aparecen cuando se elige Cancelar';" ^
 "Write-Host '     en el aviso del firewall la primera vez que se abre el sistema:';" ^
 "foreach ($r in $b) { Write-Host ('       - ' + $r.DisplayName) };" ^
 "exit 10"
if not errorlevel 10 goto :mostrar_ips
choice /c SN /n /m "     Desactivar esos bloqueos para que funcione el acceso desde la red? [S/N]: "
if errorlevel 2 goto :mostrar_ips
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "try {" ^
 "  Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True -ErrorAction SilentlyContinue | Where-Object { ([string]$_.Profile -match 'Private|Any') -and (($_ | Get-NetFirewallApplicationFilter).Program -like '*\node.exe') } | Disable-NetFirewallRule -ErrorAction Stop;" ^
 "  Write-Host '     [OK] Bloqueos desactivados.';" ^
 "} catch {" ^
 "  Write-Host ('     No se pudieron desactivar: ' + $_.Exception.Message);" ^
 "}"

:mostrar_ips
echo.
echo  3. Direccion para abrir el sistema desde tablets y celulares
echo     conectados al MISMO Wi-Fi de la tienda:
echo.
%PSEXE% -NoProfile -ExecutionPolicy Bypass -Command ^
 "$gw = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | ForEach-Object { $_.InterfaceIndex });" ^
 "$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Sort-Object { -not ($gw -contains $_.InterfaceIndex) }, InterfaceAlias);" ^
 "if ($ips.Count -eq 0) { Write-Host '     No se encontro ninguna direccion de red. Revisa que la PC este conectada al Wi-Fi o al cable de red.'; exit 0 };" ^
 "foreach ($ip in $ips) {" ^
 "  $nota = '';" ^
 "  if ($ips.Count -gt 1 -and $gw -contains $ip.InterfaceIndex) { $nota = '   [recomendada]' };" ^
 "  Write-Host ('     http://' + $ip.IPAddress + ':' + $env:PUERTO + '   (' + $ip.InterfaceAlias + ')' + $nota);" ^
 "}"
echo.
echo  Escribe esa direccion en el navegador de la tablet o celular y guardala
echo  en favoritos. El sistema debe estar abierto en ESTA computadora.
echo.
echo  Si no carga:
echo   - Revisa que la tablet use el mismo Wi-Fi (no la red de invitados).
echo   - Si la direccion cambio, vuelve a abrir este archivo para ver la nueva.
echo     Para que no cambie, pide que te asignen una IP fija en el modem.
echo   - Si al abrir el sistema Windows muestra un aviso del firewall para
echo     "Node.js", elige "Permitir acceso". Si alguien eligio "Cancelar",
echo     vuelve a abrir este archivo: detecta y corrige ese bloqueo.
echo   - Si tienes un antivirus con firewall propio (Norton, ESET, Avast...),
echo     permite tambien el puerto %PUERTO% en ese programa.
echo.
pause
exit /b 0

:error_regla
echo.
echo     No se pudo crear la regla del firewall. Revisa que el servicio
echo     "Firewall de Windows Defender" este activo e intentalo de nuevo.
echo.
pause
exit /b 1

:cancelado
echo.
echo  No se otorgaron los permisos de administrador; no se hizo ningun cambio.
echo  Vuelve a abrir este archivo y, cuando Windows lo pregunte, elige "Si".
echo  Si tu usuario no es administrador, pide ayuda a quien administra la PC.
echo.
pause
exit /b 1

:sin_admin
echo.
echo  No se pudieron obtener permisos de administrador; no se hizo ningun cambio.
echo  Haz clic derecho sobre este archivo y elige "Ejecutar como administrador".
echo.
pause
exit /b 1
