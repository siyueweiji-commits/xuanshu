@echo off
setlocal
chcp 65001 >nul

echo ============================================================
echo   XuanShu - one-click push to GitHub
echo ============================================================
echo.
echo   This will push 2 repos to github.com/siyueweiji-commits :
echo     1. xuanshu
echo     2. xuanshu-data
echo.
echo   When asked, paste your Personal Access Token (PAT),
echo   then press Enter. The token must have BOTH of these scopes:/r/necho       repo      workflow
echo.
echo   Get one at: https://github.com/settings/tokens
echo.

if exist "D:/python/python.exe" (
    set "PY=D:/python/python.exe"
) else (
    set "PY=python"
)

cd /d "%~dp0"
echo   Python: %PY%
echo   ------------------------------------------------------------
echo.
%PY% scripts\bootstrap_github.py --only push

echo.
echo   ------------------------------------------------------------
echo   Finished. You can close this window now.
pause >nul
