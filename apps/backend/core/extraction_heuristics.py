"""
Global extraction heuristics for robust job link identification.
These improvements make the pipeline work better across diverse sites.
"""
import re
import logging
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)

# Global blocklist for non-job links
GLOBAL_BLOCKLIST = [
    'more jobs', 'global', 'where we work', 'leadership recruitment',
    'life at', 'get prepared', 'send me jobs', 'candidate login',
    'home', 'about us', 'contact us', 'login', 'register', 'search',
    'menu', 'skip to content', 'privacy', 'terms', 'cookie'
]

# Job-related keywords for scoring
JOB_KEYWORDS = [
    'job', 'vacanc', 'consultanc', 'apply', '/job/', '/view/', 
    '/opportunity', '/tender', '/consultanc', 'position', 'career',
    'opening', 'recruitment', 'hiring', 'application', 'posting',
    'specialist', 'officer', 'manager', 'coordinator', 'analyst'
]

# Tracking parameters to strip
TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 
                   'utm_content', 'fbclid', 'gclid', '_ga', 'ref', 'source']


def normalize_url(url: str) -> str:
    """
    Normalize URL for deduplication:
    - Strip tracking parameters
    - Remove trailing slashes
    - Lowercase host
    """
    try:
        parsed = urlparse(url)
        
        # Lowercase host
        netloc = parsed.netloc.lower()
        
        # Strip tracking params
        query_params = parse_qs(parsed.query, keep_blank_values=True)
        filtered_params = {k: v for k, v in query_params.items() 
                          if k.lower() not in [p.lower() for p in TRACKING_PARAMS]}
        
        # Rebuild query string
        new_query = urlencode(filtered_params, doseq=True) if filtered_params else ''
        
        # Remove trailing slash from path
        path = parsed.path.rstrip('/')
        
        # Reconstruct URL
        normalized = urlunparse((
            parsed.scheme,
            netloc,
            path,
            parsed.params,
            new_query,
            ''  # Remove fragment
        ))
        
        return normalized
    except Exception as e:
        logger.warning(f"Error normalizing URL {url}: {e}")
        return url


def is_mailto_link(href: str) -> bool:
    """Check if href is a mailto link."""
    return href.strip().lower().startswith('mailto:')


def is_blocklisted(link_text: str, href: str) -> bool:
    """Check if link matches global blocklist."""
    text_lower = link_text.lower().strip()
    href_lower = href.lower()
    
    # Check exact matches
    if text_lower in [b.lower() for b in GLOBAL_BLOCKLIST]:
        return True
    
    # Check if text starts with blocklisted phrase
    for blocked in GLOBAL_BLOCKLIST:
        if text_lower.startswith(blocked.lower()):
            return True
    
    return False


