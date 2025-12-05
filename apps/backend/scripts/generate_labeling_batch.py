#!/usr/bin/env python3
"""
Generate labeling batch CSV from fixtures and available data.

Creates 200 candidate pages for human labeling.
"""

import os
import sys
import csv
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False
    print("⚠️  beautifulsoup4 not available, using simple text extraction")

try:
    from pipeline.classifier import JobPageClassifier
    CLASSIFIER_AVAILABLE = True
except ImportError:
    CLASSIFIER_AVAILABLE = False
    print("⚠️  Classifier not available, using simple heuristics")


def get_fixture_pages():
    """Get pages from test fixtures."""
    fixtures_dir = Path(__file__).parent.parent / 'tests' / 'fixtures'
    pages = []
    
    # Get classifier seed examples
    job_dir = fixtures_dir / 'classifier_seed' / 'job_pages'
    non_job_dir = fixtures_dir / 'classifier_seed' / 'non_job_pages'
    
    if job_dir.exists():
        for html_file in job_dir.glob('*.html'):
            html = html_file.read_text(encoding='utf-8')
            pages.append({
                'url': f"https://example.com/job/{html_file.name}",
                'html': html,
                'expected_label': 'job'
            })
    
    if non_job_dir.exists():
        for html_file in non_job_dir.glob('*.html'):
            html = html_file.read_text(encoding='utf-8')
            pages.append({
                'url': f"https://example.com/{html_file.name}",
                'html': html,
                'expected_label': 'not_job'
            })
    
    # Get sample job fixtures
    sample_dir = fixtures_dir
    for html_file in sample_dir.glob('sample_job_*.html'):
        html = html_file.read_text(encoding='utf-8')
        pages.append({
            'url': f"https://example.com/job/{html_file.name}",
            'html': html,
            'expected_label': 'job'
        })
    
    return pages


def extract_html_snippet(html: str, max_chars: int = 500) -> str:
    """Extract a readable snippet from HTML."""
    if BS4_AVAILABLE:
        try:
            soup = BeautifulSoup(html, 'html.parser')
            # Get text content
            text = soup.get_text()
            # Clean up whitespace
            text = ' '.join(text.split())
            return text[:max_chars]
        except Exception:
            pass
    
    # Fallback: simple text extraction
    text = html[:max_chars * 2]  # Take more to account for tags
    # Remove common HTML tags
    import re
    text = re.sub(r'<[^>]+>', ' ', text)
    text = ' '.join(text.split())
    return text[:max_chars]


def generate_labeling_batch(output_path: Path, target_count: int = 200):
    """Generate labeling batch CSV."""
    print(f"Generating labeling batch with {target_count} pages...")
    
    # Get pages from fixtures
    pages = get_fixture_pages()
    
    print(f"Found {len(pages)} pages from fixtures")
    
    # If we need more, we'd normally pull from production data
    # For now, we'll use what we have and duplicate/expand if needed
    if len(pages) < target_count:
        # Expand by creating variations or using multiple passes
        multiplier = (target_count // len(pages)) + 1
        expanded_pages = []
        for i in range(multiplier):
            for page in pages:
                if len(expanded_pages) >= target_count:
                    break
                expanded_pages.append(page)
        pages = expanded_pages[:target_count]
    
    # Use classifier to suggest labels
    classifier = None
    if CLASSIFIER_AVAILABLE:
        try:
            classifier = JobPageClassifier()
        except Exception:
            classifier = None
    
    # Generate CSV
    rows = []
    for page in pages[:target_count]:
        html = page['html']
        url = page['url']
        
        # Get suggested label from classifier or heuristics
        suggested_label = page.get('expected_label', 'not_job')
        if classifier and BS4_AVAILABLE:
            try:
                soup = BeautifulSoup(html, 'html.parser')
                is_job, score = classifier.classify(html, soup, url)
                suggested_label = 'job' if is_job else 'not_job'
            except Exception:
                pass
        else:
            # Simple heuristic based on URL and text
            url_lower = url.lower()
            html_lower = html[:500].lower()
            if any(kw in url_lower for kw in ['/job', '/career', '/position', '/vacancy']):
                suggested_label = 'job'
            elif any(kw in html_lower for kw in ['apply', 'deadline', 'position', 'vacancy']):
                suggested_label = 'job'
            elif any(kw in html_lower for kw in ['login', 'sign in', 'about', 'contact']):
                suggested_label = 'not_job'
        
        # Extract snippet
        snippet = extract_html_snippet(html)
        
        rows.append({
            'url': url,
            'raw_html_snippet': snippet,
            'suggested_label': suggested_label,
            'label': ''  # Empty for human to fill
        })
    
    # Write CSV
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['url', 'raw_html_snippet', 'suggested_label', 'label'])
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"✅ Generated {len(rows)} rows in {output_path}")
    print(f"   Suggested labels: {sum(1 for r in rows if r['suggested_label'] == 'job')} job, {sum(1 for r in rows if r['suggested_label'] == 'not_job')} not_job")
    
    return len(rows)


if __name__ == '__main__':
    output_path = Path(__file__).parent.parent / 'tools' / 'labeling' / 'labeling_batch.csv'
    count = generate_labeling_batch(output_path, target_count=200)
    print(f"\n✅ Labeling batch ready: {output_path}")
    print(f"   Total rows: {count}")

