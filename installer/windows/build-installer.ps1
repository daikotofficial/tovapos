param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'
$payloadRoot = Join-Path $PSScriptRoot 'payload'
$nodeRuntime = Join-Path $payloadRoot 'node\node.exe'
$postgresBin = Join-Path $payloadRoot 'postgresql\bin\initdb.exe'
$iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue

if (-not $iscc) {
  throw 'Inno Setup is not installed or iscc.exe is not on PATH.'
}
if (-not (Test-Path $nodeRuntime)) {
  throw "Missing bundled Node runtime: $nodeRuntime"
}
if (-not (Test-Path $postgresBin)) {
  throw "Missing bundled PostgreSQL runtime: $postgresBin"
}

Push-Location $ProjectRoot
try {
  npm run package:onprem
  & $iscc.Source (Join-Path $PSScriptRoot 'TOVAPOS-OnPremise.iss')
  if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host 'Installer created in installer-output.'

