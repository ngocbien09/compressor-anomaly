# CompressorGuard AI - Startup Script
# Run with: .\start.ps1

$ErrorActionPreference = "Continue"
$ROOT = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CompressorGuard AI - Starting Up" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Check Python ──────────────────────────────────────────────────────────────
Write-Host "[1/6] Checking Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "not found" }
    Write-Host "  Found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Python not found. Install Python 3.10+ from https://python.org" -ForegroundColor Red
    exit 1
}

# ── Check / Install Node.js ───────────────────────────────────────────────────
Write-Host "[2/6] Checking Node.js..." -ForegroundColor Yellow
$nodeOk = $false
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Found: Node.js $nodeVersion" -ForegroundColor Green
        $nodeOk = $true
    }
} catch {}

if (-not $nodeOk) {
    Write-Host "  Node.js not found. Attempting to install via winget..." -ForegroundColor Yellow
    try {
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements -h
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $nodeVersion = node --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Node.js installed: $nodeVersion" -ForegroundColor Green
            $nodeOk = $true
        }
    } catch {
        Write-Host "  Auto-install failed. Please install Node.js 20+ manually:" -ForegroundColor Red
        Write-Host "  https://nodejs.org/en/download" -ForegroundColor Yellow
        Write-Host "  Then re-run this script." -ForegroundColor Yellow
        exit 1
    }
}

# ── Check ANTHROPIC_API_KEY ───────────────────────────────────────────────────
Write-Host "[3/6] Checking ANTHROPIC_API_KEY..." -ForegroundColor Yellow
if ([string]::IsNullOrEmpty($env:ANTHROPIC_API_KEY)) {
    Write-Host "  WARNING: ANTHROPIC_API_KEY not set. Mock AI responses will be used." -ForegroundColor Yellow
    Write-Host '  To enable: $env:ANTHROPIC_API_KEY = "sk-ant-..."' -ForegroundColor DarkYellow
} else {
    Write-Host "  Found: API key configured" -ForegroundColor Green
}

# ── Backend: Setup venv ───────────────────────────────────────────────────────
Write-Host "[4/6] Setting up Python backend..." -ForegroundColor Yellow
Set-Location "$ROOT\backend"

if (-not (Test-Path "venv")) {
    Write-Host "  Creating virtual environment..." -ForegroundColor Gray
    python -m venv venv
}

Write-Host "  Activating venv and installing dependencies..." -ForegroundColor Gray
& ".\venv\Scripts\Activate.ps1"
pip install -r requirements.txt -q

# Create __init__.py files
$pkgDirs = @(".", "data", "models", "training", "evaluation", "deployment", "agent", "database")
foreach ($d in $pkgDirs) {
    $initFile = Join-Path $ROOT "backend\$d\__init__.py"
    if (-not (Test-Path $initFile)) { New-Item -ItemType File -Path $initFile -Force | Out-Null }
}

Write-Host "  Backend dependencies installed." -ForegroundColor Green

# Generate sample data if needed
if (-not (Test-Path "$ROOT\backend\data\sample_data.csv")) {
    Write-Host "  Generating initial dataset (this takes ~30 seconds)..." -ForegroundColor Gray
    python data/generator.py
    Write-Host "  Dataset generated." -ForegroundColor Green
}

# ── Start Backend ─────────────────────────────────────────────────────────────
Write-Host "[5/6] Starting FastAPI backend on port 8000..." -ForegroundColor Yellow
Set-Location $ROOT

$backendProcess = Start-Process -FilePath ".\backend\venv\Scripts\python.exe" `
    -ArgumentList "-m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload" `
    -WorkingDirectory $ROOT `
    -PassThru -WindowStyle Minimized

Write-Host "  Backend started (PID: $($backendProcess.Id))" -ForegroundColor Green

# ── Frontend ──────────────────────────────────────────────────────────────────
Write-Host "[6/6] Starting React frontend on port 3000..." -ForegroundColor Yellow
Set-Location "$ROOT\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "  Running npm install..." -ForegroundColor Gray
    npm install
}

$frontendProcess = Start-Process -FilePath "npm" `
    -ArgumentList "run dev" `
    -WorkingDirectory "$ROOT\frontend" `
    -PassThru -WindowStyle Minimized

Write-Host "  Frontend started (PID: $($frontendProcess.Id))" -ForegroundColor Green

# ── Wait and open browser ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "Waiting 6 seconds for services to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 6

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Services Running:" -ForegroundColor Cyan
Write-Host "  Backend API:  http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:     http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Frontend App: http://localhost:3000" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Enter to stop both services..." -ForegroundColor Yellow

Start-Process "http://localhost:3000"

Read-Host

Write-Host "Stopping services..." -ForegroundColor Yellow
if (-not $backendProcess.HasExited)  { Stop-Process -Id $backendProcess.Id  -Force -ErrorAction SilentlyContinue }
if (-not $frontendProcess.HasExited) { Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue }
# Also kill any child node/uvicorn processes
Get-Process -Name "uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green
