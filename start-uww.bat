@echo off
title UWW Olympic Wrestling Digital Scoreboard - Local Server
color 0B
cd /d "%~dp0"

echo ====================================================================
echo   UWW OLYMPIC WRESTLING SCOREBOARD ^& TOURNAMENT SYSTEM (LOCAL MODE)
echo ====================================================================
echo.
echo [1/3] Memeriksa layanan MySQL lokal (127.0.0.1:3306)...

tasklist /FI "IMAGENAME eq mysqld.exe" 2>NUL | find /I /N "mysqld.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo       MySQL sudah aktif berjalan.
) else (
    if exist "C:\xampp\mysql\bin\mysqld.exe" (
        echo       Menyalakan MySQL lokal dari XAMPP...
        start "" /B "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone
        timeout /t 3 /nobreak >nul
    ) else (
        echo       Pastikan MySQL ^(Laragon / XAMPP^) sudah menyala di port 3306.
    )
)

echo [2/3] Menjalankan server lokal UWW di port 4000...
start "UWW Local Backend Server" cmd /k "npm run start:local"

echo [3/3] Menunggu server siap ^(3 detik^)...
timeout /t 3 /nobreak >nul

echo Membuka Operator Controller di browser...
start "" "http://localhost:4000/controller"

echo.
echo Server telah berjalan! Jangan tutup jendela "UWW Local Backend Server" selama pertandingan berlangsung.
timeout /t 3 >nul
