[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateNotNullOrEmpty()]
  [string]$Description,

  [ValidatePattern("^\d+\.\d+\.\d+$")]
  [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-CommandAvailable {
  param([Parameter(Mandatory)][string]$Name)

  if (-not (Get-Command -Name $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)][string]$Command,
    [Parameter(Mandatory)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "'$Command $($Arguments -join ' ')' failed with exit code $LASTEXITCODE."
  }
}

function Get-CheckedOutput {
  param(
    [Parameter(Mandatory)][string]$Command,
    [Parameter(Mandatory)][string[]]$Arguments
  )

  $output = & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "'$Command $($Arguments -join ' ')' failed with exit code $LASTEXITCODE."
  }
  return ($output -join [Environment]::NewLine).Trim()
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestRelativePath = "custom_components/ha_raiba/manifest.json"
$manifestPath = Join-Path $repoRoot $manifestRelativePath
$scriptRelativePath = "scripts/release.ps1"
$repository = "neo170/ha-raiba"

foreach ($command in "git", "gh") {
  Assert-CommandAvailable $command
}

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Manifest not found: $manifestPath"
}

$description = $Description.Trim()
if (-not $description) {
  throw "Description must contain text."
}

Push-Location $repoRoot
try {
  $branch = Get-CheckedOutput "git" @("branch", "--show-current")
  if ($branch -ne "master") {
    throw "Releases must be created from master, not '$branch'."
  }

  $scriptStatus = Get-CheckedOutput "git" @("status", "--porcelain", "--", $scriptRelativePath)
  $scriptIsUntracked = $scriptStatus.StartsWith("?? ")
  $status = Get-CheckedOutput "git" @("status", "--porcelain", "--untracked-files=all")
  $untrackedFiles = @($status -split "`r?`n" | Where-Object { $_.StartsWith("?? ") -and $_ -ne "?? $scriptRelativePath" })
  if ($untrackedFiles.Count -gt 0) {
    throw "Untracked files must be added or removed before a release:`n$($untrackedFiles -join "`n")"
  }

  Invoke-CheckedCommand "git" @("diff", "--check")
  Invoke-CheckedCommand "git" @("diff", "--cached", "--check")

  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  } catch {
    throw "Unable to parse $manifestRelativePath as JSON: $($_.Exception.Message)"
  }

  $currentVersion = [string]$manifest.version
  if ($currentVersion -notmatch "^\d+\.\d+\.\d+$") {
    throw "Manifest version '$currentVersion' is not a three-part version."
  }

  $currentVersionObject = [Version]$currentVersion
  if ($Version) {
    $newVersion = $Version
  } else {
    $newVersion = "{0}.{1}.{2}" -f $currentVersionObject.Major, $currentVersionObject.Minor, ($currentVersionObject.Build + 1)
  }

  if ([Version]$newVersion -le $currentVersionObject) {
    throw "Release version $newVersion must be greater than the manifest version $currentVersion."
  }

  $tag = "v$newVersion"
  if (-not $PSCmdlet.ShouldProcess($tag, "create and publish release")) {
    return
  }

  Invoke-CheckedCommand "gh" @("auth", "status", "--hostname", "github.com")
  Invoke-CheckedCommand "git" @("fetch", "origin", "master", "--tags")

  $behindAhead = (Get-CheckedOutput "git" @("rev-list", "--left-right", "--count", "origin/master...HEAD")) -split "\s+"
  if ([int]$behindAhead[0] -gt 0) {
    throw "master is behind origin/master. Pull and resolve it before releasing."
  }

  $existingTag = Get-CheckedOutput "git" @("tag", "-l", $tag)
  if ($existingTag) {
    throw "Tag $tag already exists. Choose a different version."
  }

  if ($scriptIsUntracked) {
    Invoke-CheckedCommand "git" @("add", "--", $scriptRelativePath)
  }

  $manifest.version = $newVersion
  $manifestJson = $manifest | ConvertTo-Json -Depth 10
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($manifestPath, $manifestJson + [Environment]::NewLine, $utf8WithoutBom)

  $writtenManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ([string]$writtenManifest.version -ne $newVersion) {
    throw "Manifest version was not written as $newVersion."
  }

  Invoke-CheckedCommand "git" @("add", "-u")
  Invoke-CheckedCommand "git" @("add", "--", $manifestRelativePath)
  Invoke-CheckedCommand "git" @("diff", "--cached", "--check")
  Invoke-CheckedCommand "git" @("commit", "-m", "${tag}: $description")
  Invoke-CheckedCommand "git" @("tag", $tag)
  Invoke-CheckedCommand "git" @("push", "origin", "master")
  Invoke-CheckedCommand "git" @("push", "origin", $tag)
  Invoke-CheckedCommand "gh" @("release", "create", $tag, "--repo", $repository, "--title", $tag, "--notes", $description, "--verify-tag")

  $finalStatus = Get-CheckedOutput "git" @("status", "--porcelain")
  if ($finalStatus) {
    throw "Release $tag was published, but the working tree is not clean:`n$finalStatus"
  }

  Write-Host "Release $tag was published successfully."
} finally {
  Pop-Location
}