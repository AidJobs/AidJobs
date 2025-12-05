#!/usr/bin/env python3
"""
Generate initial run report from test fixtures (tasks 1-8 only).

This script processes saved HTML fixtures and generates a report.
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.extractor import Extractor
from bs4 import BeautifulSoup


async def process_fixtures() -> dict:
    """Process test fixtures and generate report."""
    fixtures_dir = Path(__file__).parent.parent / 'tests' / 'fixtures'
    
    extractor = Extractor(enable_ai=False, enable_snapshots=True, shadow_mode=True)
    
    results = []
    field_stats = defaultdict(lambda: {'total': 0, 'success': 0, 'sources': defaultdict(int)})
    failed_urls = []
    
    # Process sample job fixtures
    sample_files = list((fixtures_dir / 'sample_job_1.html').parent.glob('sample_job_*.html'))
    
    for fixture_file in sample_files[:5]:  # Limit to 5 for dry run
        try:
            html = fixture_file.read_text(encoding='utf-8')
            url = f"https://example.com/{fixture_file.name}"
            
            # Extract
            result = await extractor.extract_from_html(html, url)
            result_dict = result.to_dict()
            results.append(result_dict)
            
            # Update stats
            for field_name, field_data in result_dict['fields'].items():
                field_stats[field_name]['total'] += 1
                if field_data['value'] is not None:
                    field_stats[field_name]['success'] += 1
                    if field_data['source']:
                        field_stats[field_name]['sources'][field_data['source']] += 1
            
        except Exception as e:
            failed_urls.append({
                'url': str(fixture_file),
                'reason': str(e)
            })
    
    # Calculate success rates
    field_success_rates = {}
    for field_name, stats in field_stats.items():
        if stats['total'] > 0:
            success_rate = stats['success'] / stats['total']
            field_success_rates[field_name] = {
                'success_rate': success_rate,
                'total': stats['total'],
                'success': stats['success'],
                'sources': dict(stats['sources'])
            }
    
    # Overall success rate
    total_fields = sum(s['total'] for s in field_stats.values())
    total_success = sum(s['success'] for s in field_stats.values())
    overall_success = total_success / total_fields if total_fields > 0 else 0
    
    # Classifier stats
    job_pages = sum(1 for r in results if r['is_job'])
    classifier_accuracy = job_pages / len(results) if results else 0
    
    return {
        'pages_processed': len(results),
        'pages_failed': len(failed_urls),
        'overall_field_success_rate': overall_success,
        'field_success_rates': field_success_rates,
        'classifier_accuracy': classifier_accuracy,
        'job_pages_detected': job_pages,
        'top_20_failed_urls': failed_urls[:20],
        'classifier_fp_fn_samples': [],  # Would need labeled data
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'pipeline_version': '1.0.0',
        'note': 'Dry run on test fixtures (tasks 1-8 only)'
    }


async def main():
    """Main function."""
    print("Processing test fixtures...")
    report = await process_fixtures()
    
    # Save report
    report_path = Path(__file__).parent.parent.parent / 'report' / 'initial-run.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"✅ Report saved to {report_path}")
    print(f"\nSummary:")
    print(f"  Pages processed: {report['pages_processed']}")
    print(f"  Overall success rate: {report['overall_field_success_rate']:.2%}")
    print(f"  Failed URLs: {len(report['top_20_failed_urls'])}")


if __name__ == '__main__':
    asyncio.run(main())

