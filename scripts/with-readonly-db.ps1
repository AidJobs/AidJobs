<#
.SYNOPSIS
Runs one command with the read-only database login from the SecretStore vault (security plan,
stage 6). Prints nothing secret.

.DESCRIPTION
Reads AIDJOBS_READONLY_DB_URL from the vault and sets it for this process and the command it
runs, then removes it. With -Libpq it sets PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD and
PGSSLMODE=require instead, for tools such as pg_dump that read those. It refuses a value that
is not a connection string for aidjobs_readonly.

Run it from a PowerShell prompt with &, as below. Everything after -- is the command and its
arguments, passed on unchanged. (Through "powershell -File", Windows PowerShell 5.1 takes a
command's options such as -L for this script's own and the command never sees them.)

.EXAMPLE
& .\scripts\with-readonly-db.ps1 -- apps\backend\.venv311\Scripts\python.exe apps\backend\scripts\db_readonly_check.py

.EXAMPLE
& .\scripts\with-readonly-db.ps1 -Libpq -- pg_dump --schema-only --schema=public --file=schema.sql
#>
# Not an advanced script: the command's own options (-c, -f, --file=...) must not be taken for
# this script's parameters, so they arrive in $args.
param([switch]$Libpq)
$ErrorActionPreference = 'Stop'
$name = 'AIDJOBS_READONLY_DB_URL'
if ($args.Count -lt 1) {
    Write-Host "usage: with-readonly-db.ps1 [-Libpq] -- <command> [arguments]"
    exit 2
}
$Command = $args[0]
$Arguments = @($args | Select-Object -Skip 1)

if (-not (Get-Command Get-Secret -ErrorAction SilentlyContinue)) {
    Write-Host "Get-Secret is not available: install Microsoft.PowerShell.SecretManagement and Microsoft.PowerShell.SecretStore (README, 'Secrets on this machine')."
    exit 2
}
try {
    $value = Get-Secret -Name $name -AsPlainText -ErrorAction Stop
} catch {
    Write-Host "$name is not in the vault (README, 'Secrets on this machine')."
    exit 2
}
$uri = $null
if (-not ($value -is [string]) -or $value -notmatch '^postgres(ql)?://aidjobs_readonly[.:@]' -or
    -not [Uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri) -or -not $uri.Host) {
    $value = $null
    Write-Host "refused: $name is not a connection string for aidjobs_readonly."
    exit 2
}

$set = @{}
if ($Libpq) {
    $user, $password = $uri.UserInfo.Split(':', 2)
    $set['PGHOST'] = $uri.Host
    $set['PGPORT'] = [string]$(if ($uri.Port -gt 0) { $uri.Port } else { 5432 })
    $set['PGDATABASE'] = $uri.AbsolutePath.TrimStart('/')
    $set['PGUSER'] = [Uri]::UnescapeDataString($user)
    $set['PGPASSWORD'] = [Uri]::UnescapeDataString($password)
    $set['PGSSLMODE'] = 'require'
    $user = $null; $password = $null
} else {
    $set[$name] = $value
}
$value = $null; $uri = $null

$previous = @{}
foreach ($key in $set.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $set[$key], 'Process')
}
$set = $null
$code = 1
try {
    & $Command @Arguments
    $code = $LASTEXITCODE
} finally {
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}
exit $code
