param([switch]$Install)

$ErrorActionPreference = 'Stop'
$port = 4318
$root = Join-Path $env:LOCALAPPDATA 'TOVAPOS\PrinterHelper'
$installed = Join-Path $root 'TOVAPOS-Printer-Helper.ps1'
if (-not $Install -and $PSCommandPath -ne $installed) { $Install = $true }

if ($Install) {
  New-Item -ItemType Directory -Force -Path $root | Out-Null
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

function Default-Printer { (Get-Printer | Where-Object Default -eq $true | Select-Object -First 1).Name }
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    if ($context.Request.HttpMethod -eq 'OPTIONS') { $context.Response.StatusCode = 204; $context.Response.Close(); continue }
    if ($context.Request.HttpMethod -eq 'GET' -and $context.Request.Url.AbsolutePath -eq '/health') { Send-Json $context 200 @{ ok = $true; printer = Default-Printer; platform = 'win32' }; continue }
    if ($context.Request.HttpMethod -ne 'POST' -or $context.Request.Url.AbsolutePath -ne '/print') { Send-Json $context 404 @{ ok = $false; error = 'Not found' }; continue }
    $reader = [IO.StreamReader]::new($context.Request.InputStream)
    $receipt = $reader.ReadToEnd() | ConvertFrom-Json
    $printer = if ($receipt.printerName) { $receipt.printerName } else { Default-Printer }
    if (-not $printer) { throw 'No default printer found.' }
    $lines = @('TOVAPOS', $receipt.businessName, $receipt.transactionId, $receipt.timestamp, ('Cashier: ' + $receipt.cashier), ('Payment: ' + $receipt.paymentMethod), ('-' * 48))
    $footer = if ($receipt.footer) { $receipt.footer } else { 'Thank you.' }
    $lines += ('-' * 48), ('Subtotal: ' + ([decimal]$receipt.subtotal).ToString('0.00')), ('Tax: ' + ([decimal]$receipt.taxAmount).ToString('0.00')), ('TOTAL: ' + ([decimal]$receipt.grandTotal).ToString('0.00')), '', $footer
    Send-RawReceipt $printer ($lines -join [Environment]::NewLine)
    Send-Json $context 200 @{ ok = $true; printer = $printer }
  } catch { Send-Json $context 500 @{ ok = $false; error = $_.Exception.Message } }
}
