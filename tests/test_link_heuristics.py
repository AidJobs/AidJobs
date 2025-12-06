"""
Unit tests for link heuristics.
Tests that mailto links are rejected and scoring works correctly.
"""
import pytest
from bs4 import BeautifulSoup
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from core.extraction_heuristics import (
    is_mailto_link, is_blocklisted, score_link, filter_and_score_job_links,
    normalize_url
)


def test_mailto_link_rejection():
    """Test that mailto links are correctly identified and rejected."""
    assert is_mailto_link("mailto:test@example.com") == True
    assert is_mailto_link("mailto:contact@org.org") == True
    assert is_mailto_link("https://example.com/job/123") == False
    assert is_mailto_link("  mailto:test@example.com  ") == True


def test_mailto_in_detail_page():
    """Test that mailto links on detail pages are captured as contact_email."""
    html = """
    <html>
        <body>
            <h1>Job Title</h1>
            <p>Contact: <a href="mailto:hr@org.org">hr@org.org</a></p>
            <a href="/apply">Apply Now</a>
        </body>
    </html>
    """
    soup = BeautifulSoup(html, 'html.parser')
    contact_info = extract_contact_info(soup)
    
    assert 'hr@org.org' in contact_info.get('emails', [])
    # The apply link should not be mailto
    apply_link = soup.find('a', href='/apply')
    assert apply_link is not None
    assert not is_mailto_link(apply_link.get('href', ''))


def test_blocklist():
    """Test that blocklisted links are rejected."""
    assert is_blocklisted("More Jobs", "https://example.com/more") == True
    assert is_blocklisted("GLOBAL", "https://example.com/global") == True
    assert is_blocklisted("Software Engineer", "https://example.com/job/123") == False
    assert is_blocklisted("Where we work", "https://example.com/locations") == True


def test_link_scoring():
    """Test that job-like links get higher scores."""
    html = """
    <html>
        <body>
            <a href="/job/123">Software Engineer Position</a>
            <a href="mailto:contact@org.org">Contact Us</a>
            <a href="/careers">More Jobs</a>
            <a href="/view/position/456">Senior Developer - Remote</a>
        </body>
    </html>
    """
    soup = BeautifulSoup(html, 'html.parser')
    links = soup.find_all('a', href=True)
    
    scores = []
    for link in links:
        score, metadata = score_link(link, "https://example.com")
        scores.append((link.get_text(), score, metadata.get('reason')))
    
    # Job links should have positive scores
    job_scores = [s for _, s, _ in scores if s > 0]
    assert len(job_scores) > 0, "At least one job link should score > 0"
    
    # Mailto link should score 0
    mailto_score = next((s for text, s, _ in scores if 'mailto' in text.lower() or 'contact' in text.lower()), None)
    assert mailto_score == 0, "Mailto/contact links should score 0"


def test_filter_and_score_job_links():
    """Test that filter_and_score_job_links returns sorted results."""
    html = """
    <html>
        <body>
            <a href="/job/1">Junior Developer</a>
            <a href="mailto:hr@org.org">Email HR</a>
            <a href="/view/position/2">Senior Manager Position</a>
            <a href="/careers">More Jobs</a>
            <a href="/opportunity/3">Data Analyst Role</a>
        </body>
    </html>
    """
    soup = BeautifulSoup(html, 'html.parser')
    
    scored_links = filter_and_score_job_links(soup, "https://example.com", max_links=10)
    
    # Should have some results
    assert len(scored_links) > 0, "Should find some job links"
    
    # Should be sorted by score descending
    scores = [score for _, score, _ in scored_links]
    assert scores == sorted(scores, reverse=True), "Links should be sorted by score descending"
    
    # Should not include mailto links
    mailto_links = [link for link, _, _ in scored_links if link.get('href', '').startswith('mailto:')]
    assert len(mailto_links) == 0, "Should not include mailto links"


def test_url_normalization():
    """Test that URLs are normalized correctly."""
    # Test tracking parameter removal
    url1 = "https://example.com/job/123?utm_source=google&utm_medium=cpc&id=456"
    normalized1 = normalize_url(url1)
    assert "utm_source" not in normalized1
    assert "utm_medium" not in normalized1
    assert "id=456" in normalized1  # Non-tracking params kept
    
    # Test trailing slash removal
    url2 = "https://example.com/job/123/"
    normalized2 = normalize_url(url2)
    assert not normalized2.endswith('/')
    
    # Test host lowercasing
    url3 = "HTTPS://EXAMPLE.COM/Job/123"
    normalized3 = normalize_url(url3)
    assert normalized3.startswith("https://example.com")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

