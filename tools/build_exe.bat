@echo off
cd /d "%~dp0"
py -m pip install flask flask-cors pywin32 Pillow pyinstaller -q
py -m PyInstaller --onefile --noconsole --name "WashFlow_PrintBridge" printbridge.py
echo LISTO — sube dist/WashFlow_PrintBridge.exe a GitHub Releases
pause
