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

  $arguments = @("/x", $productCode)
  if ($Quiet) {
    $arguments += @("/qn", "/norestart")
  } else {
    $arguments += @("/passive", "/norestart")
  }

  Write-Host "Uninstalling OpenCode Private ($productCode)..."
  $process = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Wait -PassThru
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

# v2 keeps a background server running; stop it before files are removed.
Get-Process -Name "opencode", "opencode-private" -ErrorAction SilentlyContinue | Stop-Process -Force

$install = Get-OpenCodePrivateInstall
if ($install) {
  Invoke-MsiUninstall $install
} else {
  Write-Host "OpenCode Private MSI install not found."
}

Remove-PathIfExists (Join-Path $env:LOCALAPPDATA "OpenCode Private") "install directory"

# OpenCode resolves XDG-style directories under the profile on Windows as well.
$profileRoot = $env:USERPROFILE
if (!$KeepConfig) {
  Remove-PathIfExists (Join-Path $profileRoot ".config\opencode") "config directory"
  # Left behind by the v1 installer, which seeded a single file beside the directory.
  Remove-PathIfExists (Join-Path $profileRoot ".config\opencode.json") "v1 config file"
}

if (!$KeepData) {
  Remove-PathIfExists (Join-Path $profileRoot ".local\share\opencode") "data directory"
  Remove-PathIfExists (Join-Path $profileRoot ".local\state\opencode") "state directory"
  Remove-PathIfExists (Join-Path $profileRoot ".cache\opencode") "cache directory"
  Remove-PathIfExists (Join-Path $env:LOCALAPPDATA "opencode-private") "v1 private local app data"
}

Write-Host "OpenCode Private uninstall complete."
