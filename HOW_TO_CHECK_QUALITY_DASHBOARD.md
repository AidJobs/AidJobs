# How to Check Quality Dashboard

## Step-by-Step Guide

### Step 1: Get Admin Authentication

You need to login first to get a session cookie.

#### Option A: Using curl (Command Line)

```bash
# Login and save the session cookie
curl -X POST https://aidjobs-backend.onrender.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "<YOUR_ADMIN_PASSWORD>"}' \
  -c cookies.txt

# The session cookie will be saved in cookies.txt
```

#### Option B: Using PowerShell (Windows)

```powershell
# Login
$loginBody = @{
    password = "<YOUR_ADMIN_PASSWORD>"
} | ConvertTo-Json

$loginResponse = Invoke-WebRequest -Uri "https://aidjobs-backend.onrender.com/api/admin/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody `
    -SessionVariable session

# Session cookie is now in $session.Cookies
```

#### Option C: Using Browser Developer Tools

1. Open your browser and go to: `https://aidjobs-backend.onrender.com/api/admin/login`
2. Open Developer Tools (F12)
3. Go to Network tab
4. In Console, run:
```javascript
fetch('https://aidjobs-backend.onrender.com/api/admin/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({password: '<YOUR_ADMIN_PASSWORD>'})
})
.then(r => r.json())
.then(console.log)
```
5. Check the Response - you'll get a session cookie

### Step 2: Check Quality Dashboard

#### Option A: Using curl (with saved cookie)

```bash
# Use the saved cookie from Step 1
curl -X GET https://aidjobs-backend.onrender.com/api/admin/enrichment/quality-dashboard \
  -b cookies.txt
```

#### Option B: Using PowerShell

```powershell
# Use the session from Step 1
$response = Invoke-WebRequest -Uri "https://aidjobs-backend.onrender.com/api/admin/enrichment/quality-dashboard" `
    -Method GET `
    -WebSession $session

$json = $response.Content | ConvertFrom-Json

# Display results
Write-Host "Total Enriched Jobs: $($json.data.total_enriched)"
Write-Host "`nExperience Level Distribution:"
$json.data.experience_level_distribution.PSObject.Properties | Sort-Object {$_.Value} -Descending | ForEach-Object {
    $pct = [math]::Round(($_.Value / $json.data.total_enriched) * 100, 1)
    Write-Host "  $($_.Name): $($_.Value) ($pct%)"
}
Write-Host "`nImpact Domain Distribution:"
$json.data.impact_domain_distribution.PSObject.Properties | Sort-Object {$_.Value} -Descending | ForEach-Object {
    $pct = [math]::Round(($_.Value / $json.data.total_enriched) * 100, 1)
    Write-Host "  $($_.Name): $($_.Value) ($pct%)"
}
Write-Host "`nConfidence Statistics:"
Write-Host "  Average: $([math]::Round($json.data.confidence_statistics.average, 3))"
Write-Host "  Low confidence: $($json.data.confidence_statistics.low_confidence_count)"
Write-Host "`nReview Queue:"
Write-Host "  Pending: $($json.data.review_queue_status.pending_count)"
```

#### Option C: Using Browser

1. After logging in (Step 1), the session cookie is stored in your browser
2. Go to: `https://aidjobs-backend.onrender.com/api/admin/enrichment/quality-dashboard`
3. The JSON response will be displayed

### Step 3: Interpret the Results

#### What to Look For:

1. **Experience Level Distribution**
   - ✅ Good: Balanced distribution (no single level >50%)
   - ⚠️ Warning: One level >50% (potential bias)

2. **Impact Domain Distribution**
   - ✅ Good: WASH + Public Health <40% combined
   - ⚠️ Warning: WASH + Public Health >40% (potential bias)

3. **Confidence Statistics**
   - ✅ Good: Average confidence >0.70
   - ⚠️ Warning: Average confidence <0.70

4. **Low Confidence Rate**
   - ✅ Good: Low confidence jobs <20%
   - ⚠️ Warning: Low confidence jobs >20%

5. **Review Queue**
   - Check how many jobs are flagged for review
   - Should be reasonable (not all jobs)

### Example Response

```json
{
  "status": "ok",
  "data": {
    "total_enriched": 150,
    "experience_level_distribution": {
      "Entry Level": 30,
      "Mid Level": 45,
      "Senior Level": 50,
      "Director / Executive": 25
    },
    "impact_domain_distribution": {
      "WASH": 20,
      "Public Health": 15,
      "Education": 25,
      "Finance": 30,
      "Other": 60
    },
    "confidence_statistics": {
      "average": 0.75,
      "min": 0.45,
      "max": 0.95,
      "low_confidence_count": 15
    },
    "review_queue_status": {
      "pending_count": 10,
      "needs_review_count": 5
    }
  }
}
```

### Troubleshooting

#### Error: 401 Unauthorized
- **Cause**: Not logged in or session expired
- **Fix**: Login again (Step 1)

#### Error: 403 Forbidden
- **Cause**: Admin password incorrect or endpoint requires dev mode
- **Fix**: Check `AIDJOBS_ENV=dev` is set in Render

#### Error: 404 Not Found
- **Cause**: Endpoint not deployed yet
- **Fix**: Wait for Render deployment to complete

#### Empty Results (total_enriched: 0)
- **Cause**: No jobs have been enriched yet
- **Fix**: Run enrichment first using `POST /admin/jobs/enrich/batch`

### Quick Test Script

Save this as `check_quality_dashboard.ps1`:

```powershell
# Configuration
$backendUrl = "https://aidjobs-backend.onrender.com"
$adminPassword = "<YOUR_ADMIN_PASSWORD>"

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
        $wash = $data.impact_domain_distribution.WASH
        $health = $data.impact_domain_distribution.'Public Health'
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
```

### Usage

1. Edit the script and add your admin password
2. Run: `powershell -ExecutionPolicy Bypass -File check_quality_dashboard.ps1`

## Summary

**Quick Steps:**
1. Login: `POST /api/admin/login` with password
2. Get dashboard: `GET /api/admin/enrichment/quality-dashboard` with session cookie
3. Check results for balanced distribution and confidence scores

**What You're Looking For:**
- Balanced experience level distribution (<50% in any single level)
- Balanced impact domain distribution (WASH+Health <40%)
- Average confidence >0.70
- Low confidence rate <20%

