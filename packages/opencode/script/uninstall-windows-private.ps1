param(
  [switch]$Quiet,
  [switch]$KeepConfig,
  [switch]$KeepData
)

$ErrorActionPreference = "Stop"

function Get-OpenCodePrivateInstall {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue |
    Where-Object {
      $_.DisplayName -eq "OpenCode Private" -and
      ($_.Publisher -eq "GreenHatx" -or $_.PSChildName -match "^\{[0-9A-Fa-f-]+\}$")
    } |
    Select-Object -First 1
}

function Invoke-MsiUninstall($install) {
  $productCode = $install.PSChildName
  if ($productCode -notmatch "^\{[0-9A-Fa-f-]+\}$") {
    if ($install.UninstallString -match "\{[0-9A-Fa-f-]+\}") {
      $productCode = $Matches[0]
    } else {
      throw "Could not find MSI product code for OpenCode Private."
    }
  }

  $args = @("/x", $productCode)
  if ($Quiet) {
    $args += @("/qn", "/norestart")
  } else {
    $args += @("/passive", "/norestart")
  }

  Write-Host "Uninstalling OpenCode Private ($productCode)..."
  $process = Start-Process -FilePath "msiexec.exe" -ArgumentList $args -Wait -PassThru
  if ($process.ExitCode -ne 0 -and $process.ExitCode -ne 3010) {
    throw "msiexec failed with exit code $($process.ExitCode)."
  }
}

function Remove-PathIfExists($path, $label) {
  if (!(Test-Path -LiteralPath $path)) {
    return
  }

  Write-Host "Removing $label`: $path"
  Remove-Item -LiteralPath $path -Recurse -Force
}

$install = Get-OpenCodePrivateInstall
if ($install) {
  Get-Process -Name "opencode-private", "opencode" -ErrorAction SilentlyContinue | Stop-Process -Force
  Invoke-MsiUninstall $install
} else {
  Write-Host "OpenCode Private MSI install not found."
}

Remove-PathIfExists (Join-Path $env:LOCALAPPDATA "OpenCode Private") "install directory"

if (!$KeepConfig) {
  Remove-PathIfExists (Join-Path $env:USERPROFILE ".config\opencode.json") "config file"
  Remove-PathIfExists (Join-Path $env:USERPROFILE ".config\opencode") "config directory"
}

if (!$KeepData) {
  Remove-PathIfExists (Join-Path $env:APPDATA "opencode") "app data"
  Remove-PathIfExists (Join-Path $env:LOCALAPPDATA "opencode") "local app data"
  Remove-PathIfExists (Join-Path $env:LOCALAPPDATA "opencode-private") "private local app data"
}

Write-Host "OpenCode Private uninstall complete."
