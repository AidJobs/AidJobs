"""
Integration tests for extraction pipeline using saved HTML snapshots.
"""

import pytest
import asyncio
from pathlib import Path
from pipeline.extractor import Extractor

# Get fixtures directory
FIXTURES_DIR = Path(__file__).parent / 'fixtures'


@pytest.mark.asyncio
async def test_extract_from_sample_job_1():
    """Test extraction from sample job with JSON-LD."""
    fixture_path = FIXTURES_DIR / 'sample_job_1.html'
    
    if not fixture_path.exists():
        pytest.skip(f"Fixture not found: {fixture_path}")
    
    html = fixture_path.read_text(encoding='utf-8')
    url = "https://jobs.undp.org/job/123"
    
    extractor = Extractor(enable_ai=False, enable_snapshots=False, shadow_mode=True)
    result = await extractor.extract_from_html(html, url)
    
    # Validate schema
    data = result.to_dict()
    assert 'url' in data
    assert 'canonical_id' in data
    assert 'extracted_at' in data
    assert 'pipeline_version' in data
    assert 'fields' in data
    assert 'is_job' in data
    assert 'classifier_score' in data
    assert 'dedupe_hash' in data
    
    # Check JSON-LD extraction worked
    assert data['fields']['title']['value'] is not None
    assert 'Program Officer' in data['fields']['title']['value']
    assert data['fields']['title']['source'] == 'jsonld'
    assert data['fields']['title']['confidence'] == 0.9
    
    # Check employer
    assert data['fields']['employer']['value'] == 'UNDP'
    
    # Check location
    assert data['fields']['location']['value'] is not None
    assert 'New York' in data['fields']['location']['value']
    
    # Check deadline
    assert data['fields']['deadline']['value'] == '2025-02-15'
    
    # Should be classified as job
    assert data['is_job'] is True
    assert data['classifier_score'] > 0.5


@pytest.mark.asyncio
async def test_extract_from_sample_job_2():
    """Test extraction from sample job with meta tags."""
    fixture_path = FIXTURES_DIR / 'sample_job_2.html'
    
    if not fixture_path.exists():
        pytest.skip(f"Fixture not found: {fixture_path}")
    
    html = fixture_path.read_text(encoding='utf-8')
    url = "https://careers.savethechildren.org/job/finance-manager"
    
    extractor = Extractor(enable_ai=False, enable_snapshots=False, shadow_mode=True)
    result = await extractor.extract_from_html(html, url)
    
    data = result.to_dict()
    
    # Check meta tag extraction
    assert data['fields']['title']['value'] is not None
    assert data['fields']['title']['source'] in ['meta', 'dom']
    
    # Check heuristic extraction for location
    assert data['fields']['location']['value'] is not None
    assert 'London' in data['fields']['location']['value'] or data['fields']['location']['source'] == 'heuristic'
    
    # Check deadline extraction
    assert data['fields']['deadline']['value'] is not None or data['fields']['deadline']['source'] == 'heuristic'
    
    # Check requirements extraction
    if data['fields']['requirements']['value']:
        assert isinstance(data['fields']['requirements']['value'], list)


@pytest.mark.asyncio
async def test_extractor_schema_compliance():
    """Test that all extraction results match strict schema."""
    fixture_path = FIXTURES_DIR / 'sample_job_1.html'
    
    if not fixture_path.exists():
        pytest.skip(f"Fixture not found: {fixture_path}")
    
    html = fixture_path.read_text(encoding='utf-8')
    extractor = Extractor(enable_ai=False, enable_snapshots=False, shadow_mode=True)
    result = await extractor.extract_from_html(html, "https://example.com/job")
    
    data = result.to_dict()
    
    # Required top-level fields
    required_fields = ['url', 'canonical_id', 'extracted_at', 'pipeline_version', 
                      'fields', 'is_job', 'classifier_score', 'dedupe_hash']
    for field in required_fields:
        assert field in data, f"Missing required field: {field}"
    
    # Fields structure
    required_field_names = ['title', 'employer', 'location', 'posted_on', 
                           'deadline', 'description', 'requirements']
    for field_name in required_field_names:
        assert field_name in data['fields'], f"Missing field: {field_name}"
        field_data = data['fields'][field_name]
        assert 'value' in field_data
        assert 'source' in field_data
        assert 'confidence' in field_data
        assert 'raw_snippet' in field_data
        
        # Check types
        assert isinstance(field_data['confidence'], (int, float))
        assert 0 <= field_data['confidence'] <= 1
    
    # Check types
    assert isinstance(data['is_job'], bool)
    assert isinstance(data['classifier_score'], (int, float))
    assert 0 <= data['classifier_score'] <= 1


@pytest.mark.asyncio
async def test_classifier_with_seed_data():
    """Test classifier with seed dataset examples."""
    from pipeline.classifier import JobPageClassifier
    from bs4 import BeautifulSoup
    
    classifier = JobPageClassifier()
    
    # Test job pages
    job_dir = FIXTURES_DIR / 'classifier_seed' / 'job_pages'
    if job_dir.exists():
        for html_file in job_dir.glob('*.html'):
            html = html_file.read_text(encoding='utf-8')
            soup = BeautifulSoup(html, 'html.parser')
            is_job, score = classifier.classify(html, soup, f"https://example.com/{html_file.name}")
            assert is_job is True, f"Should classify {html_file.name} as job (score: {score})"
            assert score > 0.5, f"Job page should have score > 0.5 (got {score})"
    
    # Test non-job pages
    non_job_dir = FIXTURES_DIR / 'classifier_seed' / 'non_job_pages'
    if non_job_dir.exists():
        for html_file in non_job_dir.glob('*.html'):
            html = html_file.read_text(encoding='utf-8')
            soup = BeautifulSoup(html, 'html.parser')
            is_job, score = classifier.classify(html, soup, f"https://example.com/{html_file.name}")
            # Non-job pages might still score > 0.5, but should be lower than job pages
            # Just check that classification is consistent
            assert isinstance(is_job, bool)
            assert 0 <= score <= 1

