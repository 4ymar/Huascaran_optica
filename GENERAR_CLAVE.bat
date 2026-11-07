@echo off
title Generador de Claves - Uso Interno
color 0B
cd /d "%~dp0server"
node generar_clave.js
pause