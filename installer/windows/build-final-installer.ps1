param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$BuildRoot = Join-Path $env:TEMP 'tovapos-installer-build'
$Downloads = Join-Path $BuildRoot 'downloads'
$Payload = Join-Path $ProjectRoot 'installer\windows\payload'
$LocalProject = Join-Path $BuildRoot 'project'
$InnoDir = Join-Path $BuildRoot 'inno'
$InnoExe = Join-Path $InnoDir 'ISCC.exe'
$NodeZip = Join-Path $Downloads 'node-win-x64.zip'
$PostgresZip = Join-Path $Downloads 'postgres-win-x64.zip'
$InnoInstaller = Join-Path $Downloads 'innosetup.exe'

$NodeUrl = 'https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip'
$PostgresUrl = 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260427'
$InnoUrl = 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe'

function Download-IfMissing([string]$Url, [string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "Downloading $([IO.Path]::GetFileName($Path))..."
    Invoke-WebRequest -Uri $Url -OutFile $Path
  }
}

New-Item -ItemType Directory -Force -Path $Downloads, $InnoDir | Out-Null
Download-IfMissing $NodeUrl $NodeZip
Download-IfMissing $PostgresUrl $PostgresZip
Download-IfMissing $InnoUrl $InnoInstaller

if (-not (Test-Path $InnoExe)) {
  Write-Host 'Installing the temporary Inno Setup compiler...'
  Start-Process -FilePath $InnoInstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=$InnoDir") -Wait
}
if (-not (Test-Path $InnoExe)) { throw 'Inno Setup compiler was not installed.' }

$LocalPayload = Join-Path $LocalProject 'installer\windows\payload'
Remove-Item -LiteralPath $LocalProject -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $LocalPayload 'node'), (Join-Path $LocalPayload 'postgresql') | Out-Null

$NodeExtract = Join-Path $BuildRoot 'node'
$PostgresExtract = Join-Path $BuildRoot 'postgresql'
Remove-Item $NodeExtract, $PostgresExtract -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -LiteralPath $NodeZip -DestinationPath $NodeExtract
Expand-Archive -LiteralPath $PostgresZip -DestinationPath $PostgresExtract

$NodeExe = Get-ChildItem $NodeExtract -Filter node.exe -Recurse | Select-Object -First 1
$PostgresRoot = Get-ChildItem $PostgresExtract -Filter initdb.exe -Recurse | Select-Object -First 1 | ForEach-Object { $_.Directory.Parent.FullName }
if (-not $NodeExe) { throw 'Node Windows runtime was not found in the downloaded archive.' }
if (-not $PostgresRoot) { throw 'PostgreSQL Windows runtime was not found in the downloaded archive.' }

Copy-Item $NodeExe.FullName (Join-Path $LocalPayload 'node\node.exe') -Force
foreach ($folder in @('bin', 'lib', 'share')) {
  Copy-Item (Join-Path $PostgresRoot $folder) (Join-Path $LocalPayload "postgresql\$folder") -Recurse -Force
}

# Inno Setup cannot compile source files directly from the WSL UNC path. Stage
# only the required inputs on the local Windows filesystem first.
Copy-Item (Join-Path $ProjectRoot 'onprem-dist') (Join-Path $LocalProject 'onprem-dist') -Recurse -Force
Copy-Item (Join-Path $ProjectRoot 'public') (Join-Path $LocalProject 'public') -Recurse -Force
Copy-Item (Join-Path $ProjectRoot 'installer\windows\TOVAPOS-OnPremise.iss') (Join-Path $LocalProject 'installer\windows\TOVAPOS-OnPremise.iss') -Force
Copy-Item (Join-Path $ProjectRoot 'installer\windows\install-onprem.ps1') (Join-Path $LocalProject 'installer\windows\install-onprem.ps1') -Force
Copy-Item (Join-Path $ProjectRoot 'installer\windows\start-onprem.ps1') (Join-Path $LocalProject 'installer\windows\start-onprem.ps1') -Force

  Push-Location $LocalProject
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $LocalProject 'installer-output') | Out-Null
    & $InnoExe (Join-Path $LocalProject 'installer\windows\TOVAPOS-OnPremise.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup failed to compile the installer.' }
  } finally {
    Pop-Location
  }

$Output = Join-Path $ProjectRoot 'installer-output\TOVAPOS-OnPremise-Setup.exe'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Output) | Out-Null
Copy-Item (Join-Path $LocalProject 'installer-output\TOVAPOS-OnPremise-Setup.exe') $Output -Force
if (-not (Test-Path $Output)) { throw "Installer output was not found: $Output" }
Write-Host "SUCCESS: $Output" -ForegroundColor Green
