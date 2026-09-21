# Generates fictional sample medicine-label photos into public/samples/.
# Windows PowerShell 5.1 + System.Drawing. All names/strings are fictional; no real branding.
# Usage (from repo root):  powershell -ExecutionPolicy Bypass -File scripts/generate-sample-labels.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot "..\public\samples"
New-Item -ItemType Directory -Force $out | Out-Null

function New-Photo([string]$file, [string[]]$lines, [bool]$degrade) {
  $w = 900; $h = 640
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAlias'

  # "table" background + soft gradient
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0,0)), ([System.Drawing.Point]::new($w,$h)), ([System.Drawing.Color]::FromArgb(214,205,190)), ([System.Drawing.Color]::FromArgb(184,174,158))
  $g.FillRectangle($bg, 0, 0, $w, $h)

  # amber bottle body + label
  $bottle = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(176,104,38))
  $g.FillRectangle($bottle, 60, 40, 780, 560)
  $label = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(250,249,246))
  $g.FillRectangle($label, 110, 90, 680, 460)
  $rule = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(23,50,77)), 3
  $g.DrawRectangle($rule, 110, 90, 680, 460)

  $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(20,30,45))
  $fontHead = New-Object System.Drawing.Font 'Arial', 22, ([System.Drawing.FontStyle]::Bold)
  $fontBig  = New-Object System.Drawing.Font 'Arial', 40, ([System.Drawing.FontStyle]::Bold)
  $fontBody = New-Object System.Drawing.Font 'Arial', 24
  $g.DrawString('DEMO PHARMACY - FICTIONAL SAMPLE', $fontHead, $ink, 140, 108)

  $y = 170
  for ($i = 0; $i -lt $lines.Length; $i++) {
    $f = $fontBody
    if ($i -eq 1) { $f = $fontBig }
    $g.DrawString($lines[$i], $f, $ink, 140, $y)
    if ($i -eq 1) { $y += 78 } else { $y += 52 }
  }
  $g.Dispose()

  if ($degrade) {
    # Heavy blur + wash-out + noise so no text is legible.
    $small = New-Object System.Drawing.Bitmap 45, 32
    $g2 = [System.Drawing.Graphics]::FromImage($small)
    $g2.InterpolationMode = 'HighQualityBicubic'
    $g2.DrawImage($bmp, 0, 0, 45, 32)
    $g2.Dispose()
    $bmp.Dispose()
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g3 = [System.Drawing.Graphics]::FromImage($bmp)
    $g3.InterpolationMode = 'HighQualityBicubic'
    $g3.DrawImage($small, 0, 0, $w, $h)
    $wash = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(110,235,232,224))
    $g3.FillRectangle($wash, 0, 0, $w, $h)
    $g3.Dispose()
    $rnd = New-Object System.Random 7
    for ($k = 0; $k -lt 9000; $k++) {
      $x = $rnd.Next(0,$w); $yy = $rnd.Next(0,$h); $v = $rnd.Next(120,220)
      $bmp.SetPixel($x, $yy, [System.Drawing.Color]::FromArgb($v,$v,$v))
    }
  }

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Photo 'sample-metformin-label.png' @('Patient: MEI LING TAN', 'METFORMIN 500 mg', 'Form: tablet', 'Qty: 60   Demo Rx - not real') $false
New-Photo 'sample-different-medicine-label.png' @('Patient: MEI LING TAN', 'AMOXICILLIN 500 mg', 'Form: capsule', 'Qty: 21   Demo Rx - not real') $false
New-Photo 'sample-blurry-label.png' @('Patient: MEI LING TAN', 'METFORMIN 500 mg', 'Form: tablet', 'Qty: 60   Demo Rx - not real') $true
Write-Output "Wrote sample labels to $out"
