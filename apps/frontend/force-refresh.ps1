# Force refresh script for Windows
Write-Host "Clearing Next.js cache..." -ForegroundColor Yellow
if (Test-Path .next) {
    Remove-Item -Recurse -Force .next
    Write-Host "✓ Cleared .next cache" -ForegroundColor Green
}

Write-Host "Clearing node_modules/.cache..." -ForegroundColor Yellow
if (Test-Path node_modules\.cache) {
    Remove-Item -Recurse -Force node_modules\.cache
    Write-Host "✓ Cleared node_modules cache" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Stop your dev server (Ctrl+C)" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. In browser: Press Ctrl+Shift+R (hard refresh)" -ForegroundColor White
Write-Host "4. Or open DevTools (F12) → Right-click refresh → 'Empty Cache and Hard Reload'" -ForegroundColor White


