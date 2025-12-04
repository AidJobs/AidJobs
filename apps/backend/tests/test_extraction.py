"""
Unit tests for job extraction using golden fixtures.
"""

import json
import os
from pathlib import Path
import sys

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crawler_v2.simple_crawler import SimpleCrawler


class TestExtraction:
    """Test extraction logic with golden fixtures"""
    
    def __init__(self):
        self.crawler = SimpleCrawler()
        self.fixtures_dir = Path(__file__).parent / 'fixtures'
    
    def load_fixture(self, filename: str) -> tuple[str, dict]:
        """
        Load HTML fixture and expected results.
        
        Args:
            filename: Fixture filename (without extension)
            
        Returns:
            Tuple of (html_content, expected_results)
        """
        html_path = self.fixtures_dir / f"{filename}.html"
        json_path = self.fixtures_dir / f"expected/{filename}.json"
        
        if not html_path.exists():
            raise FileNotFoundError(f"Fixture not found: {html_path}")
        
        with open(html_path, 'r', encoding='utf-8') as f:
            html = f.read()
        
        expected = {}
        if json_path.exists():
            with open(json_path, 'r', encoding='utf-8') as f:
                expected = json.load(f)
        
        return html, expected
    
    async def test_extraction(self, fixture_name: str):
        """
        Test extraction on a fixture.
        
        Args:
            fixture_name: Name of fixture to test
            
        Returns:
            Dict with test results
        """
        html, expected = self.load_fixture(fixture_name)
        
        # Extract jobs
        jobs = await self.crawler.extract_jobs_from_html(html, "https://example.com")
        
        # Compare with expected
        results = {
            'fixture': fixture_name,
            'jobs_found': len(jobs),
            'expected_count': expected.get('count', 0),
            'matches': [],
            'mismatches': []
        }
        
        if expected.get('jobs'):
            for i, expected_job in enumerate(expected['jobs']):
                if i < len(jobs):
                    actual_job = jobs[i]
                    match = self._compare_job(actual_job, expected_job)
                    if match['matches']:
                        results['matches'].append(match)
                    else:
                        results['mismatches'].append(match)
        
        return results
    
    def _compare_job(self, actual: dict, expected: dict) -> dict:
        """Compare actual vs expected job extraction"""
        comparison = {
            'matches': True,
            'fields': {}
        }
        
        for field in ['title', 'apply_url', 'location_raw', 'deadline', 'org_name']:
            actual_val = actual.get(field, '').strip() if actual.get(field) else ''
            expected_val = expected.get(field, '').strip() if expected.get(field) else ''
            
            match = actual_val.lower() == expected_val.lower() if actual_val and expected_val else False
            comparison['fields'][field] = {
                'match': match,
                'actual': actual_val[:100],
                'expected': expected_val[:100]
            }
            
            if not match and expected_val:
                comparison['matches'] = False
        
        return comparison


# Example test runner (for manual testing)
async def run_tests():
    """Run all fixture tests"""
    tester = TestExtraction()
    
    # Find all fixtures
    fixtures_dir = tester.fixtures_dir
    fixtures = []
    
    for html_file in fixtures_dir.glob('*.html'):
        fixtures.append(html_file.stem)
    
    print(f"Found {len(fixtures)} fixtures")
    
    results = []
    for fixture in fixtures:
        print(f"\nTesting {fixture}...")
        result = await tester.test_extraction(fixture)
        results.append(result)
        
        if result['mismatches']:
            print(f"  ❌ {len(result['mismatches'])} mismatches")
        else:
            print(f"  ✅ All matches")
    
    return results


if __name__ == '__main__':
    import asyncio
    asyncio.run(run_tests())