def score_link(link: Tag, base_url: str, source_id: Optional[str] = None) -> Tuple[float, Dict[str, any]]:
    """
    Score a link to determine if it's likely a job link.
    Returns (score, metadata) where score > 0 means likely a job link.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    link_text = link.get_text().strip()
    href = link.get('href', '').strip()
    
    if not link_text or not href:
        return (0.0, {'reason': 'empty_text_or_href'})
    
    # Reject mailto links
    if is_mailto_link(href):
        email = href.replace('mailto:', '').strip()
        logger.info(f"HEURISTICS: rejected mailto link {email} for source {source_id or 'unknown'}")
        return (0.0, {'reason': 'mailto_link', 'rejected_email': email})
    
    # Reject blocklisted links
    if is_blocklisted(link_text, href):
        logger.info(f"HEURISTICS: rejected generic link {href[:100]} reason=blocklisted for source {source_id or 'unknown'}")
        return (0.0, {'reason': 'blocklisted'})
    
    # Reject anchors and javascript
    if href.startswith('#') or href.startswith('javascript:'):
        return (0.0, {'reason': 'anchor_or_js'})
    
    score = 0.0
    reasons = []
    
    link_text_lower = link_text.lower()
    href_lower = href.lower()
    
    # Score based on job keywords in URL
    for keyword in JOB_KEYWORDS:
        if keyword in href_lower:
            score += 2.0
            reasons.append(f'url_has_{keyword}')
            break
    
    # Score based on job keywords in text
    for keyword in JOB_KEYWORDS:
        if keyword in link_text_lower:
            score += 1.5
            reasons.append(f'text_has_{keyword}')
            break
    
    # Score based on text length (longer = more likely to be a job title)
    if len(link_text) >= 4:
        score += 0.5
        reasons.append('text_length_ok')
    
    if len(link_text) >= 15:
        score += 1.0
        reasons.append('text_length_good')
    
    # Penalize single short uppercase tokens (likely navigation)
    if len(link_text.split()) == 1 and link_text.isupper() and len(link_text) < 10:
        score -= 2.0
        reasons.append('single_short_uppercase')
    
    # Penalize email-like text
    if '@' in link_text or link_text.endswith('.org') or link_text.endswith('.com'):
        score -= 1.0
        reasons.append('looks_like_email')
    
    # Check if it's a detail page (higher score)
    detail_patterns = ['/view/', '/job/', '/detail/', '/position/', '/id=', '?id=']
    if any(pattern in href_lower for pattern in detail_patterns):
        score += 1.5
        reasons.append('detail_page_pattern')
    
    # Check parent context
    parent = link.parent
    if parent:
        parent_class = str(parent.get('class', [])).lower()
        parent_id = str(parent.get('id', '')).lower()
        if any(kw in parent_class or kw in parent_id for kw in ['job', 'position', 'vacancy', 'listing']):
            score += 1.0
            reasons.append('job_section_context')
    
    return (max(0.0, score), {'reasons': reasons, 'text': link_text[:50], 'href': href[:100]})


def extract_contact_info(soup: BeautifulSoup) -> Dict[str, List[str]]:
    """
    Extract contact information (emails, phones) from page.
    Returns dict with 'emails' and 'phones' lists.
    """
    contact_info = {'emails': [], 'phones': []}
    
    # Find mailto links
    mailto_links = soup.find_all('a', href=lambda h: h and h.startswith('mailto:'))
    for link in mailto_links:
        email = link.get('href', '').replace('mailto:', '').strip()
        if email and email not in contact_info['emails']:
            contact_info['emails'].append(email)
    
    # Find email patterns in text
    text = soup.get_text()
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, text)
    for email in emails[:10]:  # Limit to first 10
        if email not in contact_info['emails']:
            contact_info['emails'].append(email)
    
    # Find phone patterns
    phone_pattern = r'\+?[\d\s\-\(\)]{10,}'
    phones = re.findall(phone_pattern, text)
    for phone in phones[:10]:  # Limit to first 10
        cleaned = re.sub(r'\s+', ' ', phone.strip())
        if len(cleaned) >= 10 and cleaned not in contact_info['phones']:
            contact_info['phones'].append(cleaned)
    
    return contact_info


def get_canonical_hash(title: str, apply_url: str, reference: Optional[str] = None) -> str:
    """
    Compute canonical hash from normalized fields.
    """
    import hashlib
    
    # Normalize title
    title_norm = title.strip().lower() if title else ''
    
    # Normalize URL
    url_norm = normalize_url(apply_url).lower() if apply_url else ''
    
    # Add reference if available
    ref_norm = reference.strip().lower() if reference else ''
    
    # Combine and hash
    canonical_text = f"{title_norm}|{url_norm}|{ref_norm}".strip('|')
    return hashlib.md5(canonical_text.encode()).hexdigest()


def filter_and_score_job_links(soup: BeautifulSoup, base_url: str, max_links: int = 500, source_id: Optional[str] = None) -> List[Tuple[Tag, float, Dict]]:
    """
    Find and score all potential job links from a page.
    Returns list of (link, score, metadata) tuples, sorted by score descending.
    """
    all_links = soup.find_all('a', href=True)
    scored_links = []
    
    for link in all_links:
        score, metadata = score_link(link, base_url, source_id=source_id)
        if score > 0:
            scored_links.append((link, score, metadata))
    
    # Sort by score descending
    scored_links.sort(key=lambda x: x[1], reverse=True)
    
    # Return top N
    return scored_links[:max_links]

