# Golden Fixtures

This directory contains HTML samples for testing extraction logic.

## Structure

- `success/` - HTML samples that should extract successfully
- `failure/` - HTML samples that currently fail or have issues
- `expected/` - Expected extraction results (JSON) for each fixture

## Naming Convention

- `{source_name}_{date}_{type}.html` - e.g., `unicef_2024_success.html`
- `{source_name}_{date}_{type}.json` - Expected results

## Adding New Fixtures

1. Save HTML sample to appropriate directory
2. Create expected JSON with extracted fields
3. Add test case in `tests/test_extraction.py`

