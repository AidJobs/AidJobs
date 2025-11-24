# Quality Dashboard Check Script
# Usage: powershell -ExecutionPolicy Bypass -File check_quality_dashboard.ps1

# Configuration
$backendUrl = "https://aidjobs-backend.onrender.com"
$adminPassword = "<YOUR_ADMIN_PASSWORD>"  # Replace with your actual password

# Step 1: Login
Write-Host "Logging in..."
$loginBody = @{
    password = $adminPassword
} | ConvertTo-Json

try {
    $loginResponse = Invoke-WebRequest -Uri "$backendUrl/api/admin/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody `
        -SessionVariable session
    
    Write-Host "✓ Login successful`n"
    
    # Step 2: Get Quality Dashboard
    Write-Host "Fetching quality dashboard..."
    $response = Invoke-WebRequest -Uri "$backendUrl/api/admin/enrichment/quality-dashboard" `
        -Method GET `
        -WebSession $session
    
    $json = $response.Content | ConvertFrom-Json
    
    if ($json.status -eq "ok") {
        $data = $json.data
        Write-Host "`n=========================================="
        Write-Host "  QUALITY DASHBOARD RESULTS"
        Write-Host "==========================================`n"
        
        Write-Host "Total Enriched Jobs: $($data.total_enriched)`n"
        
        Write-Host "Experience Level Distribution:"
        $data.experience_level_distribution.PSObject.Properties | Sort-Object {$_.Value} -Descending | ForEach-Object {
            $pct = if ($data.total_enriched -gt 0) { [math]::Round(($_.Value / $data.total_enriched) * 100, 1) } else { 0 }
            $status = if ($pct -gt 50) { "⚠" } else { "✓" }
            Write-Host "  $status $($_.Name.PadRight(25)) $($_.Value) ($pct%)"
        }
        
        Write-Host "`nImpact Domain Distribution:"
        $wash = if ($data.impact_domain_distribution.WASH) { $data.impact_domain_distribution.WASH } else { 0 }
        $health = if ($data.impact_domain_distribution.'Public Health') { $data.impact_domain_distribution.'Public Health' } else { 0 }
        $washHealthPct = if ($data.total_enriched -gt 0) { [math]::Round((($wash + $health) / $data.total_enriched) * 100, 1) } else { 0 }
        
        $data.impact_domain_distribution.PSObject.Properties | Sort-Object {$_.Value} -Descending | ForEach-Object {
            $pct = if ($data.total_enriched -gt 0) { [math]::Round(($_.Value / $data.total_enriched) * 100, 1) } else { 0 }
            Write-Host "  $($_.Name.PadRight(25)) $($_.Value) ($pct%)"
        }
        
        Write-Host "`n  WASH + Public Health: $washHealthPct%"
        if ($washHealthPct -gt 40) {
            Write-Host "  ⚠ WARNING: Potential bias (>40%)"
        } else {
            Write-Host "  ✓ Balanced (<40%)"
        }
        
        Write-Host "`nConfidence Statistics:"
        Write-Host "  Average: $([math]::Round($data.confidence_statistics.average, 3))"
        $avgStatus = if ($data.confidence_statistics.average -ge 0.70) { "✓" } else { "⚠" }
        Write-Host "  $avgStatus Average confidence acceptable (>=0.70)"
        
        Write-Host "  Low confidence (<0.65): $($data.confidence_statistics.low_confidence_count)"
        $lowConfPct = if ($data.total_enriched -gt 0) { [math]::Round(($data.confidence_statistics.low_confidence_count / $data.total_enriched) * 100, 1) } else { 0 }
        Write-Host "  Low confidence rate: $lowConfPct%"
        if ($lowConfPct -gt 20) {
            Write-Host "  ⚠ WARNING: High percentage of low-confidence enrichments"
        } else {
            Write-Host "  ✓ Low-confidence rate acceptable (<20%)"
        }
        
        Write-Host "`nReview Queue:"
        Write-Host "  Pending reviews: $($data.review_queue_status.pending_count)"
        Write-Host "  Needs review: $($data.review_queue_status.needs_review_count)"
        
        Write-Host "`n=========================================="
        Write-Host "✓ Quality dashboard check complete"
        Write-Host "=========================================="
    } else {
        Write-Host "✗ Error: $($json.error)"
    }
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)"
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "  → Authentication failed. Check your admin password."
    } elseif ($_.Exception.Response.StatusCode -eq 403) {
        Write-Host "  → Access denied. Check AIDJOBS_ENV=dev is set."
    } elseif ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "  → Endpoint not found. Wait for deployment."
    }
}

