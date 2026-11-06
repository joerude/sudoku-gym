@echo off
rem Sudoku Gym for Windows, no Docker: double-click, or gym.cmd [start|backup]. Needs Python 3.14+.
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "PY="
py -3 -c "import sys; sys.exit(sys.version_info < (3, 14))" >nul 2>&1 && set "PY=py -3"
if not defined PY python -c "import sys; sys.exit(sys.version_info < (3, 14))" >nul 2>&1 && set "PY=python"
if not defined PY goto nopython

%PY% tools\launch.py %*
if errorlevel 1 pause
exit /b

:nopython
echo Нужен Python 3.14 или новее.
where winget >nul 2>&1 || goto manual
choice /c YN /m "Установить Python 3.14 через winget"
if errorlevel 2 goto manual
winget install -e --id Python.Python.3.14
echo.
echo Готово. Закрой это окно и запусти gym.cmd ещё раз.
pause
exit /b

:manual
echo Скачай установщик с https://www.python.org/downloads/ и при установке отметь
echo "Add python.exe to PATH", затем запусти gym.cmd ещё раз.
pause
exit /b 1
