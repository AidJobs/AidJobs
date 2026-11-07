"""PageUp career-site listing reader.

Chosen by what the listing page shows, never by its address: job cards (`div.list-view--item`)
that each hold exactly one `a.job-link`. UNICEF's listing is one: its pages carry PageUp's
career-site files, and its CloudFront challenge page names Clinch, which hosts it. The crawler
pages through the listing (`crawler_v2/simple_crawler.py`).
"""
import re
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup


class PageUpListingReader:
    """Reads the job cards of one listing page."""

    name = "pageup"

    def get_soup(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, 'lxml')

    def read_job_cards(self, html: str, base_url: str) -> List[Dict]:
        """One row per job card; [] when the page shows none."""
        return self._extract_job_cards(self.get_soup(html), base_url)

    def _extract_job_cards(self, soup: BeautifulSoup, base_url: str) -> List[Dict]:
        """One row per listing card that holds exactly one job link. Exclusion words do not apply.

        The listing renders each card twice; the first card for a link wins.
        A missing location or deadline is left out, not set to None: save_jobs strips both.
        """
        jobs = []
        seen = set()
        for card in soup.select('div.list-view--item'):
            links = card.select('a.job-link[href]')
            if len(links) != 1:
                continue
            href = links[0].get('href', '')
            if not href or href.startswith('#') or href.startswith('javascript:'):
                continue
            apply_url = urljoin(base_url, href)
            if apply_url in seen:
                continue
            title = ' '.join(links[0].get_text(' ').split())
            if not title:
                continue
            seen.add(apply_url)
            job = {'title': title, 'apply_url': apply_url}
            place = card.select_one('span.location')
            location = ' '.join(place.get_text(' ').split()) if place else ''
            if location:
                job['location_raw'] = location
            close = card.select_one('span.close-date')
            deadline = None
            if close:
                deadline = self._parse_deadline(' '.join(close.get_text(' ').split()))
            if deadline:
                job['deadline'] = deadline
            jobs.append(job)
        return jobs

    def _parse_deadline(self, text: str) -> Optional[str]:
        """Parse deadline text to YYYY-MM-DD format"""
        if not text:
            return None

        text = text.strip()

        # Format: "12 Dec 2025 11:55 PM" -> "2025-12-12"
        # Format: "12 Dec 2025" -> "2025-12-12"
        match = re.search(r'(\d{1,2})\s+(\w{3,9})\s+(\d{4})', text)
        if match:
            day, month_str, year = match.groups()
            month_map = {
                'january': 1, 'jan': 1,
                'february': 2, 'feb': 2,
                'march': 3, 'mar': 3,
                'april': 4, 'apr': 4,
                'may': 5,
                'june': 6, 'jun': 6,
                'july': 7, 'jul': 7,
                'august': 8, 'aug': 8,
                'september': 9, 'sep': 9, 'sept': 9,
                'october': 10, 'oct': 10,
                'november': 11, 'nov': 11,
                'december': 12, 'dec': 12
            }
            month = month_map.get(month_str.lower())
            if month:
                try:
                    return datetime(int(year), month, int(day)).strftime('%Y-%m-%d')
                except ValueError:
                    pass

        return None
