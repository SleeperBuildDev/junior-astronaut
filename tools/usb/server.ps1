# Tiny local web server for the offline copy of Junior Astronaut (no install needed:
# it uses the HttpListener that comes with Windows). Browsers block a game opened straight
# from a file, so "Play Junior Astronaut.bat" runs this, then opens the game in the browser.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'game'))
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.wasm' = 'application/wasm'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'; '.ktx2' = 'image/ktx2'; '.hdr' = 'application/octet-stream'
  '.exr' = 'application/octet-stream'; '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'
  '.bin' = 'application/octet-stream'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'
  '.wav' = 'audio/wav'; '.m4a' = 'audio/mp4'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2'
}

# The first free port from 8765 up.
$listener = $null
foreach ($port in 8765..8785) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$port/")
    $l.Start()
    $listener = $l
    break
  } catch { }
}
if (-not $listener) {
  Write-Host 'Could not start the game server (ports 8765-8785 are busy).'
  Read-Host 'Press Enter to close'
  exit 1
}
$url = "http://localhost:$port/"
Write-Host ''
Write-Host '  JUNIOR ASTRONAUT: Lunar Survival Mission'
Write-Host "  The game is running at $url"
Write-Host '  Keep this window open while you play. Close it to stop the game.'
Write-Host ''
Start-Process $url

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { continue }
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    if ($file.StartsWith($root) -and [IO.File]::Exists($file)) {
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    # The browser closed the connection early; keep serving.
  } finally {
    try { $res.Close() } catch { }
  }
}
