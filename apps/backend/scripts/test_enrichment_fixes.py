#!/usr/bin/env python3
"""
Test script to verify enrichment pipeline fixes.
Tests diverse job types to ensure no bias toward WASH/Health or Officer/Associate.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.ai_service import get_ai_service
from app.enrichment import enrich_job, apply_enrichment_rules

def test_job(title, description, org_name=None, location=None):
    """Test enrichment for a single job."""
    print(f"\n{'='*60}")
    print(f"Testing: {title}")
    print('='*60)
    print(f"Description: {description[:100]}..." if len(description) > 100 else f"Description: {description}")
    print()
    
    # Test enrichment
    result = enrich_job(
        job_id="test-123",
        title=title,
        description=description,
        org_name=org_name,
        location=location,
    )
    
    if not result:
        print("ERROR: Enrichment returned None")
        return None
    
    # Display results
    print("Results:")
    print(f"  Impact Domain: {result.get('impact_domain', [])}")
    print(f"  Impact Confidences: {result.get('impact_confidences', {})}")
    print(f"  Functional Role: {result.get('functional_role', [])}")
    print(f"  Experience Level: {result.get('experience_level', 'N/A')}")
    print(f"  Experience Confidence: {result.get('experience_confidence', 'N/A')}")
    print(f"  Confidence Overall: {result.get('confidence_overall', 'N/A')}")
    print(f"  Low Confidence: {result.get('low_confidence', False)}")
    if result.get('low_confidence_reason'):
        print(f"  Low Confidence Reason: {result.get('low_confidence_reason')}")
    print()
    
    return result

def main():
    print("Enrichment Pipeline Fix Verification")
    print("="*60)
    print("Testing diverse job types to ensure no bias")
    print()
    
    # Check AI service
    ai_service = get_ai_service()
    if not ai_service.enabled:
        print("ERROR: AI service not enabled. Set OPENROUTER_API_KEY environment variable.")
        sys.exit(1)
    
    # Test cases designed to catch bias
    test_cases = [
        {
            "title": "Finance Manager",
            "description": "We are seeking an experienced Finance Manager to oversee financial operations, budgeting, and accounting for our organization. The role requires strong financial analysis skills and experience with donor reporting.",
            "org_name": "International NGO",
            "location": "Nairobi, Kenya"
        },
        {
            "title": "Senior Director of Programs",
            "description": "The Senior Director of Programs will lead strategic program development and implementation across multiple countries. This senior leadership role requires 10+ years of experience in program management and team leadership.",
            "org_name": "Global Development Organization",
            "location": "Geneva, Switzerland"
        },
        {
            "title": "Education Specialist",
            "description": "We are looking for an Education Specialist to design and implement education programs in emergency contexts. The role focuses on curriculum development and teacher training.",
            "org_name": "Education NGO",
            "location": "Beirut, Lebanon"
        },
        {
            "title": "IT Systems Administrator",
            "description": "The IT Systems Administrator will manage our technology infrastructure, including servers, networks, and software systems. Technical expertise in Linux and cloud platforms required.",
            "org_name": "Technology NGO",
            "location": "Remote"
        },
        {
            "title": "WASH Program Officer",  # This SHOULD be WASH
            "description": "Manage water, sanitation, and hygiene programs in rural communities. Coordinate with local partners to implement WASH interventions and ensure compliance with international standards.",
            "org_name": "WASH Organization",
            "location": "Dakar, Senegal"
        },
        {
            "title": "Junior Program Assistant",  # This SHOULD be Early/Junior
            "description": "Entry-level position supporting program activities. Ideal for recent graduates with interest in international development. No prior experience required.",
            "org_name": "Development NGO",
            "location": "New York, USA"
        },
        {
            "title": "Job with Very Short Description",  # Should have low confidence
            "description": "Program Manager",
            "org_name": "NGO",
            "location": "Unknown"
        },
        {
            "title": "Job with No Description",  # Should have low confidence
            "description": "",
            "org_name": "NGO",
            "location": "Unknown"
        },
    ]
    
    results = []
    for test_case in test_cases:
        result = test_job(**test_case)
        if result:
            results.append({
                "title": test_case["title"],
                "result": result
            })
    
    # Summary
    print("\n" + "="*60)
    print("Summary")
    print("="*60)
    
    # Check for bias patterns
    officer_associate_count = sum(1 for r in results if r["result"].get("experience_level") == "Officer / Associate")
    wash_count = sum(1 for r in results if "Water, Sanitation & Hygiene (WASH)" in r["result"].get("impact_domain", []))
    health_count = sum(1 for r in results if "Public Health & Primary Health Care" in r["result"].get("impact_domain", []))
    low_confidence_count = sum(1 for r in results if r["result"].get("low_confidence", False))
    
    print(f"Total jobs tested: {len(results)}")
    print(f"Jobs with 'Officer / Associate': {officer_associate_count} ({officer_associate_count/len(results)*100:.1f}%)")
    print(f"Jobs with WASH domain: {wash_count} ({wash_count/len(results)*100:.1f}%)")
    print(f"Jobs with Public Health domain: {health_count} ({health_count/len(results)*100:.1f}%)")
    print(f"Jobs flagged as low confidence: {low_confidence_count} ({low_confidence_count/len(results)*100:.1f}%)")
    print()
    
    # Expected patterns
    print("Expected patterns:")
    print("  - Finance Manager should NOT be WASH/Health")
    print("  - Senior Director should NOT be Officer/Associate")
    print("  - Education Specialist should NOT be WASH/Health")
    print("  - IT Admin should NOT be WASH/Health")
    print("  - WASH Officer SHOULD be WASH (this is correct)")
    print("  - Junior Assistant SHOULD be Early/Junior (this is correct)")
    print("  - Short/empty descriptions should have low confidence")
    print()
    
    # Check if bias is present
    if officer_associate_count > len(results) * 0.5:
        print("⚠️  WARNING: More than 50% of jobs are 'Officer / Associate' - possible bias!")
    else:
        print("✓ Experience level distribution looks balanced")
    
    if (wash_count + health_count) > len(results) * 0.5:
        print("⚠️  WARNING: More than 50% of jobs are WASH/Health - possible bias!")
    else:
        print("✓ Impact domain distribution looks balanced")
    
    if low_confidence_count < 2:
        print("⚠️  WARNING: Too few jobs flagged as low confidence - may need adjustment")
    else:
        print("✓ Low confidence flagging is working")
    
    print("\n" + "="*60)
    print("Test Complete")
    print("="*60)

if __name__ == "__main__":
    main()

