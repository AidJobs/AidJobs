<#
.SYNOPSIS
Puts one secret from the SecretStore vault on the clipboard until you have pasted it, then
clears the clipboard (security plan, stage 6). Never shows the secret. Run it in your own
terminal, from a PowerShell prompt.

.DESCRIPTION
For moving a value into a dashboard, such as AIDJOBS_APP_DB_URL into Render's SUPABASE_DB_URL.
It refuses while Windows' clipboard history (Win+V) or cloud clipboard is on, since either
would keep or send on a copy. After you press Enter, or if the script is stopped, the
clipboard is cleared.

.EXAMPLE
& .\scripts\copy-secret-to-clipboard.ps1 AIDJOBS_APP_DB_URL
#>
param([string]$Name)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'clipboard-guard.ps1')

if (-not $Name -or $Name -cnotmatch '^[A-Z][A-Z0-9_]*$') {
    Write-Host "usage: copy-secret-to-clipboard.ps1 SETTING_NAME"
    exit 2
}
$reasons = @(Test-ClipboardKeepsCopies)
if ($reasons.Count) {
    Write-Host "refused: $($reasons -join '; and '). Turn it off, then run this again."
    exit 2
}
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

try {
    Set-Clipboard -Value $value
    $value = $null
    Write-Host "$Name is on the clipboard. Paste it where it belongs (do not paste it anywhere else), save there, then come back and press Enter."
    $null = Read-Host 'Press Enter once it is pasted'
} finally {
    $value = $null
    Clear-SensitiveClipboard
    Write-Host 'The clipboard is cleared.'
}
