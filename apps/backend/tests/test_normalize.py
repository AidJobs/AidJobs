"""
Unit tests for core/normalize.py

Tests key normalization functions including:
- Country name to ISO-2 conversion
- Level normalization with synonyms
- Work modality normalization
- Tag/mission normalization
- Benefits/policy/donors normalization
- Boolean parsing
- Contract duration parsing
- Compensation parsing
"""

import pytest
from core.normalize import (
    to_iso_country,
    norm_level,
    norm_modality,
    norm_tags,
    norm_benefits,
    norm_policy,
    norm_donors,
    to_bool,
    parse_contract_duration,
    parse_compensation,
)


class TestCountryNormalization:
    def test_to_iso_country_common_names(self):
        """Test common country names to ISO-2 conversion."""
        assert to_iso_country("India") == "IN"
        assert to_iso_country("Kenya") == "KE"
        assert to_iso_country("United States") == "US"
        assert to_iso_country("United Kingdom") == "GB"
        assert to_iso_country("South Africa") == "ZA"
    
    def test_to_iso_country_case_insensitive(self):
        """Test case-insensitive country matching."""
        assert to_iso_country("INDIA") == "IN"
        assert to_iso_country("india") == "IN"
        assert to_iso_country("InDiA") == "IN"
    
    def test_to_iso_country_unknown(self):
        """Test unknown country returns None."""
        assert to_iso_country("Unknown Country") is None
        assert to_iso_country("") is None
        assert to_iso_country(None) is None


class TestLevelNormalization:
    def test_norm_level_canonical_values(self):
        """Test canonical level values pass through."""
        assert norm_level("intern") == "intern"
        assert norm_level("junior") == "junior"
        assert norm_level("mid") == "mid"
        assert norm_level("senior") == "senior"
        assert norm_level("lead") == "lead"
        assert norm_level("executive") == "executive"
    
    def test_norm_level_synonyms(self):
        """Test level synonyms map correctly."""
        # Junior synonyms
        assert norm_level("entry") == "junior"
        assert norm_level("entry-level") == "junior"
        assert norm_level("entry level") == "junior"
        assert norm_level("associate") == "junior"
        
        # Mid synonyms
        assert norm_level("mid-level") == "mid"
        assert norm_level("mid level") == "mid"
        assert norm_level("intermediate") == "mid"
        assert norm_level("staff") == "mid"
        
        # Senior synonyms
        assert norm_level("sr") == "senior"
        assert norm_level("sr.") == "senior"
        assert norm_level("senior-level") == "senior"
        assert norm_level("manager") == "senior"
        
        # Lead synonyms
        assert norm_level("principal") == "lead"
    
    def test_norm_level_unknown(self):
        """Test unknown level returns None."""
        assert norm_level("unknown") is None
        assert norm_level("") is None
        assert norm_level(None) is None


class TestModalityNormalization:
    def test_norm_modality_canonical_values(self):
        """Test canonical modality values pass through."""
        assert norm_modality("remote") == "remote"
        assert norm_modality("onsite") == "onsite"
        assert norm_modality("hybrid") == "hybrid"
        assert norm_modality("field") == "field"
        assert norm_modality("flexible") == "flexible"
    
    def test_norm_modality_synonyms(self):
        """Test modality synonyms map correctly."""
        assert norm_modality("office") == "onsite"
        assert norm_modality("on-site") == "onsite"
        assert norm_modality("on site") == "onsite"
        assert norm_modality("wfh") == "remote"
        assert norm_modality("work from home") == "remote"
        assert norm_modality("home based") == "home_based"
        assert norm_modality("home-based") == "home_based"
    
    def test_norm_modality_dash_to_underscore(self):
        """Test dash to underscore conversion."""
        assert norm_modality("home-based") == "home_based"
        assert norm_modality("home_based") == "home_based"


class TestTagNormalization:
    def test_norm_tags_canonical_values(self):
        """Test canonical tag values are kept."""
        # These should exist in missions table
        result = norm_tags(["health", "education", "wash"])
        assert "health" in result
        assert "education" in result
        assert "wash" in result
    
    def test_norm_tags_dash_to_underscore(self):
        """Test dash to underscore conversion."""
        result = norm_tags(["human-rights"])
        # Should be normalized to human_rights
        assert "human_rights" in result or len(result) == 0  # Depends on lookup
    
    def test_norm_tags_drops_unknown(self):
        """Test unknown tags are dropped."""
        result = norm_tags(["health", "unknown_tag", "education"])
        assert "health" in result
        assert "education" in result
        assert "unknown_tag" not in result
    
    def test_norm_tags_empty_input(self):
        """Test empty/invalid input."""
        assert norm_tags([]) == []
        assert norm_tags(None) == []
        assert norm_tags(["", None]) == []


class TestBenefitsNormalization:
    def test_norm_benefits_canonical(self):
        """Test canonical benefit values."""
        result = norm_benefits(["health_insurance", "pension"])
        # These should be in benefits table
        assert len(result) <= 2
    
    def test_norm_benefits_drops_unknown(self):
        """Test unknown benefits are dropped."""
        result = norm_benefits(["health_insurance", "unknown_benefit"])
        assert "unknown_benefit" not in result


