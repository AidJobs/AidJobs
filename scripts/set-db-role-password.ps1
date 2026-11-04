<#
.SYNOPSIS
Makes a new password for aidjobs_app or aidjobs_readonly (security plan, stage 6) and prepares
the statement that sets it in Supabase. Prints nothing secret. Run it in your own terminal.

.DESCRIPTION
1. Makes a random 40-character password of letters and digits.
2. Asks for the Session pooler connection string from Supabase's Connect dialog, as Supabase
   shows it, with [YOUR-PASSWORD] in it (never a real password), and builds the role's own
   connection string from it (user <role>.<project-ref>, the same host, port 5432).
3. Stores that connection string in the SecretStore vault: AIDJOBS_READONLY_DB_URL for the
   read-only login; AIDJOBS_APP_DB_URL for the application's, kept only until it is pasted
   into Render's SUPABASE_DB_URL, then removed (Remove-Secret AIDJOBS_APP_DB_URL).
4. Puts on the clipboard the ALTER ROLE statement with the password's SCRAM-SHA-256 verifier
   (apps/backend/scripts/db_role_password.py), for Supabase's SQL editor. The plain password
   never goes there.

-UseStoredPassword makes the statement again from the password already in the vault, if the
SQL editor step has to be repeated, without making a new one.

.EXAMPLE
& .\scripts\set-db-role-password.ps1 -Role aidjobs_readonly
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('aidjobs_app', 'aidjobs_readonly')][string]$Role,
    [switch]$UseStoredPassword
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$secretName = if ($Role -eq 'aidjobs_readonly') { 'AIDJOBS_READONLY_DB_URL' } else { 'AIDJOBS_APP_DB_URL' }
$python = Join-Path $repo 'apps\backend\.venv311\Scripts\python.exe'
if (-not (Test-Path $python)) { $python = 'python' }
$helper = Join-Path $repo 'apps\backend\scripts\db_role_password.py'

if (-not (Get-Command Set-Secret -ErrorAction SilentlyContinue)) {
    Write-Host "Set-Secret is not available: install Microsoft.PowerShell.SecretManagement and Microsoft.PowerShell.SecretStore (README, 'Secrets on this machine')."
    exit 2
}

function New-Password([int]$Length = 40) {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $chars = New-Object System.Collections.Generic.List[char]
    $byte = New-Object byte[] 1
    while ($chars.Count -lt $Length) {
        $rng.GetBytes($byte)
        if ($byte[0] -lt 248) { $chars.Add($alphabet[$byte[0] % 62]) }   # 248 = 4 x 62: no bias
    }
    $rng.Dispose()
    -join $chars
}

if ($UseStoredPassword) {
    try { $url = Get-Secret -Name $secretName -AsPlainText -ErrorAction Stop } catch {
        Write-Host "$secretName is not in the vault; run this without -UseStoredPassword."
        exit 2
    }
    $password = ([Uri]$url).UserInfo.Split(':', 2)[1]
    $url = $null
} else {
    $template = Read-Host "Paste the Session pooler connection string from Supabase's Connect dialog (with [YOUR-PASSWORD] in it)"
    $pattern = '^postgres(?:ql)?://postgres\.([a-z0-9]+):\[YOUR-PASSWORD\]@([A-Za-z0-9.-]+\.pooler\.supabase\.com):5432/postgres$'
    $match = [regex]::Match($template.Trim(), $pattern)
    if (-not $match.Success) {
        Write-Host "refused: that is not the Session pooler string with [YOUR-PASSWORD] (port 5432). Nothing was stored."
        exit 2
    }
    $password = New-Password
    $url = "postgresql://$Role.$($match.Groups[1].Value):$password@$($match.Groups[2].Value):5432/postgres?sslmode=require"
    Set-Secret -Name $secretName -Secret $url
    $url = $null
    Write-Host "Stored the connection string for $Role in the vault as $secretName."
}

$statement = $password | & $python $helper --role $Role
$code = $LASTEXITCODE
$password = $null
if ($code -ne 0 -or -not $statement) {
    Write-Host "The statement could not be made (exit $code)."
    exit 1
}
Set-Clipboard -Value $statement
$statement = $null
Write-Host "The ALTER ROLE statement for $Role is on the clipboard. Paste it into Supabase's SQL editor, run it, then copy something else to clear the clipboard."
