<#
.SYNOPSIS
Runs the frontend's dev server with the employer demo's AI chat on: the two Bedrock keys of the mantle-only test user are read
from the SecretStore vault and set for this process and the server only, then put back as they were. Prints nothing secret.

.DESCRIPTION
For the demo/employer branch only (employer-side plan, section 19, "The AI chat in the demo"). The server listens on this computer
only (127.0.0.1), not on the network, because with the keys set its AI route can call Bedrock. Open
http://127.0.0.1:5000/employer-demo and stop the server with Ctrl+C.

.EXAMPLE
& .\scripts\dev-employer-demo-ai.ps1
#>
$ErrorActionPreference = 'Stop'
$names = @('AIDJOBS_BEDROCK_ACCESS_KEY_ID', 'AIDJOBS_BEDROCK_SECRET_ACCESS_KEY')

if (-not (Get-Command Get-Secret -ErrorAction SilentlyContinue)) {
    Write-Host "Get-Secret is not available: install Microsoft.PowerShell.SecretManagement and Microsoft.PowerShell.SecretStore (README, 'Secrets on this machine')."
    exit 2
}
$values = @{}
foreach ($name in $names) {
    try {
        $value = Get-Secret -Name $name -AsPlainText -ErrorAction Stop
    } catch {
        Write-Host "$name is not in the vault (README, 'Secrets on this machine')."
        exit 2
    }
    if (-not ($value -is [string]) -or -not $value) {
        Write-Host "refused: $name in the vault is empty or not text."
        exit 2
    }
    $values[$name] = $value
    $value = $null
}

$previous = @{}
foreach ($name in $names) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
}
$values = $null
$code = 1
Push-Location (Join-Path $PSScriptRoot '..\apps\frontend')
try {
    & npx next dev -p 5000 -H 127.0.0.1
    $code = $LASTEXITCODE
} finally {
    Pop-Location
    foreach ($name in $names) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}
exit $code
