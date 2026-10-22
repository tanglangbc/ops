[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$SkillPath
)

$ErrorActionPreference = 'Stop'
$path = (Resolve-Path $SkillPath).Path
$dir = Split-Path -Leaf $path
$skill = Join-Path $path 'SKILL.md'
$readme = Join-Path $path 'README.md'

if (!(Test-Path $skill)) { throw 'Missing SKILL.md' }
if (!(Test-Path $readme)) { throw 'Missing README.md' }

$skillText = Get-Content $skill -Raw
$lines = ($skillText -split "`n").Count
if ($lines -gt 500) { throw "SKILL.md exceeds 500 lines: $lines" }
if ($skillText -notmatch '(?s)^---\s*\r?\n(.*?)\r?\n---\s*\r?\n') { throw 'Missing YAML frontmatter' }
$front = $Matches[1]
if ($front -notmatch '(?m)^name:\s*([^\r\n]+)\s*$') { throw 'Missing name' }
$name = $Matches[1].Trim()
if ($name -ne $dir) { throw "name '$name' does not match directory '$dir'" }
if ($name -notmatch '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$') { throw "Invalid name: $name" }
if ($name -match '--') { throw 'Name contains consecutive hyphens' }
if ($front -notmatch '(?m)^description:\s*') { throw 'Missing description' }
$body = $skillText -replace '(?s)^---.*?---\s*',''
if (($body.Trim()).Length -lt 200) { throw 'SKILL.md body is under 200 characters' }
if ($body -notmatch '(?m)^#{1,6}\s+') { throw 'SKILL.md body has no markdown heading' }

$blocked = @('.exe','.dll','.so','.dylib','.bin','.bat','.cmd','.com','.msi','.app','.dmg','.pkg','.deb','.rpm')
$files = Get-ChildItem -LiteralPath $path -File -Recurse -Force
$total = 0
foreach ($f in $files) {
  $total += $f.Length
  if ($blocked -contains $f.Extension.ToLowerInvariant()) { throw "Blocked file type: $($f.FullName)" }
  if ($f.Name.StartsWith('.') -and $f.Name -ne '.gitignore') { throw "Hidden file not allowed: $($f.FullName)" }
}
if ($total -gt 50MB) { throw "Total package size exceeds 50 MB: $total bytes" }
foreach ($f in $files) {
  if ($f.Length -gt 10MB) { throw "File exceeds 10 MB: $($f.FullName)" }
}

$depthMax = ($files | ForEach-Object {
  $rel = $_.FullName.Substring($path.Length).TrimStart('\','/')
  if (!$rel) { 0 } else { ($rel -split '[\\/]').Count - 1 }
} | Measure-Object -Maximum).Maximum
if ($depthMax -gt 5) { throw "Directory depth exceeds 5: $depthMax" }

Write-Host "Local package preflight PASSED: $path"
