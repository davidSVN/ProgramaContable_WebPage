@echo off
title WashFlow - Servicio de Impresion
color 0A
echo.
echo  ================================================
echo   WashFlow PrintBridge v1.0
echo   Servicio de impresion termica
echo  ================================================
echo.
echo  Verificando dependencias...
pip install flask flask-cors python-escpos Pillow pywin32 -q
echo.
echo  Iniciando servidor de impresion...
echo  Manten esta ventana ABIERTA mientras usas WashFlow
echo  Para detener: presiona Ctrl+C
echo.
cd /d "%~dp0"
python printbridge.py
echo.
echo  El servicio se detuvo. Presiona cualquier tecla para salir.
pause > nul
