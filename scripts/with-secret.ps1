<#
.SYNOPSIS
Runs one command with one secret from the SecretStore vault set as an environment variable of
the same name, for that command only (security plan, stage 6). Prints nothing secret.

Run it from a PowerShell prompt with &, as below. Everything after -- is the command and its
arguments, passed on unchanged (not through "powershell -File": see with-readonly-db.ps1).

.EXAMPLE
& .\scripts\with-secret.ps1 -Name VERCEL_AUTOMATION_BYPASS_SECRET -- node check-preview.mjs
#>
# Not an advanced script: the command's own options (-c, -n, ...) must not be taken for this
# script's parameters, so they arrive in $args.
param([string]$Name)
$ErrorActionPreference = 'Stop'
if (-not $Name -or $Name -cnotmatch '^[A-Z][A-Z0-9_]*$' -or $args.Count -lt 1) {
    Write-Host "usage: with-secret.ps1 -Name SETTING_NAME -- <command> [arguments]"
    exit 2
}
$Command = $args[0]
$Arguments = @($args | Select-Object -Skip 1)

if (-not (Get-Command Get-Secret -ErrorAction SilentlyContinue)) {
    Write-Host "Get-Secret is not available: install Microsoft.PowerShell.SecretManagement and Microsoft.PowerShell.SecretStore (README, 'Secrets on this machine')."
    exit 2
}
try {
    $value = Get-Secret -Name $Name -AsPlainText -ErrorAction Stop
} catch {
    Write-Host "$Name is not in the vault (README, 'Secrets on this machine')."
    exit 2
}
if (-not ($value -is [string]) -or -not $value) {
    $value = $null
    Write-Host "refused: $Name in the vault is empty or not text."
    exit 2
}

$previous = [Environment]::GetEnvironmentVariable($Name, 'Process')
[Environment]::SetEnvironmentVariable($Name, $value, 'Process')
$value = $null
$code = 1
try {
    & $Command @Arguments
    $code = $LASTEXITCODE
} finally {
    [Environment]::SetEnvironmentVariable($Name, $previous, 'Process')
}
exit $code
