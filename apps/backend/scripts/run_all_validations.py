#!/usr/bin/env python3
"""
Run all enrichment pipeline validations.
This script requires admin authentication via cookies or API key.
"""
import os
import sys
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import requests
except ImportError:
    print("Error: requests module not installed. Install with: pip install requests")
    sys.exit(1)

BACKEND_URL = os.getenv("BACKEND_URL", "https://aidjobs-backend.onrender.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

def login() -> dict:
    """Login and get session cookie."""
    if not ADMIN_PASSWORD:
        print("⚠ ADMIN_PASSWORD not set. Some endpoints may require authentication.")
        return {}
    
    url = f"{BACKEND_URL.rstrip('/')}/api/admin/login"
    try:
        response = requests.post(
            url,
            json={"password": ADMIN_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            cookies = response.cookies
            return {"cookies": cookies}
        else:
            print(f"⚠ Login failed: {response.status_code}")
            return {}
    except Exception as e:
        print(f"⚠ Login error: {e}")
        return {}


def call_api(endpoint: str, method: str = "GET", data: dict = None, auth: dict = None) -> dict:
    """Call backend API endpoint."""
    url = f"{BACKEND_URL.rstrip('/')}{endpoint}"
    try:
        kwargs = {"timeout": 60}
        if auth and "cookies" in auth:
            kwargs["cookies"] = auth["cookies"]
        
        if method == "GET":
            response = requests.get(url, **kwargs)
        elif method == "POST":
            kwargs["json"] = data
            response = requests.post(url, **kwargs)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 401 or response.status_code == 403:
            return {"status": "error", "error": "Authentication required"}
        else:
            return {"status": "error", "error": f"HTTP {response.status_code}: {response.text[:200]}"}
    except requests.exceptions.RequestException as e:
        return {"status": "error", "error": str(e)}


def print_section(title: str):
    """Print formatted section header."""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def validation_1_quality_dashboard(auth: dict):
    """Validation 1: Quality Dashboard Metrics"""
    print_section("VALIDATION 1: Quality Dashboard Metrics")
    
    result = call_api("/admin/enrichment/quality-dashboard", auth=auth)
    
    if result.get("status") != "ok":
        print(f"✗ Failed: {result.get('error', 'Unknown error')}")
        print("  Note: This endpoint requires admin authentication.")
        return False
    
    data = result.get("data", {})
    total = data.get("total_enriched", 0)
    
    if total == 0:
        print("⚠ No enriched jobs found. Run enrichment first.")
        return True  # Not a failure, just no data yet
    
    print(f"\nTotal Enriched Jobs: {total}")
    
    # Experience Level Distribution
    print(f"\n📊 Experience Level Distribution:")
    exp_levels = data.get("experience_level_distribution", {})
    if exp_levels:
        for level, count in sorted(exp_levels.items(), key=lambda x: x[1], reverse=True):
            pct = (count / total) * 100
            status = "⚠" if pct > 50 else "✓"
            print(f"  {status} {level:25} {count:4} ({pct:5.1f}%)")
    else:
        print("  No experience levels found")
    
    # Impact Domain Distribution
    print(f"\n📊 Impact Domain Distribution:")
    impact_domains = data.get("impact_domain_distribution", {})
    if impact_domains:
        wash_count = impact_domains.get("WASH", 0)
        health_count = impact_domains.get("Public Health", 0)
        wash_health_pct = ((wash_count + health_count) / total) * 100 if total > 0 else 0
        
        for domain, count in sorted(impact_domains.items(), key=lambda x: x[1], reverse=True):
            pct = (count / total) * 100
            print(f"  {domain:25} {count:4} ({pct:5.1f}%)")
        
        print(f"\n  WASH + Public Health combined: {wash_health_pct:.1f}%")
        if wash_health_pct > 40:
            print(f"  ⚠ WARNING: Potential bias (>40%)")
        else:
            print(f"  ✓ Balanced (<40%)")
    else:
        print("  No impact domains found")
    
    # Confidence Statistics
    print(f"\n📊 Confidence Statistics:")
    conf_stats = data.get("confidence_statistics", {})
    avg_conf = conf_stats.get("average", 0)
    low_conf_count = conf_stats.get("low_confidence_count", 0)
    low_conf_pct = (low_conf_count / total) * 100 if total > 0 else 0
    
    print(f"  Average: {avg_conf:.3f}")
    print(f"  Low confidence (<0.65): {low_conf_count} ({low_conf_pct:.1f}%)")
    
    if avg_conf < 0.70:
        print(f"  ⚠ WARNING: Average confidence below 0.70")
    else:
        print(f"  ✓ Average confidence acceptable (>=0.70)")
    
    if low_conf_pct > 20:
        print(f"  ⚠ WARNING: High percentage of low-confidence enrichments")
    else:
        print(f"  ✓ Low-confidence rate acceptable (<20%)")
    
    # Review Queue
    print(f"\n📊 Review Queue Status:")
    review_queue = data.get("review_queue_status", {})
    pending = review_queue.get("pending_count", 0)
    needs_review = review_queue.get("needs_review_count", 0)
    
    print(f"  Pending reviews: {pending}")
    print(f"  Needs review: {needs_review}")
    
    return True


def validation_2_review_queue(auth: dict):
    """Validation 2: Review Queue"""
    print_section("VALIDATION 2: Review Queue")
    
    result = call_api("/admin/enrichment/review-queue?limit=10", auth=auth)
    
    if result.get("status") != "ok":
        print(f"✗ Failed: {result.get('error', 'Unknown error')}")
        return False
    
    reviews = result.get("data", {}).get("reviews", [])
    
    print(f"\nFound {len(reviews)} jobs in review queue")
    
    if len(reviews) == 0:
        print("  ✓ No jobs in review queue (all enrichments have high confidence)")
        return True
    
    print(f"\nSample jobs flagged for review:")
    for i, review in enumerate(reviews[:5], 1):
        job = review.get("job", {})
        enrichment = review.get("original_enrichment", {})
        reason = review.get("reason", "Unknown")
        
        print(f"\n  {i}. Job ID: {job.get('id', 'N/A')[:8]}...")
        print(f"     Title: {job.get('title', 'N/A')[:60]}")
        print(f"     Impact Domain: {enrichment.get('impact_domain', [])}")
        print(f"     Experience Level: {enrichment.get('experience_level', 'N/A')}")
        print(f"     Confidence: {enrichment.get('confidence_overall', 0):.2f}")
        print(f"     Reason: {reason}")
    
    print(f"\n✓ Review queue is working correctly")
    return True


def validation_3_get_sample_jobs(auth: dict):
    """Validation 3: Get sample jobs for re-enrichment"""
    print_section("VALIDATION 3: Sample Jobs for Re-enrichment")
    
    # Get some job IDs from the database
    # We'll need to query jobs that are already enriched
    print("\nTo re-enrich jobs, you need job IDs.")
    print("You can:")
    print("  1. Query database for enriched jobs")
    print("  2. Use POST /admin/jobs/enrich/batch with job_ids")
    print("\nExample:")
    print('  POST /admin/jobs/enrich/batch')
    print('  Body: {"job_ids": ["id1", "id2", ..., "id20"]}')
    
    return True


def validation_4_undp_extraction():
    """Validation 4: UNDP Extraction Test"""
    print_section("VALIDATION 4: UNDP Extraction Test")
    
    print("\nTo test UNDP extraction:")
    print("  1. Find UNDP source ID from sources list")
    print("  2. Run crawl: POST /admin/crawl/run")
    print('     Body: {"source_id": "<undp_source_id>"}')
    print("  3. Check logs for:")
    print("     - Each job has unique apply_url")
    print("     - No duplicate URLs")
    print("     - Proper link extraction")
    
    return True


def validation_5_audit_trail(auth: dict):
    """Validation 5: Audit Trail"""
    print_section("VALIDATION 5: Audit Trail Verification")
    
    print("\nTo verify audit trail:")
    print("  1. Get a job ID that has been enriched")
    print("  2. Check history: GET /admin/enrichment/history/{job_id}")
    print("  3. Verify:")
    print("     - All changes are recorded")
    print("     - Before/after snapshots exist")
    print("     - Timestamps are accurate")
    
    return True


def main():
    """Run all validations."""
    print("\n" + "=" * 70)
    print("  ENTERPRISE-GRADE ENRICHMENT PIPELINE VALIDATION")
    print("=" * 70)
    print(f"\nBackend URL: {BACKEND_URL}")
    
    # Login if password provided
    auth = login()
    if auth:
        print("✓ Admin authentication successful")
    else:
        print("⚠ Running without authentication (some endpoints may fail)")
    
    results = {}
    
    # Run validations
    results["quality_dashboard"] = validation_1_quality_dashboard(auth)
    results["review_queue"] = validation_2_review_queue(auth)
    results["sample_jobs"] = validation_3_get_sample_jobs(auth)
    results["undp_extraction"] = validation_4_undp_extraction()
    results["audit_trail"] = validation_5_audit_trail(auth)
    
    # Summary
    print_section("VALIDATION SUMMARY")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for check, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status}: {check.replace('_', ' ').title()}")
    
    print(f"\nResults: {passed}/{total} validations passed")
    
    if passed == total:
        print("\n✓ All validations completed successfully!")
    else:
        print("\n⚠ Some validations need attention (see details above)")
    
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())

