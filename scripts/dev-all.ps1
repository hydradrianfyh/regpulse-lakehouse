param(
  [switch]$CheckOnly,
  [switch]$SkipInstall,
  [switch]$SkipDocker
)

$ErrorActionPreference = "Stop"

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $root
Set-Location $root

$logsDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Get-CommandPath([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Path }
  return $null
}

function Get-MajorVersion([string]$versionString) {
  if (-not $versionString) { return 0 }
  $clean = $versionString.Trim().TrimStart('v')
  $parts = $clean.Split('.')
  if ($parts.Length -eq 0) { return 0 }
  return [int]$parts[0]
}

function Ensure-Winget {
  $winget = Get-CommandPath "winget"
  if (-not $winget) {
    Write-Err "winget not found. Please install App Installer from Microsoft Store."
    exit 1
  }
  return $winget
}

function Install-WingetPackage([string]$id, [string]$label) {
  $winget = Ensure-Winget
  Write-Info "Installing $label via winget..."
  & $winget install -e --id $id --accept-source-agreements --accept-package-agreements
}

function Ensure-Tool([string]$name, [string]$label, [string]$wingetId) {
  $path = Get-CommandPath $name
  if ($path) { return $path }

  if ($SkipInstall -or $CheckOnly) {
    Write-Err "$label not found. Please install it first."
    exit 1
  }

  Install-WingetPackage -id $wingetId -label $label
  $path = Get-CommandPath $name
  if (-not $path) {
    Write-Err "$label install did not update PATH. Please reopen PowerShell and retry."
    exit 1
  }
  return $path
}

function Resolve-NpmCliPath([string]$npmCmdPath, [string]$nodeExePath) {
  $candidates = @()
  if ($npmCmdPath) {
    $npmDir = Split-Path $npmCmdPath -Parent
    $candidates += (Join-Path $npmDir "node_modules\npm\bin\npm-cli.js")
  }

  if ($nodeExePath) {
    $nodeDir = Split-Path $nodeExePath -Parent
    $candidates += (Join-Path $nodeDir "node_modules\npm\bin\npm-cli.js")
  }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }

  return $null
}

function Check-NodeAndNpm {
  $nodeExe = Ensure-Tool -name "node" -label "Node.js" -wingetId "OpenJS.NodeJS.LTS"
  $npmCmd = Get-CommandPath "npm.cmd"
  if (-not $npmCmd) { $npmCmd = Get-CommandPath "npm" }
  if (-not $npmCmd) {
    Write-Err "npm not found. Please reinstall Node.js."
    exit 1
  }

  $nodeVersion = (& $nodeExe -v)
  $npmVersion = (& $npmCmd -v)
  if ((Get-MajorVersion $nodeVersion) -lt 18) {
    Write-Warn "Node version $nodeVersion detected. Recommend Node 18+."
  } else {
    Write-Info "Node version $nodeVersion"
  }
  if ((Get-MajorVersion $npmVersion) -lt 9) {
    Write-Warn "npm version $npmVersion detected. Recommend npm 9+."
  } else {
    Write-Info "npm version $npmVersion"
  }

  return @{ NodeExe = $nodeExe; NpmCmd = $npmCmd }
}

function Check-Docker {
  if ($SkipDocker) { return $false }
  $docker = Ensure-Tool -name "docker" -label "Docker Desktop" -wingetId "Docker.DockerDesktop"
  try {
    & $docker info | Out-Null
    Write-Info "Docker daemon is running."
    return $true
  } catch {
    $startHint = Get-DockerDesktopStartHint
    Write-Warn "Docker daemon not running. Please start Docker Desktop and re-run this script."
    if ($startHint) {
      Write-Host "Quick start:" -ForegroundColor Yellow
      Write-Host "  $startHint" -ForegroundColor Yellow
    } else {
      Write-Host "Quick start: open Docker Desktop from the Start Menu." -ForegroundColor Yellow
    }
    exit 1
  }
}

function Get-DockerDesktopStartHint {
  $candidates = @()
  $pf = $env:ProgramFiles
  $pf86 = ${env:ProgramFiles(x86)}
  if ($pf) {
    $candidates += (Join-Path $pf "Docker\Docker\Docker Desktop.exe")
  }
  if ($pf86) {
    $candidates += (Join-Path $pf86 "Docker\Docker\Docker Desktop.exe")
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return "Start-Process `"$candidate`""
    }
  }
  return $null
}

function Ensure-Container([string]$name, [string]$image, [string[]]$runArgs) {
  $exists = (& docker ps -a --format "{{.Names}}") -contains $name
  if ($exists) {
    $running = & docker inspect -f "{{.State.Running}}" $name
    if ($running -ne "true") {
      Write-Info "Starting container $name..."
      & docker start $name | Out-Null
    } else {
      Write-Info "Container $name already running."
    }
  } else {
    Write-Info "Creating container $name..."
    & docker run @runArgs | Out-Null
  }
}

$toolInfo = Check-NodeAndNpm
$nodeExe = $toolInfo.NodeExe
$npmCmd = $toolInfo.NpmCmd
$npmCli = Resolve-NpmCliPath -npmCmdPath $npmCmd -nodeExePath $nodeExe
if (-not $npmCli) {
  Write-Err "npm-cli.js not found. Please ensure npm is installed with Node."
  exit 1
}

if ($CheckOnly) {
  Write-Info "Environment check complete."
  exit 0
}

if (-not $SkipDocker) {
  $dockerRunning = Check-Docker
  if ($dockerRunning) {
    Ensure-Container -name "regpulse-postgres" -image "pgvector/pgvector:pg16" -runArgs @(
      "--name", "regpulse-postgres",
      "-e", "POSTGRES_USER=user",
      "-e", "POSTGRES_PASSWORD=password",
      "-e", "POSTGRES_DB=regpulse",
      "-p", "5432:5432",
      "-d", "pgvector/pgvector:pg16"
    )
    Ensure-Container -name "regpulse-redis" -image "redis:7" -runArgs @(
      "--name", "regpulse-redis",
      "-p", "6379:6379",
      "-d", "redis:7"
    )
  }
}

if (-not $SkipInstall -and -not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Info "Installing npm dependencies..."
  & $nodeExe $npmCli install
}

Write-Info "Starting API and worker..."
$apiProc = Start-Process -FilePath $nodeExe -ArgumentList @($npmCli, "run", "dev:api") -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $logsDir "api.log") `
  -RedirectStandardError (Join-Path $logsDir "api.err") `
  -WindowStyle Hidden `
  -PassThru

$workerProc = Start-Process -FilePath $nodeExe -ArgumentList @($npmCli, "run", "dev:worker") -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $logsDir "worker.log") `
  -RedirectStandardError (Join-Path $logsDir "worker.err") `
  -WindowStyle Hidden `
  -PassThru

try {
  Write-Info "Starting web dev server..."
  & $nodeExe $npmCli run dev
} finally {
  if ($apiProc -and -not $apiProc.HasExited) {
    Stop-Process -Id $apiProc.Id -Force
  }
  if ($workerProc -and -not $workerProc.HasExited) {
    Stop-Process -Id $workerProc.Id -Force
  }
  Write-Info "Stopped background processes."
}
