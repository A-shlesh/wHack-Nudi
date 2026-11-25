<#
  Starts the Nudi helper (the backend) in one step, on Windows.

  What it does:
    1. checks that Python 3.11 or newer is installed
    2. creates backend\.venv the first time, and installs what Nudi needs
    3. creates backend\.env from .env.example if it does not exist yet
       (no keys needed: without them Nudi uses its own offline rules)
    4. starts the helper on port 8787 and prints the links to open

  Run:      .\start.ps1            (or double-click start.bat)
  Phone:    .\start.ps1 -Lan       (lets a phone on the same Wi-Fi open the family dashboard)
#>
param([switch]$Lan)

$ErrorActionPreference = "Stop"
$backend = Join-Path $PSScriptRoot "backend"
Set-Location $backend

function Write-Step($text) { Write-Host "`n>> $text" -ForegroundColor Cyan }

# ---- 1. Python ----
Write-Step "Checking Python"
$python = $null
foreach ($candidate in @("python", "py")) {
    try {
        $version = & $candidate -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
        if ($LASTEXITCODE -eq 0 -and $version) { $python = $candidate; break }
    } catch { }
}
if (-not $python) {
    Write-Host "Python is not installed. Install Python 3.11 or newer from https://www.python.org/downloads/" -ForegroundColor Red
    Write-Host "During install, tick 'Add python.exe to PATH'. Then run this again." -ForegroundColor Red
    exit 1
}
if ([version]$version -lt [version]"3.11") {
    Write-Host "Python $version is too old. Please install Python 3.11 or newer from https://www.python.org/downloads/" -ForegroundColor Red
    exit 1
}
Write-Host "Python $version found."

# ---- 2. Virtual environment and packages ----
$venvPython = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Step "Creating backend\.venv (first time only)"
    & $python -m venv .venv
}
Write-Step "Installing what Nudi needs (quick after the first time)"
& $venvPython -m pip install --quiet --disable-pip-version-check -r requirements-dev.txt
if ($LASTEXITCODE -ne 0) { Write-Host "Installing failed. Check your internet connection and try again." -ForegroundColor Red; exit 1 }

# ---- 3. Settings file ----
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created backend\.env. Optional: add Gemini or Groq keys there for smarter answers."
}

# ---- 4. Start ----
$port = 8787
$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host "`nSomething is already using port $port (maybe Nudi is already running). Open http://localhost:$port/health to check." -ForegroundColor Yellow
    exit 1
}

$listen = "127.0.0.1"
$phoneLink = ""
if ($Lan) {
    $listen = "0.0.0.0"
    $ip = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "*vEthernet*" } |
        Sort-Object { if ($_.InterfaceAlias -like "*Wi-Fi*") { 0 } else { 1 } } |
        Select-Object -First 1 -ExpandProperty IPAddress
    if ($ip) { $phoneLink = "http://${ip}:$port/dashboard/" }
}

Write-Host ""
Write-Host "Nudi helper is starting. Keep this window open." -ForegroundColor Green
Write-Host "  Check it:          http://localhost:$port/health"
Write-Host "  Demo bill page:    http://localhost:$port/demo/"
Write-Host "  Demo scam page:    http://localhost:$port/demo/bescom-scam.html"
Write-Host "  Family dashboard:  http://localhost:$port/dashboard/"
if ($phoneLink) { Write-Host "  On your phone:     $phoneLink  (same Wi-Fi; allow Python if Windows asks)" }
Write-Host "Press Ctrl+C to stop.`n"

& $venvPython -m uvicorn app.main:app --host $listen --port $port
