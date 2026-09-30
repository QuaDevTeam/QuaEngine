param([int]$ParentPid, [string]$InstallRoot, [string]$Replacement, [string]$Backup, [string]$Executable, [string]$StatusFile, [string]$ReadyFile, [string]$UserDataDirectory, [string]$Token, [string]$Version, [string]$StartedFile, [string]$NoSandbox)
$ErrorActionPreference = 'Stop'
function Start-Editor {
  $launchArguments = @()
  if ($UserDataDirectory) {
    # Windows paths cannot contain quotes; quote the entire argument for spaces.
    $launchArguments += ('"--user-data-dir=' + $UserDataDirectory.TrimEnd('\') + '"')
  }
  if ($NoSandbox -eq '1') { $launchArguments += '--no-sandbox' }
  if ($launchArguments.Count) { return Start-Process -FilePath $Executable -ArgumentList $launchArguments -PassThru }
  return Start-Process -FilePath $Executable -PassThru
}
Set-Content -LiteralPath $ReadyFile -Value 'ready'
$moved = $false
$replaced = $false
try {
  $parentProcess = Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
  if ($parentProcess -and !$parentProcess.WaitForExit(120000)) { throw 'Editor did not exit; installation unchanged' }
  # Windows can briefly retain handles after exit. Retry before modifying the installation.
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { Move-Item -LiteralPath $InstallRoot -Destination $Backup; $moved = $true; break }
    catch { if ($attempt -eq 29) { throw }; Start-Sleep -Seconds 1 }
  }
  Move-Item -LiteralPath $Replacement -Destination $InstallRoot
  $replaced = $true
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  $newProcess = Start-Editor
  if ($Token) {
    $healthy = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      if ($newProcess.HasExited) { break }
      if (Test-Path -LiteralPath $StartedFile) {
        $started = (Get-Content -LiteralPath $StartedFile -Raw).Trim()
        if ($started -eq "$Token $Version $($newProcess.Id)") { $healthy = $true; break }
      }
      Start-Sleep -Seconds 1
    }
    if (!$healthy) { throw 'New application did not become ready' }
  } elseif ($newProcess.WaitForExit(2000)) { throw 'New application exited during startup' }
  Set-Content -LiteralPath $StatusFile -Value 'installed'
} catch {
  $failure = $_.Exception.Message
  if ($newProcess -and !$newProcess.HasExited) {
    Stop-Process -Id $newProcess.Id -Force
    $newProcess.WaitForExit()
  }
  Remove-Item Env:QUA_EDITOR_UPDATE_TOKEN -ErrorAction SilentlyContinue
  if ($moved) {
    if ($replaced) { Move-Item -LiteralPath $InstallRoot -Destination $Replacement }
    Move-Item -LiteralPath $Backup -Destination $InstallRoot
    Start-Editor | Out-Null
  }
  Set-Content -LiteralPath $StatusFile -Value ('error: ' + $failure)
  exit 1
}
