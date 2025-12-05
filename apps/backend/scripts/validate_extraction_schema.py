#!/usr/bin/env python3
"""
Validate extraction results match strict schema.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.extractor import ExtractionResult, FieldResult


def validate_schema(data: dict) -> tuple[bool, list[str]]:
    """Validate extraction result matches strict schema."""
    errors = []
    
    # Required top-level fields
    required_fields = ['url', 'canonical_id', 'extracted_at', 'pipeline_version', 
                      'fields', 'is_job', 'classifier_score', 'dedupe_hash']
    
    for field in required_fields:
        if field not in data:
            errors.append(f"Missing required field: {field}")
    
    # Validate fields structure
    if 'fields' in data:
        required_field_names = ['title', 'employer', 'location', 'posted_on', 
                               'deadline', 'description', 'requirements', 'application_url']
        
        for field_name in required_field_names:
            if field_name not in data['fields']:
                errors.append(f"Missing field in fields: {field_name}")
            else:
                field_data = data['fields'][field_name]
                if not isinstance(field_data, dict):
                    errors.append(f"Field {field_name} is not a dict")
                else:
                    # Check field structure
                    field_required = ['value', 'source', 'confidence', 'raw_snippet']
                    for req in field_required:
                        if req not in field_data:
                            errors.append(f"Field {field_name} missing {req}")
    
    # Validate types
    if 'is_job' in data and not isinstance(data['is_job'], bool):
        errors.append("is_job must be boolean")
    
    if 'classifier_score' in data:
        score = data['classifier_score']
        if not isinstance(score, (int, float)) or not (0 <= score <= 1):
            errors.append("classifier_score must be float between 0 and 1")
    
    return len(errors) == 0, errors


def test_schema():
    """Test schema with sample data."""
    result = ExtractionResult("https://example.com/job/123")
    result.is_job = True
    result.classifier_score = 0.85
    result.set_field('title', FieldResult(
        value="Test Job",
        source='jsonld',
        confidence=0.9,
        raw_snippet="Test Job"
    ))
    
    data = result.to_dict()
    valid, errors = validate_schema(data)
    
    if valid:
        print("✅ Schema validation passed")
        return True
    else:
        print("❌ Schema validation failed:")
        for error in errors:
            print(f"  - {error}")
        return False


if __name__ == '__main__':
    success = test_schema()
    sys.exit(0 if success else 1)

