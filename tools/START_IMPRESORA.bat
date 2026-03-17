@echo off
echo Iniciando WashFlow PrintBridge...
cd /d "%~dp0"
pip install -r requirements_print.txt -q
python printbridge.py
pause
