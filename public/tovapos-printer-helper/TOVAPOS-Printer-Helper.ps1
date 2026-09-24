param([switch]$Install)

$ErrorActionPreference = 'Stop'
$port = 4318
$root = Join-Path $env:LOCALAPPDATA 'TOVAPOS\PrinterHelper'
$installed = Join-Path $root 'TOVAPOS-Printer-Helper.ps1'
if (-not $Install -and $PSCommandPath -ne $installed) { $Install = $true }

if ($Install) {
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.CommandLine -like "*$installed*" } | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }
  Copy-Item -LiteralPath $PSCommandPath -Destination $installed -Force
  $command = "powershell.exe -NoProfile -File `"$installed`""
  New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'TOVAPOS Printer Helper' -Value $command -PropertyType String -Force | Out-Null
  Start-Process powershell.exe -ArgumentList @('-NoProfile', '-File', $installed) -WindowStyle Minimized
  Write-Host 'TOVAPOS Printer Helper installed for this Windows user.'
  exit 0
}

function Send-Json($context, $status, $body) {
  $origin = $context.Request.Headers['Origin']
  $bytes = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
  $context.Response.StatusCode = $status
  $context.Response.ContentType = 'application/json'
  if ($origin) { $context.Response.Headers.Add('Access-Control-Allow-Origin', $origin) }
  $context.Response.Headers.Add('Vary', 'Origin')
  $context.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $context.Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}

function Send-RawReceipt($printerName, $text) {
  if (-not ("TovaRawPrinter" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TovaRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DocInfo { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv")] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr handle, int level, DocInfo doc);
  [DllImport("winspool.drv")] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv")] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv")] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv")] static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static bool Send(string name, byte[] bytes) { IntPtr h; if (!OpenPrinter(name, out h, IntPtr.Zero)) return false; var d = new DocInfo { pDocName = "TOVAPOS Receipt", pDataType = "RAW" }; bool ok = StartDocPrinter(h, 1, d) > 0 && StartPagePrinter(h); int written; if (ok) ok = WritePrinter(h, bytes, bytes.Length, out written) && written == bytes.Length; EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h); return ok; }
}
"@
  }
  $payload = [Text.Encoding]::UTF8.GetBytes(([char]27 + [char]64) + $text + (([char]13 + [char]10) * 3) + [char]29 + [char]86 + [char]0)
  if (-not [TovaRawPrinter]::Send($printerName, $payload)) { throw 'Windows printer rejected the raw receipt.' }
}

function Default-Printer {
  $printers = @(Get-Printer)
  $preferred = $printers | Where-Object { $_.Name -match 'Xprinter|XP[- ]' } | Select-Object -First 1
  if ($preferred) { return $preferred.Name }
  $default = $printers | Where-Object Default -eq $true | Select-Object -First 1
  if ($default) { return $default.Name }
  return ($printers | Select-Object -First 1).Name
}
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    if ($context.Request.HttpMethod -eq 'OPTIONS') {
      $origin = $context.Request.Headers['Origin']
      if ($origin) { $context.Response.Headers.Add('Access-Control-Allow-Origin', $origin) }
      $context.Response.Headers.Add('Vary', 'Origin')
      $context.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      $context.Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
      $context.Response.StatusCode = 204
      $context.Response.Close()
      continue
    }
    if ($context.Request.HttpMethod -eq 'GET' -and $context.Request.Url.AbsolutePath -eq '/health') { Send-Json $context 200 @{ ok = $true; printer = Default-Printer; platform = 'win32' }; continue }
    if ($context.Request.HttpMethod -ne 'POST' -or $context.Request.Url.AbsolutePath -ne '/print') { Send-Json $context 404 @{ ok = $false; error = 'Not found' }; continue }
    $reader = [IO.StreamReader]::new($context.Request.InputStream)
    $receipt = $reader.ReadToEnd() | ConvertFrom-Json
    $printer = if ($receipt.printerName) { $receipt.printerName } else { Default-Printer }
    if (-not $printer) { throw 'No default printer found.' }
    if ($receipt.rawText) {
      Send-RawReceipt $printer ([string]$receipt.rawText)
      Send-Json $context 200 @{ ok = $true; printer = $printer }
      continue
    }
    $width = 48
    $lines = @()
    $money = { param($value) if ($null -eq $value) { return '0.00' }; return ([decimal]$value).ToString('N2', [Globalization.CultureInfo]::InvariantCulture) }
    $center = { param($value, [ref]$target); $text = [string]$value; if ($text.Length -gt $width) { $text = $text.Substring(0, $width) }; $target.Value += (' ' * [Math]::Max(0, [int](($width - $text.Length) / 2))) + $text }
    & $center 'TOVAPOS' ([ref]$lines)
    & $center $receipt.businessName ([ref]$lines)
    if ($receipt.businessAddress) { & $center $receipt.businessAddress ([ref]$lines) }
    if ($receipt.businessPhone) { & $center $receipt.businessPhone ([ref]$lines) }
    & $center $receipt.transactionId ([ref]$lines)
    $lines += ('-' * $width)
    $lines += ('Date'.PadRight(12) + ([string]$receipt.timestamp))
    $lines += ('Cashier'.PadRight(12) + ([string]$receipt.cashier))
    if ($receipt.customerName) { $lines += ('Customer'.PadRight(12) + ([string]$receipt.customerName)) }
    $lines += ('Payment'.PadRight(12) + ([string]$receipt.paymentMethod).ToUpperInvariant())
    $lines += ('-' * $width)
    $lines += ('Description'.PadRight(24) + 'Qty'.PadLeft(5) + 'Price'.PadLeft(9) + 'Total'.PadLeft(10))
    $lines += ('-' * $width)
    foreach ($item in $receipt.items) {
    $name = [string]$item.name; $unit = if ($item.saleUnit -and $item.saleUnit -ne 'piece') { ' (' + $item.saleUnit + ')' } else { '' }; $name = $name + $unit; $qty = [string]$item.quantity; $price = & $money $item.unitPrice; $total = & $money ([decimal]$item.unitPrice * [decimal]$item.quantity * (1 - ([decimal]$item.discount / 100)));
    $first = $true; while ($name.Length -gt 0) { $part = if ($name.Length -gt 24) { $name.Substring(0,24) } else { $name }; $name = if ($name.Length -gt 24) { $name.Substring(24).TrimStart() } else { '' }; if ($first) { $lines += $part.PadRight(24) + $qty.PadLeft(5) + $price.PadLeft(9) + $total.PadLeft(10); $first = $false } else { $lines += $part }; }
    $lines += ('-' * $width)
    }
    $lines += ('Subtotal'.PadRight(38) + (& $money $receipt.subtotal).PadLeft(10))
    if ([decimal]$receipt.discountTotal -gt 0) { $lines += ('Discount'.PadRight(38) + ('-' + (& $money $receipt.discountTotal)).PadLeft(10)) }
    $taxLabel = if ($receipt.taxLabel) { $receipt.taxLabel } else { 'VAT' }; $lines += (('Tax (' + $taxLabel + ')').PadRight(38) + (& $money $receipt.taxAmount).PadLeft(10))
    $lines += ('AMOUNT PAID'.PadRight(38) + (& $money $receipt.amountPaid).PadLeft(10))
    if ($receipt.paymentMethod -eq 'cash') { $lines += ('Cash Tendered'.PadRight(38) + (& $money $receipt.cashTendered).PadLeft(10)); $lines += ('Change'.PadRight(38) + (& $money $receipt.changeGiven).PadLeft(10)) }
    $lines += ('-' * $width)
    $footer = if ($receipt.footer) { [string]$receipt.footer } else { 'Thank you for shopping with us.' }; foreach ($footerLine in ($footer -split '\r?\n')) { & $center $footerLine ([ref]$lines) }
    $lines += '', ''
    Send-RawReceipt $printer ($lines -join [Environment]::NewLine)
    Send-Json $context 200 @{ ok = $true; printer = $printer }
  } catch { Send-Json $context 500 @{ ok = $false; error = $_.Exception.Message } }
}
