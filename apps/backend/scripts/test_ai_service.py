#!/usr/bin/env python3
"""
Test script to verify AI service is working correctly.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.ai_service import get_ai_service

def main():
    print("Testing AI Service")
    print("=" * 60)
    
    # Check API key
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY not set")
        print("Set it with: export OPENROUTER_API_KEY='your-key'")
        sys.exit(1)
    
    print(f"API Key: {api_key[:20]}...{api_key[-10:]}")
    print()
    
    # Get AI service
    ai_service = get_ai_service()
    
    if not ai_service.enabled:
        print("ERROR: AI service not enabled")
        sys.exit(1)
    
    print(f"Model: {ai_service.model}")
    print(f"Base URL: {ai_service.base_url}")
    print()
    
    # Test enrichment
    print("Testing job enrichment...")
    print("-" * 60)
    
    test_job = {
        "title": "WASH Program Officer",
        "description": "We are seeking a WASH Program Officer to manage water and sanitation projects in rural communities. The role involves coordinating with local partners, monitoring project implementation, and ensuring compliance with international standards.",
        "org_name": "International Development NGO",
        "location": "Kenya"
    }
    
    print(f"Title: {test_job['title']}")
    print(f"Org: {test_job['org_name']}")
    print(f"Location: {test_job['location']}")
    print()
    
    result = ai_service.enrich_job(
        title=test_job["title"],
        description=test_job["description"],
        org_name=test_job["org_name"],
        location=test_job["location"],
    )
    
    if result:
        print("SUCCESS: Enrichment returned data")
        print()
        print("Result:")
        print(f"  Impact Domain: {result.get('impact_domain', [])}")
        print(f"  Functional Role: {result.get('functional_role', [])}")
        print(f"  Experience Level: {result.get('experience_level', 'N/A')}")
        print(f"  SDGs: {result.get('sdgs', [])}")
        print(f"  Confidence Overall: {result.get('confidence_overall', 'N/A')}")
        print()
        print("Full result:")
        import json
        print(json.dumps(result, indent=2))
    else:
        print("ERROR: Enrichment returned None")
        print("Check logs for details")
        sys.exit(1)
    
    print()
    print("=" * 60)
    print("AI Service test completed successfully!")

if __name__ == "__main__":
    main()

