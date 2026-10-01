@echo off

if "%1"=="--logs" (
	set "REDIRECT="
) else (
	set "REDIRECT=>nul 2>&1"
)

for /f "delims=" %%a in ('powershell -NoProfile -Command "$p = Start-Process cmd.exe -ArgumentList '/c','cd ./client && npx serve -l 8080 %REDIRECT%' -PassThru -WindowStyle Hidden; $p.Id"') do set "HTMLPID=%%a"

for /f "delims=" %%a in ('powershell -NoProfile -Command "$p = Start-Process cmd.exe -ArgumentList '/c','cd ./server && node . --testing %REDIRECT%' -PassThru -WindowStyle Hidden; $p.Id"') do set "APIPID=%%a"


:menu

cls
echo "Modo de prueba activo, ve a -> http://localhost:8080"
echo "Para pruebas de la api, ve a -> http://localhost:3030"
echo.
echo.
echo.

echo "Opciones:"
echo "1. Abrir pagina"
echo "2. Abrir api"
echo "3. Cerrar todo"

choice /c 123 /n /m "Presione un numero > "

if %errorlevel%==1 (
	start http://localhost:8080
)

if %errorlevel%==2 (
	start http://localhost:3030
)

if %errorlevel%==3 (
	taskkill /PID %HTMLPID%
	taskkill /PID %APIPID%
	exit 0
)

goto menu

@pause