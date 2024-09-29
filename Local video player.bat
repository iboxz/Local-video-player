@echo off
start /b cmd /c "npm run start"
start /b cmd /c "npm run serve"
timeout /t 5 >nul
start "" "http://localhost:8081/index.html"
