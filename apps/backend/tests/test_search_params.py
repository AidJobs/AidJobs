"""
Tests for search endpoint parameter normalization and validation.
"""
import pytest
from app.search import SearchService


class TestSearchParamNormalization:
    """Test parameter normalization for search endpoint."""
    
    def test_country_iso_passthrough(self):
        """Test that ISO-2 country codes pass through unchanged."""
        service = SearchService()
        filters = service._normalize_filters(country="US")
        assert filters.get('country_iso') == "US"
    
    def test_country_name_to_iso(self):
        """Test country name normalization to ISO-2."""
        service = SearchService()
        
        filters = service._normalize_filters(country="Kenya")
        assert filters.get('country_iso') == "KE"
        
        filters = service._normalize_filters(country="united states")
        assert filters.get('country_iso') == "US"
    
    def test_level_normalization(self):
        """Test job level normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(level_norm="entry")
        assert filters.get('level_norm') == "junior"
        
        filters = service._normalize_filters(level_norm="Sr")
        assert filters.get('level_norm') == "senior"
        
        filters = service._normalize_filters(level_norm="mid")
        assert filters.get('level_norm') == "mid"
    
    def test_mission_tags_normalization(self):
        """Test mission tags normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(mission_tags=["health", "EDUCATION", "food_security"])
        tags = filters.get('mission_tags')
        assert "health" in tags
        assert "education" in tags
        assert "food_security" in tags
    
    def test_mission_tags_filters_unknown(self):
        """Test that unknown mission tags are filtered out."""
        service = SearchService()
        
        filters = service._normalize_filters(mission_tags=["health", "unknown_tag", "education"])
        tags = filters.get('mission_tags')
        assert "health" in tags
        assert "education" in tags
        assert "unknown_tag" not in tags
    
    def test_work_modality_normalization(self):
        """Test work modality normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(work_modality="remote")
        assert filters.get('work_modality') == "remote"
        
        filters = service._normalize_filters(work_modality="on-site")
        assert filters.get('work_modality') == "onsite"
        
        filters = service._normalize_filters(work_modality="WFH")
        assert filters.get('work_modality') == "remote"
    
    def test_international_eligible_normalization(self):
        """Test boolean normalization for international_eligible."""
        service = SearchService()
        
        filters = service._normalize_filters(international_eligible=True)
        assert filters.get('international_eligible') is True
        
        filters = service._normalize_filters(international_eligible=False)
        assert filters.get('international_eligible') is False
    
    def test_benefits_normalization(self):
        """Test benefits normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(benefits=["health_insurance", "pension"])
        benefits = filters.get('benefits')
        assert "health_insurance" in benefits
        assert "pension" in benefits
    
    def test_benefits_filters_unknown(self):
        """Test that unknown benefits are filtered out."""
        service = SearchService()
        
        filters = service._normalize_filters(benefits=["health_insurance", "unknown_benefit"])
        benefits = filters.get('benefits', [])
        assert "health_insurance" in benefits
        assert "unknown_benefit" not in benefits
    
    def test_policy_flags_normalization(self):
        """Test policy flags normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(policy_flags=["pay_transparent", "disability_friendly"])
        policies = filters.get('policy_flags', [])
        assert "pay_transparent" in policies
        assert "disability_friendly" in policies
    
    def test_donor_context_normalization(self):
        """Test donor context normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(donor_context=["usaid", "giz"])
        donors = filters.get('donor_context')
        assert "usaid" in donors
        assert "giz" in donors
    
    def test_career_type_normalization(self):
        """Test career type is lowercased and stripped."""
        service = SearchService()
        
        filters = service._normalize_filters(career_type="  Full-Time  ")
        assert filters.get('career_type') == "full-time"
    
    def test_org_type_normalization(self):
        """Test org type is lowercased and stripped."""
        service = SearchService()
        
        filters = service._normalize_filters(org_type="  INGO  ")
        assert filters.get('org_type') == "ingo"
    
    def test_crisis_type_array_normalization(self):
        """Test crisis type array normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(crisis_type=["  Conflict  ", "Natural-Disaster"])
        crisis = filters.get('crisis_type')
        assert "conflict" in crisis
        assert "natural-disaster" in crisis
    
    def test_response_phase_normalization(self):
        """Test response phase normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(response_phase="  Emergency  ")
        assert filters.get('response_phase') == "emergency"
    
    def test_humanitarian_cluster_array_normalization(self):
        """Test humanitarian cluster array normalization."""
        service = SearchService()
        
        filters = service._normalize_filters(humanitarian_cluster=["  Health  ", "WASH"])
        clusters = filters.get('humanitarian_cluster')
        assert "health" in clusters
        assert "wash" in clusters
    
    def test_empty_arrays_not_included(self):
        """Test that empty arrays are not included in normalized filters."""
        service = SearchService()
        
        filters = service._normalize_filters(mission_tags=[])
        assert 'mission_tags' not in filters
        
        filters = service._normalize_filters(benefits=[])
        assert 'benefits' not in filters
    
    def test_none_values_not_included(self):
        """Test that None values are not included in normalized filters."""
        service = SearchService()
        
        filters = service._normalize_filters(
            country=None,
            level_norm=None,
            work_modality=None
        )
        assert 'country_iso' not in filters
        assert 'level_norm' not in filters
        assert 'work_modality' not in filters
    
    def test_multiple_filters_combined(self):
        """Test multiple filters are normalized correctly together."""
        service = SearchService()
        
        filters = service._normalize_filters(
            country="Kenya",
            level_norm="senior",
            mission_tags=["health", "education"],
            work_modality="remote",
            international_eligible=True,
            benefits=["health_insurance"],
            career_type="Full-Time"
        )
        
        assert filters.get('country_iso') == "KE"
        assert filters.get('level_norm') == "senior"
        assert "health" in filters.get('mission_tags')
        assert filters.get('work_modality') == "remote"
        assert filters.get('international_eligible') is True
        assert "health_insurance" in filters.get('benefits')
        assert filters.get('career_type') == "full-time"
    
    def test_unknown_country_not_included(self):
        """Test that unknown country names are not included."""
        service = SearchService()
        
        filters = service._normalize_filters(country="UnknownCountry")
        assert 'country_iso' not in filters
    
    def test_unknown_level_not_included(self):
        """Test that unknown job levels are not included."""
        service = SearchService()
        
        filters = service._normalize_filters(level_norm="unknown_level")
        assert 'level_norm' not in filters
    
    def test_unknown_modality_not_included(self):
        """Test that unknown work modalities are not included."""
        service = SearchService()
        
        filters = service._normalize_filters(work_modality="unknown_modality")
        assert 'work_modality' not in filters


