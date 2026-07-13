param(
  [int]$Port = 9222,
  [ValidateSet('Inspect', 'ClickRegister', 'ClickSignIn')][string]$Action = 'Inspect'
)
$ErrorActionPreference = 'Stop'

$targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json"
$target = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'http://localhost:4028/*' } | Select-Object -First 1
if (-not $target) { throw 'TOVAPOS browser target was not found' }

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$uri = [Uri]$target.webSocketDebuggerUrl
$null = $socket.ConnectAsync($uri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

function Send-Cdp([int]$Id, [string]$Method, [hashtable]$Params = @{}) {
  $payload = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 10
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $null = $socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

Send-Cdp 1 'Runtime.enable'
Send-Cdp 2 'Log.enable'
Send-Cdp 3 'Network.enable'
$expression = if ($Action -eq 'ClickRegister') {
  @'
document.querySelector('a[href="/sign-up-login?tab=signup"]')?.click(); 'register-clicked'
'@
} elseif ($Action -eq 'ClickSignIn') {
  @'
document.querySelector('a[href="/sign-up-login?tab=login"]')?.click(); 'sign-in-clicked'
'@
} else {
  @'
JSON.stringify({
  href: location.href,
  readyState: document.readyState,
  title: document.title,
  bodyText: document.body.innerText.slice(0, 1200),
  scripts: Array.from(document.scripts).map(s => ({src: s.src, type: s.type})),
  nextDataPresent: Boolean(document.querySelector('script[src*="/_next/"]')),
  serviceWorkerController: navigator.serviceWorker?.controller?.scriptURL || null,
  cookiesEnabled: navigator.cookieEnabled,
  online: navigator.onLine
})
'@
}
Send-Cdp 4 'Runtime.evaluate' @{ expression = $expression; returnByValue = $true; awaitPromise = $true }

$deadline = [DateTime]::UtcNow.AddSeconds(10)
$messages = @()
while ([DateTime]::UtcNow -lt $deadline) {
  $stream = [IO.MemoryStream]::new()
  do {
    $buffer = New-Object byte[] 65536
    $segment = [ArraySegment[byte]]::new($buffer)
    $cts = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(2))
    try {
      $result = $socket.ReceiveAsync($segment, $cts.Token).GetAwaiter().GetResult()
    } catch [OperationCanceledException] {
      $stream.Dispose()
      continue 2
    } finally {
      $cts.Dispose()
    }
    $stream.Write($buffer, 0, $result.Count)
  } while (-not $result.EndOfMessage)
  if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
    $stream.Dispose()
    break
  }
  $message = [Text.Encoding]::UTF8.GetString($stream.ToArray())
  $stream.Dispose()
  $parsed = $message | ConvertFrom-Json
  if ($parsed.id -eq 4 -or $parsed.method -in @('Runtime.exceptionThrown', 'Log.entryAdded', 'Network.loadingFailed')) {
    $messages += $parsed
  }
  if ($parsed.id -eq 4) { break }
}

$messages | ConvertTo-Json -Compress -Depth 20
$socket.Dispose()
