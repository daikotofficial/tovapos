param(
  [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$AppRoot = Join-Path $InstallRoot 'app'
$Runtime = Join-Path $InstallRoot 'runtime'
$Data = Join-Path $InstallRoot 'data'
$Port = 4028
$PrintAgent = Join-Path $AppRoot 'print-agent.mjs'
$node = Join-Path $Runtime "node.exe"

$service = Get-Service -Name TOVAPOSPostgreSQL -ErrorAction SilentlyContinue
if (-not $service) {
  throw 'TOVAPOS database service is not installed. Run the TOVAPOS installer again.'
}
if ($service.Status -ne 'Running') {
  Start-Service -Name TOVAPOSPostgreSQL
  $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
}

$ready = $false
try {
  $health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2
  $ready = $health.StatusCode -eq 200
} catch { }

if (-not $ready) {
  $node = Join-Path $Runtime 'node.exe'
  if (-not (Test-Path (Join-Path $AppRoot 'server.js'))) {
    throw 'The TOVAPOS application files are incomplete. Please repair or reinstall TOVAPOS.'
  }
  Start-Process -FilePath $node -ArgumentList @('server.js') -WorkingDirectory $AppRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Data 'server.log') -RedirectStandardError (Join-Path $Data 'server-error.log') | Out-Null
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2
      if ($health.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
  }
}

if (-not $ready) {
  throw "TOVAPOS could not start. Check $(Join-Path $Data 'server-error.log')."
}

if (Test-Path $PrintAgent) {
  $printReady = $false
  try { $printReady = (Invoke-WebRequest -Uri 'http://127.0.0.1:4318/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { }
  if (-not $printReady) { Start-Process -FilePath $node -ArgumentList @($PrintAgent) -WorkingDirectory $AppRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Data 'printer.log') -RedirectStandardError (Join-Path $Data 'printer-error.log') | Out-Null }
}
Start-Process "http://127.0.0.1:$Port"

