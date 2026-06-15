@echo off
echo ========================================
echo   GHN Dashboard - Local Server
echo ========================================
echo.

:: Thu thu Python
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Dung Python de chay server...
    echo.
    echo Dashboard dang chay tai: http://localhost:8080
    echo Nhan Ctrl+C de dung server.
    echo.
    start "" "http://localhost:8080"
    python -m http.server 8080
    goto end
)

:: Thu Node.js
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Dung Node.js de chay server...
    echo.
    npx serve -l 8080 . 2>nul || (
        echo Dang cai serve...
        npm install -g serve >nul 2>&1
        npx serve -l 8080 .
    )
    goto end
)

echo [LOI] Khong tim thay Python hoac Node.js!
echo Vui long cai Python tai: https://python.org
pause

:end
