@echo off
setlocal enabledelayedexpansion

:: Navegar al directorio del script
cd /d "%~dp0"

echo ======================================================
echo Instalador de WashFlow PrintBridge
echo ======================================================

:: 1. Instalar dependencias
echo [1/4] Instalando dependencias de Python...
python -m pip install flask flask-cors Pillow pywin32 pyinstaller

:: 2. Compilar con PyInstaller (MODO INVISIBLE)
echo [2/4] Compilando ejecutable (esto puede tardar unos minutos)...
python -m PyInstaller --onefile --noconsole --clean --name "WashFlow_PrintBridge" "printbridge.py"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Hubo un problema al compilar el archivo.
    pause
    exit /b %ERRORLEVEL%
)

:: 3. Copiar a la carpeta 'extra' del proyecto
set "ROOT_DIR=%~dp0.."
set "EXTRA_DIR=%ROOT_DIR%\extra"
if not exist "%EXTRA_DIR%" mkdir "%EXTRA_DIR%"

echo [3/4] Desplegando ejecutable en: %EXTRA_DIR%

:: Intentar cerrar el proceso si está corriendo para poder sobrescribir
taskkill /f /im WashFlow_PrintBridge.exe >nul 2>&1

if not exist "dist\WashFlow_PrintBridge.exe" (
    echo [ERROR] No se encontro el archivo compilado en dist\
    pause
    exit /b 1
)

copy /y "dist\WashFlow_PrintBridge.exe" "%EXTRA_DIR%\WashFlow_PrintBridge.exe"

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] No se pudo copiar el archivo a la carpeta extra.
    echo Asegurate de que el programa no este abierto o bloqueado.
    pause
    exit /b %ERRORLEVEL%
)

:: 4. Crear accesos directos
echo [4/4] Creando accesos directos (Escritorio e Inicio)...
set "EXE_PATH=%EXTRA_DIR%\WashFlow_PrintBridge.exe"
set "SHORTCUT_NAME=WashFlow_PrintBridge.lnk"
set "DESKTOP_PATH=%USERPROFILE%\Desktop\%SHORTCUT_NAME%"
set "STARTUP_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\%SHORTCUT_NAME%"

powershell -ExecutionPolicy Bypass -Command ^
    "$s=(New-Object -COM WScript.Shell).CreateShortcut('%DESKTOP_PATH%'); ^
    $s.TargetPath='%EXE_PATH%'; ^
    $s.WorkingDirectory='%EXTRA_DIR%'; ^
    $s.Description='Servidor de Impresión para WashFlow'; ^
    $s.Save(); ^
    Copy-Item -Path '%DESKTOP_PATH%' -Destination '%STARTUP_PATH%' -Force"

echo.
echo ======================================================
echo PROCESO COMPLETADO CON EXITO
echo ======================================================
echo 1. Ejecutable: %EXTRA_DIR%\WashFlow_PrintBridge.exe
echo 2. Acceso directo en Escritorio creado.
echo 3. Configurado para iniciar AUTOMATICAMENTE con Windows.
echo ======================================================
pause
