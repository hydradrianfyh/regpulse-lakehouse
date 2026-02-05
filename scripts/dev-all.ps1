$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $root
Set-Location $root

$logsDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$npmCmd = (Get-Command "npm.cmd" -ErrorAction SilentlyContinue).Path
if (-not $npmCmd) {
  $npmCmd = (Get-Command "npm" -ErrorAction SilentlyContinue).Path
}
$nodeExe = (Get-Command "node.exe" -ErrorAction SilentlyContinue).Path
if (-not $nodeExe) {
  $nodeExe = (Get-Command "node" -ErrorAction SilentlyContinue).Path
}
if (-not $nodeExe) {
  Write-Error "node not found in PATH."
  exit 1
}

function Resolve-NpmCliPath {
  param(
    [string]$NpmCmdPath,
    [string]$NodeExePath
  )

  $candidates = @()
  if ($NpmCmdPath) {
    $npmDir = Split-Path $NpmCmdPath -Parent
    $candidates += (Join-Path $npmDir "node_modules\npm\bin\npm-cli.js")
  }

  if ($NodeExePath) {
    $nodeDir = Split-Path $NodeExePath -Parent
    $candidates += (Join-Path $nodeDir "node_modules\npm\bin\npm-cli.js")
  }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

$npmCli = Resolve-NpmCliPath -NpmCmdPath $npmCmd -NodeExePath $nodeExe
if (-not $npmCli) {
  Write-Error "npm-cli.js not found. Please ensure npm is installed with Node."
  exit 1
}

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
  & $nodeExe $npmCli run dev
} finally {
  if ($apiProc -and -not $apiProc.HasExited) {
    Stop-Process -Id $apiProc.Id -Force
  }
  if ($workerProc -and -not $workerProc.HasExited) {
    Stop-Process -Id $workerProc.Id -Force
  }
}
