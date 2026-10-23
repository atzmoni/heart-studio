# Heart Studio offline launcher for Windows. Started by "Start Heart Studio.bat".
# Serves the studio folder on http://127.0.0.1:8765 (nothing but this computer can reach it) and opens it in Chrome or Edge
# as its own app window. The address never changes, so the browser remembers the microphone permission and the saved
# calibration between events. Needs only what ships with Windows: no internet, no install, no admin rights.

$ErrorActionPreference = "Stop"
$Port = 8765
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Ping = "heart-studio-launcher"
$RootPrefix = $Root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

$Entry = @("index.html", "heart.html") | Where-Object { Test-Path (Join-Path $Root $_) } | Select-Object -First 1
if (-not $Entry) { Write-Host "No index.html or heart.html next to the launcher folder." -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
$Url = "http://127.0.0.1:$Port/$Entry"

function Open-Studio {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
  $browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  try {
    if ($browser) {
      $profileDir = Join-Path $env:LOCALAPPDATA "HeartStudio\browser"
      Start-Process -FilePath $browser -ArgumentList @("--app=$Url", "--user-data-dir=`"$profileDir`"", "--no-first-run",
        "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling")
    } else {
      Start-Process $Url
    }
  } catch { Write-Host "  Could not open a browser. Open $Url yourself." -ForegroundColor Yellow }
}

$Types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".mjs" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"; ".json" = "application/json"; ".webmanifest" = "application/manifest+json"
  ".svg" = "image/svg+xml"; ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".gif" = "image/gif"
  ".webp" = "image/webp"; ".ico" = "image/x-icon"; ".woff2" = "font/woff2"; ".woff" = "font/woff"; ".ttf" = "font/ttf"
  ".mp4" = "video/mp4"; ".webm" = "video/webm"; ".mov" = "video/quicktime"; ".mp3" = "audio/mpeg"; ".wav" = "audio/wav"
  ".ogg" = "audio/ogg"; ".m4a" = "audio/mp4"; ".txt" = "text/plain; charset=utf-8"; ".md" = "text/plain; charset=utf-8"
}

function Send($client, [int]$code, [string]$reason, [string]$type, [byte[]]$body, [bool]$head) {
  $s = $client.GetStream()
  $h = "HTTP/1.1 $code $reason`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`n" +
       "X-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
  $hb = [Text.Encoding]::ASCII.GetBytes($h)
  $s.Write($hb, 0, $hb.Length)
  if (-not $head -and $body.Length) { $s.Write($body, 0, $body.Length) }
  $s.Flush()
}

function Serve($client) {
  $s = $client.GetStream(); $s.ReadTimeout = 2000
  $buf = New-Object byte[] 16384; $req = ""
  while ($req.IndexOf("`r`n`r`n") -lt 0 -and $req.Length -lt 65536) {
    $n = $s.Read($buf, 0, $buf.Length); if ($n -le 0) { return }
    $req += [Text.Encoding]::ASCII.GetString($buf, 0, $n)
  }
  $parts = ($req -split "`r`n")[0] -split " "
  $method = $parts[0]; $target = $parts[1]
  $text = { param($m) [Text.Encoding]::UTF8.GetBytes($m) }
  if ($method -ne "GET" -and $method -ne "HEAD") { Send $client 405 "Method Not Allowed" "text/plain" (& $text "GET only") $false; return }
  $path = [Uri]::UnescapeDataString(($target -split "[?#]")[0])
  if ($path -eq "/.ping") { Send $client 200 "OK" "text/plain" (& $text $Ping) ($method -eq "HEAD"); return }
  if ($path.EndsWith("/")) { $path += "index.html" }
  $full = [IO.Path]::GetFullPath((Join-Path $Root $path.TrimStart("/")))
  if (-not $full.StartsWith($RootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
    Send $client 404 "Not Found" "text/plain" (& $text "Not found") ($method -eq "HEAD"); return
  }
  $type = $Types[[IO.Path]::GetExtension($full).ToLower()]; if (-not $type) { $type = "application/octet-stream" }
  Send $client 200 "OK" $type ([IO.File]::ReadAllBytes($full)) ($method -eq "HEAD")
}

# Already running (a second double-click)? Just open another window on it.
try {
  $wc = New-Object Net.WebClient
  if ($wc.DownloadString("http://127.0.0.1:$Port/.ping") -eq $Ping) { Open-Studio; exit 0 }
} catch {}

$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } catch {
  Write-Host "Port $Port is taken by another program. Close it and try again." -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}

$Host.UI.RawUI.WindowTitle = "Heart Studio"
Write-Host ""
Write-Host "  Heart Studio is running at $Url" -ForegroundColor Magenta
Write-Host "  Works without internet. Keep this window open during the show; close it to stop."
Write-Host ""
Open-Studio

# Browsers open spare connections and leave some idle, so the loop never blocks on one: it only reads a connection once
# its request bytes have arrived, and drops connections that stay silent.
$pending = New-Object System.Collections.ArrayList
while ($true) {
  while ($listener.Pending()) { [void]$pending.Add(@{ c = $listener.AcceptTcpClient(); t = [DateTime]::UtcNow }) }
  $busy = $false
  foreach ($p in @($pending)) {
    $c = $p.c; $done = $false
    try {
      if ($c.Available -gt 0) { Serve $c; $done = $true; $busy = $true }
      elseif (([DateTime]::UtcNow - $p.t).TotalSeconds -gt 30) { $done = $true }
    } catch { $done = $true }
    if ($done) { try { $c.Close() } catch {}; $pending.Remove($p) }
  }
  if (-not $busy) { Start-Sleep -Milliseconds 5 }
}
