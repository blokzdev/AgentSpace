# On-device screenshot helper for the emulator verification loop (see ondevice-verify.md).
# Captures the screen BINARY-SAFE (a `cmd` redirect — PowerShell '>' corrupts binary stdout)
# and downscales it <2000px so the image viewer accepts it. Output defaults to .tmp/s1.png.
#   powershell -NoProfile -File apps/mobile/scripts/shot.ps1 [-Out <path>]
param([string]$Out = (Join-Path (Get-Location) '.tmp\s1.png'))

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "adb not found at $adb" }

$raw = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), '.png')
cmd /c "`"$adb`" exec-out screencap -p > `"$raw`"" | Out-Null   # cmd redirect is binary-safe

$dir = Split-Path $Out -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($raw)
$w = 486; $h = [int]($img.Height * $w / $img.Width)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage($img, 0, 0, $w, $h)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
Remove-Item $raw -Force -ErrorAction SilentlyContinue
"shot -> $Out (${w}x${h}; tap coords = shot-pixel * ~2.222 on the 1080x2400 device)"
