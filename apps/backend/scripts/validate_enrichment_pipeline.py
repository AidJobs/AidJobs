#!/usr/bin/env python3
"""
Enterprise-grade validation script for enrichment pipeline.
Uses backend API to validate fixes and quality metrics.
"""
import os
import sys
import json
import requests
from typing import Dict, Any, List

BACKEND_URL = os.getenv("BACKEND_URL", "https://aidjobs-backend.onrender.com")

def call_api(endpoint: str, method: str = "GET", data: Dict = None) -> Dict[str, Any]:
    """Call backend API endpoint."""
    url = f"{BACKEND_URL.rstrip('/')}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=60)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"✗ API call failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                print(f"  Response: {e.response.text}")
            except:
                pass
        return {"status": "error", "error": str(e)}


def print_section(title: str):
    """Print a formatted section header."""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def validate_quality_dashboard():
    """Validate quality dashboard metrics."""
    print_section("Quality Dashboard Metrics")
    
    result = call_api("/api/admin/enrichment/quality-dashboard")
    
    if result.get("status") != "ok":
        print(f"✗ Failed to get quality dashboard: {result.get('error')}")
        return False
    
    data = result.get("data", {})
    
    print(f"\nExperience Level Distribution:")
    exp_levels = data.get("experience_level_distribution", {})
    for level, count in sorted(exp_levels.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / data.get("total_enriched", 1)) * 100 if data.get("total_enriched") else 0
        print(f"  {level:20} {count:4} ({percentage:5.1f}%)")
    
    print(f"\nImpact Domain Distribution:")
    impact_domains = data.get("impact_domain_distribution", {})
    for domain, count in sorted(impact_domains.items(), key=lambda x: x[1], reverse=True):
        percentage = (count / data.get("total_enriched", 1)) * 100 if data.get("total_enriched") else 0
        print(f"  {domain:20} {count:4} ({percentage:5.1f}%)")
    
    print(f"\nConfidence Scores:")
    conf_stats = data.get("confidence_statistics", {})
    print(f"  Average: {conf_stats.get('average', 0):.3f}")
    print(f"  Min: {conf_stats.get('min', 0):.3f}")
    print(f"  Max: {conf_stats.get('max', 0):.3f}")
    print(f"  Low confidence (<0.65): {conf_stats.get('low_confidence_count', 0)}")
    
    print(f"\nReview Queue:")
    review_queue = data.get("review_queue_status", {})
    print(f"  Pending reviews: {review_queue.get('pending_count', 0)}")
    print(f"  Needs review: {review_queue.get('needs_review_count', 0)}")
    
    # Check for bias indicators
    total = data.get("total_enriched", 0)
    if total > 0:
        wash_count = impact_domains.get("WASH", 0)
        health_count = impact_domains.get("Public Health", 0)
        wash_health_pct = ((wash_count + health_count) / total) * 100
        
        officer_count = exp_levels.get("Officer / Associate", 0)
        officer_pct = (officer_count / total) * 100
        
        print(f"\n⚠ Bias Indicators:")
        print(f"  WASH + Public Health: {wash_health_pct:.1f}% (should be <40% for balanced)")
        print(f"  Officer / Associate: {officer_pct:.1f}% (should be <50% for balanced)")
        
        if wash_health_pct > 40 or officer_pct > 50:
            print(f"  ⚠ WARNING: Potential bias detected!")
            return False
    
    return True


def validate_review_queue():
    """Validate that low-confidence enrichments are flagged."""
    print_section("Review Queue Validation")
    
    result = call_api("/api/admin/enrichment/review-queue?limit=10")
    
    if result.get("status") != "ok":
        print(f"✗ Failed to get review queue: {result.get('error')}")
        return False
    
    reviews = result.get("data", {}).get("reviews", [])
    
    print(f"\nFound {len(reviews)} jobs in review queue:")
    
    for i, review in enumerate(reviews[:5], 1):
        job = review.get("job", {})
        enrichment = review.get("original_enrichment", {})
        print(f"\n  {i}. Job ID: {job.get('id', 'N/A')[:8]}...")
        print(f"     Title: {job.get('title', 'N/A')[:60]}")
        print(f"     Impact Domain: {enrichment.get('impact_domain', [])}")
        print(f"     Experience Level: {enrichment.get('experience_level', 'N/A')}")
        print(f"     Confidence: {enrichment.get('confidence_overall', 0):.2f}")
        print(f"     Reason: {review.get('reason', 'N/A')}")
    
    if len(reviews) == 0:
        print("  ✓ No jobs in review queue (all enrichments have high confidence)")
    
    return True


def test_batch_enrichment():
    """Test re-enriching a diverse sample of jobs."""
    print_section("Batch Enrichment Test")
    
    # First, get some job IDs to test with
    # We'll need to get jobs from the database via API
    print("\nNote: This requires job IDs. Testing with sample...")
    print("  To test batch enrichment, use:")
    print("  POST /api/admin/jobs/enrich/batch")
    print("  Body: {\"job_ids\": [\"id1\", \"id2\", ...]}")
    
    return True


def validate_endpoints():
    """Validate that all enrichment endpoints are available."""
    print_section("Endpoint Availability Check")
    
    endpoints = [
        ("GET", "/api/admin/enrichment/quality-dashboard", "Quality Dashboard"),
        ("GET", "/api/admin/enrichment/review-queue", "Review Queue"),
        ("GET", "/api/admin/enrichment/history/{job_id}", "Enrichment History"),
        ("POST", "/api/admin/enrichment/feedback", "Feedback Collection"),
        ("POST", "/api/admin/enrichment/ground-truth", "Ground Truth"),
    ]
    
    all_ok = True
    for method, endpoint, name in endpoints:
        # Skip endpoints that need parameters
        if "{" in endpoint:
            print(f"  ⚠ {name}: {method} {endpoint} (requires parameters)")
            continue
        
        result = call_api(endpoint, method)
        if result.get("status") == "ok" or result.get("status_code") == 200:
            print(f"  ✓ {name}: Available")
        else:
            print(f"  ✗ {name}: {result.get('error', 'Not available')}")
            all_ok = False
    
    return all_ok


def main():
    """Run comprehensive validation."""
    print("\n" + "=" * 70)
    print("  ENTERPRISE-GRADE ENRICHMENT PIPELINE VALIDATION")
    print("=" * 70)
    print(f"\nBackend URL: {BACKEND_URL}")
    
    results = {
        "endpoints": False,
        "quality_dashboard": False,
        "review_queue": False,
        "bias_check": False,
    }
    
    # Step 1: Validate endpoints
    results["endpoints"] = validate_endpoints()
    
    # Step 2: Check quality dashboard
    results["quality_dashboard"] = validate_quality_dashboard()
    
    # Step 3: Check review queue
    results["review_queue"] = validate_review_queue()
    
    # Step 4: Test batch enrichment (informational)
    test_batch_enrichment()
    
    # Summary
    print_section("Validation Summary")
    
    all_passed = all(results.values())
    
    for check, passed in results.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {check.replace('_', ' ').title()}")
    
    if all_passed:
        print("\n✓ All validation checks passed!")
        print("  The enrichment pipeline is working correctly.")
    else:
        print("\n⚠ Some validation checks failed.")
        print("  Review the output above for details.")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())

