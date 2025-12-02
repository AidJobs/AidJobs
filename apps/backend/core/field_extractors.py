"""
Enhanced field extraction utilities for all source types.

Provides consistent field extraction (title, location, deadline) across
HTML, RSS, API, JSON, and REST sources.
"""

import re
import logging
from typing import Dict, Optional, List
from datetime import datetime, date
from dateutil import parser as date_parser

logger = logging.getLogger(__name__)


class FieldExtractor:
    """
    Unified field extraction utilities.
    
    Used by all extractors to ensure consistent field parsing.
    """
    
    @staticmethod
    def extract_title_from_table_row(row, header_map: Dict[str, int], cells: List) -> Optional[str]:
        """
        Extract title from table row using header mapping.
        
        Args:
            row: BeautifulSoup table row element
            header_map: Dictionary mapping field names to column indices
            cells: List of table cells (td/th elements)
            
        Returns:
            Extracted title or None
        """
        # Try header map first
        if 'title' in header_map and header_map['title'] < len(cells):
            title_cell = cells[header_map['title']]
            title = FieldExtractor._clean_cell_text(title_cell)
            if title and len(title) >= 5:
                return title
        
        # Fallback: find link text
        link = row.find('a', href=True)
        if link:
            title = link.get_text().strip()
            if title and len(title) >= 5:
                return title
        
        # Fallback: first cell with substantial text
        for cell in cells:
            text = FieldExtractor._clean_cell_text(cell)
            if text and len(text) >= 10:
                return text
        
        return None
    
    @staticmethod
    def extract_location_from_table_row(row, header_map: Dict[str, int], cells: List) -> Optional[str]:
        """Extract location from table row."""
        if 'location' in header_map and header_map['location'] < len(cells):
            location_cell = cells[header_map['location']]
            location = FieldExtractor._clean_cell_text(location_cell)
            if location and len(location) >= 2:
                return location
        return None
    
    @staticmethod
    def extract_deadline_from_table_row(row, header_map: Dict[str, int], cells: List) -> Optional[date]:
        """Extract deadline from table row."""
        if 'deadline' in header_map and header_map['deadline'] < len(cells):
            deadline_cell = cells[header_map['deadline']]
            deadline_text = FieldExtractor._clean_cell_text(deadline_cell)
            if deadline_text:
                return FieldExtractor.parse_deadline(deadline_text)
        return None
    
    @staticmethod
    def _clean_cell_text(cell) -> Optional[str]:
        """Clean text extracted from table cell."""
        if not cell:
            return None
        
        text = cell.get_text().strip()
        
        # Remove common prefixes/suffixes
        text = re.sub(r'^(title|location|deadline|closing date|apply by)\s*:?\s*', '', text, flags=re.I)
        text = text.strip()
        
        # Reject if it's just a label
        invalid_values = ['title', 'location', 'deadline', 'closing date', 'apply by', 'n/a', 'na', '-', '—', '']
        if text.lower() in invalid_values:
            return None
        
        return text if text else None
    
    @staticmethod
    def parse_deadline(deadline_text: str) -> Optional[date]:
        """
        Parse deadline text to date object.
        
        Supports multiple date formats commonly used in job listings.
        """
        if not deadline_text or deadline_text.lower() in ['n/a', 'na', '-', '—', '']:
            return None
        
        # Common date formats
        date_formats = [
            r'(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})',  # DD-MM-YYYY or DD/MM/YYYY
            r'(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})',  # DD MMM YYYY
            r'([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})',  # MMM DD, YYYY
            r'(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})',  # DD-MMM-YY
        ]
        
        # Try regex patterns first
        for pattern in date_formats:
            match = re.search(pattern, deadline_text)
            if match:
                try:
                    parsed = date_parser.parse(deadline_text, fuzzy=True)
                    return parsed.date()
                except:
                    continue
        
        # Fallback to dateutil fuzzy parsing
        try:
            parsed = date_parser.parse(deadline_text, fuzzy=True)
            return parsed.date()
        except:
            logger.warning(f"Failed to parse deadline: '{deadline_text}'")
            return None
    
    @staticmethod
    def parse_table_header(header_row) -> Dict[str, int]:
        """
        Parse table header row to map column names to indices.
        
        Returns:
            Dict mapping field names (title, location, deadline, etc.) to column indices
        """
        column_map = {}
        cells = header_row.find_all(['th', 'td'])
        
        for idx, cell in enumerate(cells):
            cell_text = cell.get_text().lower().strip()
            
            # Map common column names (more specific matching to avoid false positives)
            # Title/Position column
            if any(kw in cell_text for kw in ['title', 'position', 'post', 'job title', 'job position']):
                if 'title' not in column_map:  # Don't overwrite if already found
                    column_map['title'] = idx
            # Location column
            elif any(kw in cell_text for kw in ['location', 'place', 'city', 'country', 'duty station']):
                if 'location' not in column_map:
                    column_map['location'] = idx
            # Deadline column
            elif any(kw in cell_text for kw in ['deadline', 'closing', 'apply by', 'expire', 'closing date', 'application deadline']):
                if 'deadline' not in column_map:
                    column_map['deadline'] = idx
            # Reference column
            elif any(kw in cell_text for kw in ['reference', 'ref', 'id', 'job id', 'vacancy id']):
                if 'reference' not in column_map:
                    column_map['reference'] = idx
            # Apply/Link column
            elif any(kw in cell_text for kw in ['apply', 'link', 'url', 'details', 'view']):
                if 'apply' not in column_map:
                    column_map['apply'] = idx
        
        return column_map


# Global extractor instance
field_extractor = FieldExtractor()

