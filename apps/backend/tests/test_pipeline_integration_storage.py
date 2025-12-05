"""
Integration tests for pipeline storage integration.

Tests the full flow: extraction -> database insertion -> API retrieval.
"""

import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from pipeline.extractor import Extractor, ExtractionResult
from pipeline.db_insert import DBInsert
from bs4 import BeautifulSoup


@pytest.fixture
def sample_html():
    """Sample HTML with job posting."""
    return """
    <html>
    <head>
        <title>Software Engineer - Example Org</title>
        <script type="application/ld+json">
        {
            "@type": "JobPosting",
            "title": "Software Engineer",
            "description": "We are looking for a software engineer",
            "datePosted": "2025-01-01",
            "validThrough": "2025-12-31",
            "jobLocation": {
                "@type": "Place",
                "address": "New York, NY"
            },
            "hiringOrganization": {
                "@type": "Organization",
                "name": "Example Org"
            }
        }
        </script>
    </head>
    <body>
        <h1>Software Engineer</h1>
        <p>Location: New York, NY</p>
        <p>Deadline: December 31, 2025</p>
        <a href="/apply/123">Apply Now</a>
    </body>
    </html>
    """


@pytest.fixture
def mock_db_url():
    """Mock database URL."""
    return "postgresql://test:test@localhost/test"


class TestPipelineStorageIntegration:
    """Test full pipeline storage integration."""
    
    @pytest.mark.asyncio
    async def test_extract_and_store_disabled(self, sample_html, mock_db_url):
        """Test extraction with storage disabled."""
        extractor = Extractor(
            db_url=mock_db_url,
            enable_storage=False,
            enable_snapshots=False
        )
        
        result = await extractor.extract_from_html(sample_html, "https://example.com/job/123")
        
        assert result.is_job == True
        assert extractor.db_insert is None  # Should not be initialized
    
    @pytest.mark.asyncio
    async def test_extract_and_store_enabled(self, sample_html, mock_db_url):
        """Test extraction with storage enabled."""
        with patch('pipeline.db_insert.DBInsert._get_db_conn') as mock_conn:
            # Mock database connection
            mock_db = MagicMock()
            mock_cursor = MagicMock()
            mock_db.cursor.return_value.__enter__.return_value = mock_cursor
            mock_conn.return_value = mock_db
            
            # Mock existing job check (not found)
            mock_cursor.fetchone.return_value = None
            
            # Mock insert
            mock_cursor.fetchone.side_effect = [
                None,  # Check existing
                {'id': 'test-uuid'}  # Insert result
            ]
            
            extractor = Extractor(
                db_url=mock_db_url,
                enable_storage=True,
                enable_snapshots=False,
                shadow_mode=True
            )
            
            result = await extractor.extract_from_html(sample_html, "https://example.com/job/123")
            
            assert result.is_job == True
            assert extractor.db_insert is not None
            assert extractor.db_insert.shadow_mode == True
    
    @pytest.mark.asyncio
    async def test_extract_non_job_page(self, mock_db_url):
        """Test extraction of non-job page (should not insert)."""
        html = """
        <html>
        <head><title>About Us</title></head>
        <body>
            <h1>About Our Company</h1>
            <p>We are a leading organization...</p>
        </body>
        </html>
        """
        
        extractor = Extractor(
            db_url=mock_db_url,
            enable_storage=True,
            enable_snapshots=False
        )
        
        with patch.object(extractor.db_insert, 'insert_job') as mock_insert:
            result = await extractor.extract_from_html(html, "https://example.com/about")
            
            assert result.is_job == False
            # Should not call insert_job for non-job pages
            mock_insert.assert_not_called()
    
    def test_shadow_mode_table_creation(self, mock_db_url):
        """Test shadow mode table creation."""
        insert = DBInsert(mock_db_url, use_storage=True, shadow_mode=True)
        
        with patch('pipeline.db_insert.psycopg2.connect') as mock_connect:
            mock_conn = MagicMock()
            mock_cursor = MagicMock()
            mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
            mock_connect.return_value = mock_conn
            
            # Test _ensure_shadow_table
            insert._ensure_shadow_table(mock_cursor)
            
            # Should attempt to create table
            mock_cursor.execute.assert_called()
            call_args = mock_cursor.execute.call_args[0][0]
            assert 'CREATE TABLE IF NOT EXISTS' in call_args
            assert 'jobs_side' in call_args


class TestFieldMappingIntegration:
    """Test field mapping between ExtractionResult and jobs table."""
    
    def test_field_mapping_completeness(self):
        """Test that all ExtractionResult fields can be mapped."""
        from pipeline.db_insert import FIELD_MAP
        
        # Create result with all fields
        result = ExtractionResult("https://example.com/job/123")
        for field_name in FIELD_MAP.keys():
            from pipeline.extractor import FieldResult
            result.set_field(field_name, FieldResult(f"test_{field_name}", source='test', confidence=1.0))
        
        # Convert to job dict
        insert = DBInsert("postgresql://test", use_storage=True)
        job = insert._extract_result_to_job_dict(result)
        
        # Verify all mapped fields are present
        for extractor_field, db_column in FIELD_MAP.items():
            if extractor_field == 'requirements':
                # Special case: stored in raw_metadata
                assert 'raw_metadata' in job or job.get('raw_metadata') is not None
            else:
                assert db_column in job or job.get(db_column) is not None


@pytest.mark.integration
class TestEndToEndIntegration:
    """End-to-end integration tests (require database)."""
    
    @pytest.mark.skip(reason="Requires database connection")
    def test_full_extraction_storage_flow(self):
        """Test full flow: extract -> store -> retrieve."""
        # This would require a real database connection
        # Skip in unit tests, run in integration test environment
        pass

