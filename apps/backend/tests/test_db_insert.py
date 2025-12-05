"""
Unit tests for pipeline database insertion.
"""

import pytest
import os
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from pipeline.db_insert import DBInsert, FIELD_MAP
from pipeline.extractor import ExtractionResult, FieldResult


@pytest.fixture
def mock_db_url():
    """Mock database URL."""
    return "postgresql://test:test@localhost/test"


@pytest.fixture
def sample_extraction_result():
    """Create a sample ExtractionResult."""
    result = ExtractionResult("https://example.com/job/123")
    result.set_field('title', FieldResult("Software Engineer", source='jsonld', confidence=0.9))
    result.set_field('employer', FieldResult("Example Org", source='meta', confidence=0.8))
    result.set_field('location', FieldResult("New York, NY", source='heuristic', confidence=0.6))
    result.set_field('deadline', FieldResult("2025-12-31", source='jsonld', confidence=0.9))
    result.set_field('description', FieldResult("Job description here", source='dom', confidence=0.7))
    result.set_field('application_url', FieldResult("https://example.com/apply/123", source='jsonld', confidence=0.9))
    result.is_job = True
    result.dedupe_hash = "abc123"
    return result


class TestDBInsert:
    """Test DBInsert class."""
    
    def test_init_defaults(self, mock_db_url):
        """Test initialization with defaults."""
        with patch.dict(os.environ, {}, clear=True):
            insert = DBInsert(mock_db_url)
            assert insert.use_storage == False
            assert insert.shadow_mode == True
            assert insert.jobs_table == "jobs"
            assert insert.shadow_table == "jobs_side"
    
    def test_init_with_env_vars(self, mock_db_url):
        """Test initialization with environment variables."""
        with patch.dict(os.environ, {
            'EXTRACTION_USE_STORAGE': 'true',
            'EXTRACTION_SHADOW_MODE': 'false',
            'JOBS_TABLE': 'custom_jobs'
        }):
            insert = DBInsert(mock_db_url)
            assert insert.use_storage == True
            assert insert.shadow_mode == False
            assert insert.jobs_table == "custom_jobs"
            assert insert.shadow_table == "custom_jobs"
    
    def test_init_with_params(self, mock_db_url):
        """Test initialization with explicit parameters."""
        insert = DBInsert(
            mock_db_url,
            use_storage=True,
            shadow_mode=False,
            jobs_table="test_jobs"
        )
        assert insert.use_storage == True
        assert insert.shadow_mode == False
        assert insert.jobs_table == "test_jobs"
        assert insert.shadow_table == "test_jobs"
    
    def test_extract_result_to_job_dict(self, mock_db_url, sample_extraction_result):
        """Test conversion of ExtractionResult to job dictionary."""
        insert = DBInsert(mock_db_url, use_storage=True)
        job = insert._extract_result_to_job_dict(sample_extraction_result)
        
        assert job['title'] == "Software Engineer"
        assert job['org_name'] == "Example Org"
        assert job['location_raw'] == "New York, NY"
        assert job['apply_url'] == "https://example.com/apply/123"
        assert job['canonical_hash'] == "abc123"
        assert job['status'] == 'active'
        assert 'fetched_at' in job
        assert 'last_seen_at' in job
    
    def test_extract_result_to_job_dict_missing_fields(self, mock_db_url):
        """Test conversion with missing fields."""
        result = ExtractionResult("https://example.com/job/123")
        result.set_field('title', FieldResult("Test Job", source='dom', confidence=0.7))
        result.is_job = True
        
        insert = DBInsert(mock_db_url, use_storage=True)
        job = insert._extract_result_to_job_dict(result)
        
        assert job['title'] == "Test Job"
        assert job['apply_url'] == "https://example.com/job/123"  # Fallback to URL
        assert 'canonical_hash' in job
    
    def test_insert_job_storage_disabled(self, mock_db_url, sample_extraction_result):
        """Test insert_job when storage is disabled."""
        insert = DBInsert(mock_db_url, use_storage=False)
        result = insert.insert_job(sample_extraction_result)
        
        assert result['success'] == False
        assert result['error'] == 'Storage disabled'
        assert result['job_id'] is None
    
    def test_insert_job_missing_required_fields(self, mock_db_url):
        """Test insert_job with missing required fields."""
        result = ExtractionResult("https://example.com/job/123")
        result.is_job = True
        
        insert = DBInsert(mock_db_url, use_storage=True)
        
        with patch.object(insert, '_get_db_conn'):
            status = insert.insert_job(result)
            assert status['success'] == False
            assert 'Missing required fields' in status['error']
    
    @patch('pipeline.db_insert.psycopg2.connect')
    def test_insert_job_success(self, mock_connect, mock_db_url, sample_extraction_result):
        """Test successful job insertion."""
        # Mock database connection
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_connect.return_value = mock_conn
        
        # Mock existing job check (not found)
        mock_cursor.fetchone.return_value = None
        
        # Mock insert
        mock_cursor.fetchone.side_effect = [
            None,  # First call: check existing
            {'id': 'test-uuid-123'}  # Second call: insert result
        ]
        
        insert = DBInsert(mock_db_url, use_storage=True, shadow_mode=False)
        status = insert.insert_job(sample_extraction_result)
        
        assert status['success'] == True
        assert status['job_id'] == 'test-uuid-123'
        assert status['action'] == 'inserted'
    
    @patch('pipeline.db_insert.psycopg2.connect')
    def test_insert_job_update_existing(self, mock_connect, mock_db_url, sample_extraction_result):
        """Test updating existing job."""
        # Mock database connection
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_connect.return_value = mock_conn
        
        # Mock existing job (found)
        mock_cursor.fetchone.return_value = {'id': 'existing-uuid'}
        
        insert = DBInsert(mock_db_url, use_storage=True, shadow_mode=False)
        status = insert.insert_job(sample_extraction_result)
        
        assert status['success'] == True
        assert status['job_id'] == 'existing-uuid'
        assert status['action'] == 'updated'
    
    def test_insert_jobs_batch(self, mock_db_url, sample_extraction_result):
        """Test batch insertion."""
        insert = DBInsert(mock_db_url, use_storage=True)
        
        results = [sample_extraction_result] * 3
        
        with patch.object(insert, 'insert_job') as mock_insert:
            mock_insert.return_value = {'success': True, 'job_id': 'test-id', 'action': 'inserted'}
            
            counts = insert.insert_jobs_batch(results)
            
            assert counts['inserted'] == 3
            assert counts['updated'] == 0
            assert counts['failed'] == 0
            assert counts['total'] == 3
            assert mock_insert.call_count == 3


class TestFieldMapping:
    """Test field mapping configuration."""
    
    def test_field_map_completeness(self):
        """Test that FIELD_MAP covers all expected fields."""
        expected_fields = [
            'title', 'employer', 'location', 'deadline',
            'description', 'application_url', 'posted_on', 'requirements'
        ]
        
        for field in expected_fields:
            assert field in FIELD_MAP, f"Missing field mapping for {field}"
    
    def test_field_map_values(self):
        """Test that FIELD_MAP values are valid column names."""
        valid_columns = [
            'title', 'org_name', 'location_raw', 'deadline',
            'description_snippet', 'apply_url', 'fetched_at', 'raw_metadata'
        ]
        
        for field, column in FIELD_MAP.items():
            assert column in valid_columns, f"Invalid column name: {column} for field {field}"

