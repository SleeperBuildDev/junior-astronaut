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
  '.wav' = 'audio/wav'; '.m4a' = 'audio/mp4'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.mp4' = 'video/mp4'
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
      # Range requests (the music video): answer in pieces of at most 2 MB, so this one-at-a-time
      # server never stays stuck sending a long video while the game asks for something else.
      $res.AddHeader('Accept-Ranges', 'bytes')
      $fs = [IO.File]::OpenRead($file)
      try {
        $size = $fs.Length
        $start = [long]0
        $end = $size - 1
        $range = $ctx.Request.Headers['Range']
        if ($range -match '^bytes=(\d*)-(\d*)$') {
          if ($matches[1] -ne '') {
            $start = [long]$matches[1]
            if ($matches[2] -ne '') { $end = [Math]::Min([long]$matches[2], $size - 1) }
          } elseif ($matches[2] -ne '') {
            $start = [Math]::Max([long]0, $size - [long]$matches[2])
          }
          $end = [Math]::Min($end, $start + 2MB - 1)
          if ($start -ge $size -or $end -lt $start) {
            $res.StatusCode = 416
            $res.AddHeader('Content-Range', "bytes */$size")
            $end = $start - 1
          } else {
            $res.StatusCode = 206
            $res.AddHeader('Content-Range', "bytes $start-$end/$size")
          }
        }
        $left = $end - $start + 1
        $res.ContentLength64 = [Math]::Max([long]0, $left)
        $fs.Position = $start
        $buf = New-Object byte[] 262144
        while ($left -gt 0) {
          $n = $fs.Read($buf, 0, [int][Math]::Min([long]$buf.Length, $left))
          if ($n -le 0) { break }
          $res.OutputStream.Write($buf, 0, $n)
          $left -= $n
        }
      } finally {
        $fs.Close()
      }
    } else {
      $res.StatusCode = 404
    }
  } catch {
    # The browser closed the connection early; keep serving.
  } finally {
    try { $res.Close() } catch { }
  }
}
