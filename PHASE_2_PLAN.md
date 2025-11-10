# Phase 2 Implementation Plan

## Overview
Phase 2 adds advanced features to the API Source framework:
- Data transforms (lowercase, join, date parsing, map_table)
- Throttling (rate limits, backoff, Retry-After header)
- Enhanced error handling
- Presets endpoint
- Import/Export functionality

## Features to Implement

### 1. Data Transforms
**Priority**: High
**Estimated Time**: 1 day

#### Transforms to Implement:
- `lower` - Convert string to lowercase
- `upper` - Convert string to uppercase
- `strip` - Remove leading/trailing whitespace
- `join` - Join array elements with separator
- `first` - Get first element of array
- `map_table` - Map values using lookup table
- `date_parse` - Parse date strings (iso8601, unix, unix_ms)
- `default` - Set default value if null/empty

#### Implementation:
- Update `apps/backend/crawler/api_fetch.py`
- Enhance `_apply_transforms()` method
- Add transform validation
- Add transform error handling

### 2. Throttling
**Priority**: High
**Estimated Time**: 1 day

#### Features:
- Rate limiting (requests per minute)
- Burst handling
- Retry-After header support
- Exponential backoff
- Per-domain throttling

#### Implementation:
- Update `apps/backend/core/net.py`
- Add throttling logic to HTTPClient
- Add rate limit tracking
- Add backoff handling
- Add Retry-After header support

### 3. Enhanced Error Handling
**Priority**: Medium
**Estimated Time**: 0.5 days

#### Features:
- Better error messages
- Error categorization
- Error retry logic
- Error logging
- Error reporting in admin UI

#### Implementation:
- Update error handling in `api_fetch.py`
- Add error categorization
- Add error logging
- Update admin endpoints to return better errors

### 4. Presets Endpoint
**Priority**: Medium
**Estimated Time**: 0.5 days

#### Features:
- GET `/admin/presets/sources` endpoint
- ReliefWeb Jobs preset
- Custom presets
- Preset validation

#### Implementation:
- Create `apps/backend/app/presets.py`
- Add presets endpoint
- Add ReliefWeb Jobs preset
- Add preset validation

### 5. Import/Export Functionality
**Priority**: Low
**Estimated Time**: 0.5 days

#### Features:
- Export source configuration as JSON
- Import source configuration from JSON
- Validate imported configuration
- Share configurations

#### Implementation:
- Update `apps/backend/app/sources.py`
- Add export endpoint
- Add import endpoint
- Add validation
- Update frontend UI

## Implementation Order

### Day 1: Data Transforms
1. Implement basic transforms (lower, upper, strip)
2. Implement array transforms (join, first)
3. Implement map_table transform
4. Implement date_parse transform
5. Implement default transform
6. Test all transforms

### Day 2: Throttling
1. Implement rate limiting
2. Implement burst handling
3. Implement Retry-After header support
4. Implement exponential backoff
5. Test throttling

### Day 3: Enhanced Error Handling & Presets
1. Enhance error handling
2. Add error categorization
3. Implement presets endpoint
4. Add ReliefWeb Jobs preset
5. Test error handling and presets

### Day 4: Import/Export & Testing
1. Implement import/export functionality
2. Update frontend UI
3. Test all features
4. Fix any issues
5. Update documentation

## Testing Plan

### Unit Tests
- Test each transform individually
- Test throttling logic
- Test error handling
- Test presets endpoint

### Integration Tests
- Test transforms with real API data
- Test throttling with real API calls
- Test error handling with invalid APIs
- Test presets with real APIs

### End-to-End Tests
- Test full workflow with transforms
- Test full workflow with throttling
- Test import/export functionality
- Test presets functionality

## Success Criteria

- [ ] All transforms work correctly
- [ ] Throttling works correctly
- [ ] Error handling is improved
- [ ] Presets endpoint works
- [ ] Import/Export works
- [ ] All tests pass
- [ ] Documentation is updated

## Next Steps

1. Fix admin password issue (5 minutes)
2. Test Phase 1 features (30 minutes)
3. Start Phase 2 implementation (2-3 days)
4. Test Phase 2 features (1 day)
5. Improve admin UI (1-2 days)

## Timeline

- **Day 1**: Data Transforms
- **Day 2**: Throttling
- **Day 3**: Error Handling & Presets
- **Day 4**: Import/Export & Testing
- **Total**: 4 days

## Notes

- Phase 2 builds on Phase 1
- All Phase 1 features must work before starting Phase 2
- Test each feature as it's implemented
- Update documentation as features are added
- Keep backward compatibility with Phase 1

