@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
  node server.mjs --open
) else if exist "D:\APP\node\node.exe" (
  "D:\APP\node\node.exe" server.mjs --open
) else (
  echo 未找到 Node.js。请安装 Node.js 22 或更新版本后重试。
)
pause