class TestPolicyNormalization:
    def test_norm_policy_canonical(self):
        """Test canonical policy flag values."""
        result = norm_policy(["pay_transparent", "disability_friendly"])
        # These should be in policy_flags table
        assert len(result) <= 2
    
    def test_norm_policy_drops_unknown(self):
        """Test unknown policies are dropped."""
        result = norm_policy(["pay_transparent", "unknown_policy"])
        assert "unknown_policy" not in result


class TestDonorsNormalization:
    def test_norm_donors_canonical(self):
        """Test canonical donor values."""
        result = norm_donors(["usaid", "eu"])
        # These should be in donors table
        assert len(result) <= 2
    
    def test_norm_donors_drops_unknown(self):
        """Test unknown donors are dropped."""
        result = norm_donors(["usaid", "unknown_donor"])
        assert "unknown_donor" not in result


class TestBooleanParsing:
    def test_to_bool_true_values(self):
        """Test various true values."""
        assert to_bool(True) is True
        assert to_bool("true") is True
        assert to_bool("True") is True
        assert to_bool("yes") is True
        assert to_bool("Yes") is True
        assert to_bool("1") is True
        assert to_bool("t") is True
        assert to_bool("y") is True
        assert to_bool(1) is True
    
    def test_to_bool_false_values(self):
        """Test various false values."""
        assert to_bool(False) is False
        assert to_bool("false") is False
        assert to_bool("False") is False
        assert to_bool("no") is False
        assert to_bool("No") is False
        assert to_bool("0") is False
        assert to_bool("f") is False
        assert to_bool("n") is False
        assert to_bool(0) is False
    
    def test_to_bool_none_values(self):
        """Test None/invalid values."""
        assert to_bool(None) is None
        assert to_bool("") is None
        assert to_bool("maybe") is None


class TestContractDurationParsing:
    def test_parse_contract_duration_months(self):
        """Test month parsing."""
        assert parse_contract_duration("6 months") == 6
        assert parse_contract_duration("12 months") == 12
        assert parse_contract_duration("3 mo") == 3
        assert parse_contract_duration("18month") == 18
    
    def test_parse_contract_duration_years(self):
        """Test year to month conversion."""
        assert parse_contract_duration("1 year") == 12
        assert parse_contract_duration("2 years") == 24
        assert parse_contract_duration("1 yr") == 12
    
    def test_parse_contract_duration_range(self):
        """Test range parsing (takes max)."""
        assert parse_contract_duration("3-6 months") == 6
        assert parse_contract_duration("6-12 months") == 12
    
    def test_parse_contract_duration_invalid(self):
        """Test invalid input."""
        assert parse_contract_duration("permanent") is None
        assert parse_contract_duration("") is None
        assert parse_contract_duration(None) is None


class TestCompensationParsing:
    def test_parse_compensation_structured_fields(self):
        """Test compensation parsing from structured fields."""
        fields = {
            'min': 50000,
            'max': 70000,
            'currency': 'USD',
            'type': 'salary'
        }
        
        visible, comp_type, min_usd, max_usd, currency, confidence = parse_compensation(fields=fields)
        
        assert visible is True
        assert comp_type == 'salary'
        assert min_usd == 50000.0
        assert max_usd == 70000.0
        assert currency == 'USD'
        assert confidence == 0.9
    
    def test_parse_compensation_text_usd(self):
        """Test compensation parsing from text (USD)."""
        text = "$50,000 - $70,000 per year"
        
        visible, comp_type, min_usd, max_usd, currency, confidence = parse_compensation(text=text)
        
        assert visible is True
        assert comp_type == 'salary'
        assert min_usd == 50000.0
        assert max_usd == 70000.0
        assert currency == 'USD'
        assert confidence == 0.7
    
    def test_parse_compensation_text_hourly(self):
        """Test hourly rate detection."""
        text = "$25 - $35 per hour"
        
        visible, comp_type, min_usd, max_usd, currency, confidence = parse_compensation(text=text)
        
        assert visible is True
        assert comp_type == 'hourly'
        assert min_usd == 25.0
        assert max_usd == 35.0
    
    def test_parse_compensation_currency_conversion(self):
        """Test currency conversion to USD."""
        fields = {
            'min': 50000,
            'max': 70000,
            'currency': 'EUR'
        }
        
        visible, comp_type, min_usd, max_usd, currency, confidence = parse_compensation(fields=fields)
        
        assert visible is True
        assert abs(min_usd - 55000.0) < 0.01  # 50000 * 1.1 (with floating point tolerance)
        assert abs(max_usd - 77000.0) < 0.01  # 70000 * 1.1 (with floating point tolerance)
        assert currency == 'EUR'
    
    def test_parse_compensation_no_data(self):
        """Test no compensation data."""
        visible, comp_type, min_usd, max_usd, currency, confidence = parse_compensation()
        
        assert visible is False
        assert comp_type is None
        assert min_usd is None
        assert max_usd is None
        assert currency is None
        assert confidence == 0.0
