"""
Unit tests for rule-based classifier heuristics.
"""

import pytest
from bs4 import BeautifulSoup
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from pipeline.classifier import JobPageClassifier


def test_job_keywords_detection():
    """Test that job-related keywords increase score."""
    classifier = JobPageClassifier()
    
    # HTML with job keywords
    html = """
    <html>
    <body>
        <h1>Program Officer Position</h1>
        <p>We are hiring for a new job opening. This is a career opportunity.</p>
        <a href="/apply">Apply Now</a>
    </body>
    </html>
    """
    soup = BeautifulSoup(html, 'html.parser')
    is_job, score = classifier.classify(html, soup, "https://example.com/job/123")
    
    assert is_job is True, "Should classify as job"
    assert score > 0.5, f"Score {score} should be > 0.5"


def test_url_patterns():
    """Test that URL patterns affect classification."""
    classifier = JobPageClassifier()
    
    html = "<html><body>Some content</body></html>"
    soup = BeautifulSoup(html, 'html.parser')
    
    # Job URL
    is_job, score = classifier.classify(html, soup, "https://example.com/careers/job/123")
    assert is_job is True, "Should classify job URL as job"
    
    # Non-job URL
    is_job2, score2 = classifier.classify(html, soup, "https://example.com/about")
    assert is_job2 is False or score2 < 0.5, "Should not classify about page as job"


def test_negative_indicators():
    """Test that negative keywords reduce score."""
    classifier = JobPageClassifier()
    
    # Login page
    html = """
    <html>
    <body>
        <h1>Candidate Login</h1>
        <p>Sign in to your account</p>
        <form>
            <input type="text" placeholder="Username">
            <input type="password" placeholder="Password">
            <button>Sign In</button>
        </form>
    </body>
    </html>
    """
    soup = BeautifulSoup(html, 'html.parser')
    is_job, score = classifier.classify(html, soup, "https://example.com/login")
    
    assert is_job is False, "Should not classify login page as job"
    assert score < 0.5, f"Score {score} should be < 0.5"


def test_apply_button_detection():
    """Test that apply buttons increase score."""
    classifier = JobPageClassifier()
    
    html = """
    <html>
    <body>
        <h1>Program Officer</h1>
        <p>Job description here.</p>
        <button>Apply Now</button>
        <a href="/submit">Submit Application</a>
    </body>
    </html>
    """
    soup = BeautifulSoup(html, 'html.parser')
    is_job, score = classifier.classify(html, soup, "https://example.com/position/123")
    
    assert is_job is True, "Should classify page with apply button as job"
    assert score > 0.5, f"Score {score} should be > 0.5"


def test_job_selectors():
    """Test that common job listing CSS selectors are detected."""
    classifier = JobPageClassifier()
    
    html = """
    <html>
    <body>
        <div class="job-listing">
            <h2>Program Manager</h2>
            <p>Description</p>
        </div>
    </body>
    </html>
    """
    soup = BeautifulSoup(html, 'html.parser')
    is_job, score = classifier.classify(html, soup, "https://example.com/jobs")
    
    assert is_job is True, "Should detect job-listing class"
    assert score > 0.5, f"Score {score} should be > 0.5"


def test_score_normalization():
    """Test that scores are normalized to 0-1 range."""
    classifier = JobPageClassifier()
    
    html = "<html><body>Content</body></html>"
    soup = BeautifulSoup(html, 'html.parser')
    
    # Test various URLs
    test_urls = [
        "https://example.com/job/123",
        "https://example.com/about",
        "https://example.com/careers/position/456"
    ]
    
    for url in test_urls:
        is_job, score = classifier.classify(html, soup, url)
        assert 0.0 <= score <= 1.0, f"Score {score} should be in [0, 1] range"


def test_empty_html():
    """Test handling of empty or minimal HTML."""
    classifier = JobPageClassifier()
    
    html = "<html><body></body></html>"
    soup = BeautifulSoup(html, 'html.parser')
    is_job, score = classifier.classify(html, soup, "https://example.com")
    
    # Should not crash and return valid score
    assert isinstance(is_job, bool)
    assert 0.0 <= score <= 1.0


def test_about_page():
    """Test that about pages are not classified as jobs."""
    classifier = JobPageClassifier()
    
    html = """
    <html>
    <body>
        <h1>About Us</h1>
        <p>We are a humanitarian organization working in 50 countries.</p>
        <p>Our mission is to help those in need.</p>
    </body>
    </html>
    """
    soup = BeautifulSoup(html, 'html.parser')
    is_job, score = classifier.classify(html, soup, "https://example.com/about")
    
    assert is_job is False, "About page should not be classified as job"
    assert score < 0.5, f"Score {score} should be < 0.5 for about page"

