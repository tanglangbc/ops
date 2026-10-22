[CmdletBinding()]
param(
  [switch]$SkipCliInstall,
  [switch]$NoNetwork
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$report = Join-Path $root 'ops\environment-report.md'

function Write-Section([string]$Title) {
  Add-Content -Path $report -Value "`n## $Title"
}

Set-Content -Path $report -Value "# Environment Report`n`nGenerated: $(Get-Date -Format s)"
Write-Section 'Project'
Add-Content $report "Root: $root"
Add-Content $report "PowerShell: $($PSVersionTable.PSVersion)"
Add-Content $report "OS: $([System.Environment]::OSVersion.VersionString)"

foreach ($cmd in @('node','npm','git')) {
  Write-Section $cmd
  $g = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($g) {
    Add-Content $report "Path: $($g.Source)"
    try { Add-Content $report "Version: $(& $cmd --version 2>&1 | Select-Object -First 1)" } catch { Add-Content $report 'Version: unavailable' }
  } else {
    Add-Content $report 'Status: NOT FOUND'
  }
}

Write-Section 'SkillHQ CLI'
$skillhq = Get-Command skillhq -ErrorAction SilentlyContinue
if (-not $skillhq -and -not $SkipCliInstall -and -not $NoNetwork) {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm install -g @skill-hq/cli
    $skillhq = Get-Command skillhq -ErrorAction SilentlyContinue
  }
}
if ($skillhq) {
  Add-Content $report "Path: $($skillhq.Source)"
  try { Add-Content $report "Help check: $(& skillhq --help 2>&1 | Select-Object -First 5 | Out-String)" } catch { Add-Content $report 'Help check failed' }
  try { Add-Content $report "Auth status: $(& skillhq auth status 2>&1 | Select-Object -First 10 | Out-String)" } catch { Add-Content $report 'Auth status unavailable' }
} else {
  Add-Content $report 'Status: NOT FOUND'
}

Write-Section 'Safety'
Add-Content $report 'This preflight is diagnostic only. It does not modify Windows permissions or project files except this report.'
Write-Host "Environment report written to $report"
