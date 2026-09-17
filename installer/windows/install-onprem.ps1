param(
  [string]$InstallRoot = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
)

$ErrorActionPreference = 'Stop'
$AppRoot = Join-Path $InstallRoot 'app'
$Runtime = Join-Path $InstallRoot 'runtime'
$Postgres = Join-Path $InstallRoot 'postgresql'
$Data = Join-Path $InstallRoot 'data'
$Backups = Join-Path $InstallRoot 'backups'
$Port = 4028
$DbPort = 55433
$DbName = 'tovapos_local'
$DbUser = 'tovapos_app'

function Require-File([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required installer file is missing: $Path"
  }
}

Require-File (Join-Path $Runtime 'node.exe')
Require-File (Join-Path $Postgres 'bin\initdb.exe')
Require-File (Join-Path $Postgres 'bin\pg_ctl.exe')
Require-File (Join-Path $Postgres 'bin\createdb.exe')
Require-File (Join-Path $AppRoot 'server.js')

New-Item -ItemType Directory -Force -Path $Data, $Backups | Out-Null
$PgData = Join-Path $Data 'postgres'
$PgCtl = Join-Path $Postgres 'bin\pg_ctl.exe'
$InitDb = Join-Path $Postgres 'bin\initdb.exe'
$CreateDb = Join-Path $Postgres 'bin\createdb.exe'
$Psql = Join-Path $Postgres 'bin\psql.exe'

if (-not (Test-Path (Join-Path $PgData 'PG_VERSION'))) {
  $PasswordBytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($PasswordBytes)
  $DbPassword = [Convert]::ToBase64String($PasswordBytes)
  $InitPasswordFile = Join-Path $Data 'initdb-password.tmp'
  Set-Content -LiteralPath $InitPasswordFile -Value $DbPassword -NoNewline
  & $InitDb -D $PgData -U $DbUser --auth=scram-sha-256 "--pwfile=$InitPasswordFile"
  Remove-Item -LiteralPath $InitPasswordFile -Force
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL initialization failed with exit code $LASTEXITCODE" }
  Set-Content -LiteralPath (Join-Path $Data 'db-password.txt') -Value $DbPassword -NoNewline
} else {
  $DbPassword = Get-Content -LiteralPath (Join-Path $Data 'db-password.txt') -Raw
}

if (-not (Get-Service -Name TOVAPOSPostgreSQL -ErrorAction SilentlyContinue)) {
  & $PgCtl register -N TOVAPOSPostgreSQL -D $PgData -o "-p $DbPort" -S auto
}
Start-Service TOVAPOSPostgreSQL

$databaseReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $probe = & $Psql -h 127.0.0.1 -p $DbPort -U $DbUser -d postgres -tAc 'SELECT 1' 2>$null
  if ($LASTEXITCODE -eq 0 -and $probe -match '1') {
    $databaseReady = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $databaseReady) { throw "The local PostgreSQL database did not become ready on port $DbPort." }

$env:PGPASSWORD = $DbPassword.Trim()
& $CreateDb -h 127.0.0.1 -p $DbPort -U $DbUser $DbName 2>$null
if ($LASTEXITCODE -ne 0) {
  $existing = & (Join-Path $Postgres 'bin\psql.exe') -h 127.0.0.1 -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
  if (-not ($existing -match '1')) { throw "Could not create or verify the local database" }
}

$envFile = @"
NODE_ENV=production
DEPLOYMENT_MODE=onprem
NEXT_PUBLIC_DEPLOYMENT_MODE=onprem
PORT=$Port
HOSTNAME=0.0.0.0
DATABASE_URL=postgresql://$DbUser`:$([uri]::EscapeDataString($DbPassword.Trim()))@127.0.0.1`:$DbPort/$DbName
NEXT_PUBLIC_STORAGE_DRIVER=postgres
NEXT_PUBLIC_SITE_URL=http://127.0.0.1`:$Port
NEXT_PUBLIC_APP_URL=http://127.0.0.1`:$Port
DATABASE_POOL_MAX=10
ONPREM_BACKUP_DIR=$Backups
PASSWORD_RESET_DEV_LINKS=false
AUTH_DEV_LINKS=false
"@
Set-Content -LiteralPath (Join-Path $AppRoot '.env') -Value $envFile -Encoding utf8

$serverCmd = @"
@echo off
cd /d "$AppRoot"
set NODE_ENV=production
set DEPLOYMENT_MODE=onprem
set NEXT_PUBLIC_DEPLOYMENT_MODE=onprem
set PORT=$Port
set HOSTNAME=0.0.0.0
"$Runtime\node.exe" "$AppRoot\server.js"
"@
Set-Content -LiteralPath (Join-Path $InstallRoot 'TOVAPOS-Server.cmd') -Value $serverCmd -Encoding ascii

$startCmd = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$InstallRoot\installer\start-onprem.ps1" -InstallRoot "$InstallRoot"
"@
Set-Content -LiteralPath (Join-Path $InstallRoot 'TOVAPOS-Start.cmd') -Value $startCmd -Encoding ascii

New-NetFirewallRule -DisplayName 'TOVAPOS On-Premise LAN' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private -ErrorAction SilentlyContinue | Out-Null

$serverLog = Join-Path $Data 'server.log'
$serverErrorLog = Join-Path $Data 'server-error.log'
$existingServer = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
  try { $_.Path -eq (Join-Path $Runtime 'node.exe') } catch { $false }
} | Select-Object -First 1
if (-not $existingServer) {
  Start-Process -FilePath (Join-Path $Runtime 'node.exe') -ArgumentList @('server.js') -WorkingDirectory $AppRoot -WindowStyle Hidden -RedirectStandardOutput $serverLog -RedirectStandardError $serverErrorLog | Out-Null
}

$appReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2
    if ($health.StatusCode -eq 200) {
      $appReady = $true
      break
    }
  } catch { }
  Start-Sleep -Seconds 1
}
if (-not $appReady) { throw "The TOVAPOS server did not become ready. Check $serverErrorLog for details." }

Write-Host "TOVAPOS installed and ready. Open http://127.0.0.1:$Port or the server LAN IP from cashier computers."
