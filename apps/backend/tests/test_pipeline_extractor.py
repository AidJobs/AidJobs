"""
Unit tests for extraction pipeline.
"""

import pytest
from bs4 import BeautifulSoup
from pipeline.extractor import Extractor, ExtractionResult, FieldResult
from pipeline.jsonld import JSONLDExtractor
from pipeline.heuristics import HeuristicExtractor
from pipeline.classifier import JobPageClassifier


class TestExtractionResult:
    """Test ExtractionResult schema compliance."""
    
    def test_schema_compliance(self):
        """Test that result matches strict schema."""
        result = ExtractionResult("https://example.com/job/123")
        result.is_job = True
        result.classifier_score = 0.85
        result.set_field('title', FieldResult(
            value="Software Engineer",
            source='jsonld',
            confidence=0.9,
            raw_snippet="Software Engineer"
        ))
        
        data = result.to_dict()
        
        # Check required fields
        assert 'url' in data
        assert 'canonical_id' in data
        assert 'extracted_at' in data
        assert 'pipeline_version' in data
        assert 'fields' in data
        assert 'is_job' in data
        assert 'classifier_score' in data
        assert 'dedupe_hash' in data
        
        # Check fields structure
        assert 'title' in data['fields']
        title_field = data['fields']['title']
        assert 'value' in title_field
        assert 'source' in title_field
        assert 'confidence' in title_field
        assert 'raw_snippet' in title_field


class TestJSONLDExtractor:
    """Test JSON-LD extraction."""
    
    def test_extract_job_posting(self):
        """Test extraction from JobPosting JSON-LD."""
        html = """
        <script type="application/ld+json">
        {
          "@type": "JobPosting",
          "title": "Program Officer",
          "hiringOrganization": {
            "name": "UNDP"
          },
          "jobLocation": {
            "address": {
              "addressLocality": "New York",
              "addressCountry": "USA"
            }
          },
          "datePosted": "2025-01-01",
          "validThrough": "2025-02-15",
          "description": "Manage programs",
          "url": "https://jobs.undp.org/apply/123"
        }
        </script>
        """
        soup = BeautifulSoup(html, 'html.parser')
        extractor = JSONLDExtractor()
        fields = extractor.extract(soup, "https://example.com")
        
        assert 'title' in fields
        assert fields['title'].value == "Program Officer"
        assert fields['title'].source == 'jsonld'
        assert fields['title'].confidence == 0.9
        
        assert 'employer' in fields
        assert fields['employer'].value == "UNDP"
        
        assert 'location' in fields
        assert 'New York' in fields['location'].value
        
        assert 'deadline' in fields
        assert fields['deadline'].value == "2025-02-15"


class TestHeuristicExtractor:
    """Test heuristic extraction."""
    
    def test_extract_location(self):
        """Test location extraction from labels."""
        html = """
        <dl>
          <dt>Location:</dt>
          <dd>Kabul, Afghanistan</dd>
        </dl>
        """
        soup = BeautifulSoup(html, 'html.parser')
        extractor = HeuristicExtractor()
        fields = extractor.extract(soup, "https://example.com")
        
        assert 'location' in fields
        assert 'Kabul' in fields['location'].value
        assert fields['location'].source == 'heuristic'
    
    def test_extract_deadline(self):
        """Test deadline extraction."""
        html = """
        <div>
          <strong>Deadline:</strong> 15 February 2025
        </div>
        """
        soup = BeautifulSoup(html, 'html.parser')
        extractor = HeuristicExtractor()
        fields = extractor.extract(soup, "https://example.com")
        
        assert 'deadline' in fields
        assert fields['deadline'].value is not None


class TestJobPageClassifier:
    """Test job page classifier."""
    
    def test_classify_job_page(self):
        """Test classification of job page."""
        html = """
        <html>
          <body>
            <h1>Job Opening: Program Officer</h1>
            <div class="job-listing">
              <p>We are hiring a Program Officer...</p>
              <a href="/apply">Apply Now</a>
            </div>
          </body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        classifier = JobPageClassifier()
        is_job, score = classifier.classify(html, soup, "https://example.com/jobs/123")
        
        assert is_job is True
        assert score > 0.5
    
    def test_classify_non_job_page(self):
        """Test classification of non-job page."""
        html = """
        <html>
          <body>
            <h1>About Us</h1>
            <p>Welcome to our homepage...</p>
            <a href="/login">Sign In</a>
          </body>
        </html>
        """
        soup = BeautifulSoup(html, 'html.parser')
        classifier = JobPageClassifier()
        is_job, score = classifier.classify(html, soup, "https://example.com/about")
        
        assert is_job is False or score < 0.5


@pytest.mark.asyncio
async def test_extractor_integration():
    """Integration test for full extractor."""
    html = """
    <html>
      <head>
        <title>Job: Program Officer</title>
        <meta property="og:description" content="Manage climate programs">
      </head>
      <body>
        <script type="application/ld+json">
        {
          "@type": "JobPosting",
          "title": "Program Officer - Climate",
          "hiringOrganization": {"name": "UNDP"},
          "jobLocation": {"address": {"addressLocality": "New York"}},
          "validThrough": "2025-02-15"
        }
        </script>
        <h1>Program Officer - Climate</h1>
        <dl>
          <dt>Location:</dt>
          <dd>New York, USA</dd>
          <dt>Deadline:</dt>
          <dd>15 February 2025</dd>
        </dl>
      </body>
    </html>
    """
    
    extractor = Extractor(enable_ai=False, enable_snapshots=False)
    result = await extractor.extract_from_html(html, "https://example.com/job/123")
    
    # Check schema compliance
    data = result.to_dict()
    assert 'fields' in data
    assert 'title' in data['fields']
    assert data['fields']['title']['value'] is not None
    
    # Should have extracted title from JSON-LD
    assert 'Program Officer' in data['fields']['title']['value']
    
    # Should have extracted location from heuristics
    assert 'location' in data['fields']
    assert data['fields']['location']['value'] is not None

