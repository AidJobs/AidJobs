# Shared by the scripts that put something sensitive on the clipboard (security plan, stage 6).
# Dot-source it: . (Join-Path $PSScriptRoot 'clipboard-guard.ps1')

function Test-ClipboardKeepsCopies {
    <# Why the clipboard would keep or send on what is copied, or nothing when it would not:
       Windows' clipboard history (Win+V) or its cloud clipboard (sync across devices). #>
    $user = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Clipboard' -ErrorAction SilentlyContinue
    $policy = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -ErrorAction SilentlyContinue
    $reasons = @()
    $historyAllowed = -not ($policy -and $null -ne $policy.AllowClipboardHistory -and $policy.AllowClipboardHistory -eq 0)
    if ($historyAllowed -and $user -and $user.EnableClipboardHistory -eq 1) {
        $reasons += 'clipboard history is on (Settings, System, Clipboard, "Clipboard history")'
    }
    $cloudAllowed = -not ($policy -and $null -ne $policy.AllowCrossDeviceClipboard -and $policy.AllowCrossDeviceClipboard -eq 0)
    if ($cloudAllowed -and $user -and ($user.EnableCloudClipboard -eq 1 -or $user.CloudClipboardAutomaticUpload -eq 1)) {
        $reasons += 'the cloud clipboard is on (Settings, System, Clipboard, "Sync across your devices")'
    }
    $reasons
}

function Clear-SensitiveClipboard {
    Set-Clipboard -Value ' '
}