class TestSearchParamValidation:
    """Test parameter validation for search endpoint."""
    
    @pytest.mark.anyio
    async def test_page_clamping(self):
        """Test that page numbers are clamped to minimum of 1."""
        service = SearchService()
        
        result = await service.search_query(page=0)
        assert result['data']['page'] == 1
        
        result = await service.search_query(page=-5)
        assert result['data']['page'] == 1
        
        result = await service.search_query(page=10)
        assert result['data']['page'] == 10
    
    @pytest.mark.anyio
    async def test_size_clamping(self):
        """Test that size is clamped between 1 and 100."""
        service = SearchService()
        
        result = await service.search_query(size=0)
        assert result['data']['size'] == 1
        
        result = await service.search_query(size=-10)
        assert result['data']['size'] == 1
        
        result = await service.search_query(size=200)
        assert result['data']['size'] == 100
        
        result = await service.search_query(size=50)
        assert result['data']['size'] == 50
    
    @pytest.mark.anyio
    async def test_search_returns_source(self):
        """Test that search results include source field."""
        service = SearchService()
        
        result = await service.search_query()
        assert 'source' in result['data']
        assert result['data']['source'] in ['meili', 'db', 'none']
    
    @pytest.mark.anyio
    async def test_search_graceful_degradation(self):
        """Test that search never throws on invalid params."""
        service = SearchService()
        
        # Should not crash with unknown values
        result = await service.search_query(
            country="InvalidCountry",
            level_norm="InvalidLevel",
            work_modality="InvalidModality"
        )
        
        assert result['status'] == 'ok'
        assert 'data' in result
        assert 'items' in result['data']
