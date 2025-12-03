# AI/Embeddings-Based Extraction Improvements

## Current Issues with Rule-Based Extraction

1. **Site-Specific Rules Required**: Each new site structure needs custom code
2. **Fragile**: HTML structure changes break extraction
3. **Metadata Contamination**: Title, location, deadline get mixed together
4. **Limited Understanding**: Can't understand context or semantic meaning

## How AI/Embeddings Can Help

### 1. **Semantic Understanding**
- Understand that "Apply by Dec-4-25" is a deadline, not part of a title
- Recognize job titles even when formatted differently
- Identify location patterns across languages and formats

### 2. **Adaptive Extraction**
- Learn from examples without hardcoding rules
- Handle new site structures automatically
- Extract fields even when HTML structure is unclear

### 3. **Data Quality**
- Validate extracted data semantically
- Fix contamination issues (e.g., remove "Apply by" from titles)
- Normalize locations, dates, and other fields

## Implementation Approaches

### Option 1: Hybrid Rule-Based + AI Validation (Recommended)

**Cost**: Low (~$10-50/month)
**Complexity**: Medium
**Accuracy**: High

**How it works**:
1. Use current rule-based extraction to get initial data
2. Use AI to:
   - Clean contaminated fields (remove metadata from titles)
   - Validate and normalize extracted data
   - Fill in missing fields from context

**Implementation**:
```python
# After rule-based extraction
def ai_clean_job(job: Dict) -> Dict:
    """Use AI to clean and validate extracted job data"""
    
    # Clean title - remove contamination
    if 'title' in job:
        prompt = f"""
        Extract the job title from this text. Remove any metadata like "Apply by", "Location", etc.
        
        Text: {job['title']}
        
        Return only the clean job title.
        """
        job['title'] = openai_call(prompt)
    
    # Extract missing fields from description
    if not job.get('location') and job.get('description'):
        prompt = f"""
        Extract the job location from this job description.
        
        Description: {job['description']}
        
        Return the location (city, country) or "Not specified".
        """
        job['location'] = openai_call(prompt)
    
    return job
```

### Option 2: AI-Powered Field Extraction

**Cost**: Medium (~$50-200/month)
**Complexity**: High
**Accuracy**: Very High

**How it works**:
1. Extract raw HTML/text from job listings
2. Use AI to identify and extract structured fields
3. Use embeddings to match similar job structures

**Implementation**:
```python
def ai_extract_job_fields(html_snippet: str) -> Dict:
    """Use AI to extract job fields from HTML"""
    
    prompt = f"""
    Extract job information from this HTML snippet.
    Return JSON with: title, location, deadline, apply_url, organization
    
    HTML:
    {html_snippet}
    
    JSON:
    """
    
    response = openai_call(prompt, response_format="json")
    return json.loads(response)
```

### Option 3: Embeddings-Based Structure Learning

**Cost**: Low-Medium (~$20-100/month)
**Complexity**: Medium-High
**Accuracy**: High

**How it works**:
1. Create embeddings for known job listing structures
2. When crawling new site, find similar structures using vector search
3. Apply extraction patterns from similar sites

**Implementation**:
```python
# Store known extraction patterns with embeddings
def store_extraction_pattern(html_structure: str, extraction_result: Dict):
    embedding = get_embedding(html_structure)
    # Store in Supabase with pgvector
    db.execute("""
        INSERT INTO extraction_patterns (html_structure, embedding, extraction_result)
        VALUES (%s, %s, %s)
    """, (html_structure, embedding, json.dumps(extraction_result)))

# Find similar patterns for new sites
def find_similar_pattern(new_html: str) -> Dict:
    new_embedding = get_embedding(new_html)
    # Vector search in Supabase
    similar = db.execute("""
        SELECT extraction_result
        FROM extraction_patterns
        ORDER BY embedding <=> %s
        LIMIT 1
    """, (new_embedding,))
    return similar[0]['extraction_result']
```

## Recommended Approach: Hybrid System

### Phase 1: AI Data Cleaning (Immediate - Low Cost)

**What**: Use AI to clean contaminated fields after rule-based extraction
**Cost**: ~$10-30/month
**Implementation Time**: 1-2 days

**Benefits**:
- Fixes current UNDP consultancies issue (metadata in titles)
- Improves data quality across all sources
- No changes to existing extraction logic

**Code Example**:
```python
# apps/backend/core/ai_cleaner.py
import openai
from typing import Dict

def clean_job_with_ai(job: Dict) -> Dict:
    """Clean job data using AI"""
    
    # Clean title
    if 'title' in job and job['title']:
        title = job['title']
        # Check if title contains metadata
        if any(marker in title.lower() for marker in ['apply by', 'location', 'deadline']):
            response = openai.chat.completions.create(
                model="gpt-4o-mini",  # Cost-effective
                messages=[{
                    "role": "system",
                    "content": "Extract only the job title. Remove any metadata like 'Apply by', 'Location', 'Deadline'."
                }, {
                    "role": "user",
                    "content": f"Clean this job title: {title}"
                }],
                temperature=0
            )
            job['title'] = response.choices[0].message.content.strip()
    
    # Extract location if missing
    if not job.get('location_raw') and job.get('title'):
        # Try to extract from title if it contains location info
        if any(country in job['title'].upper() for country in ['KENYA', 'UGANDA', 'TANZANIA']):
            # Use regex or simple extraction
            pass
    
    return job
```

### Phase 2: AI Field Extraction (Medium Term)

**What**: Use AI to extract fields when rule-based extraction fails
**Cost**: ~$50-150/month
**Implementation Time**: 1 week

**Benefits**:
- Handles sites that rule-based extraction can't parse
- Reduces need for site-specific code
- Improves coverage

### Phase 3: Embeddings-Based Learning (Long Term)

**What**: Learn extraction patterns using embeddings
**Cost**: ~$20-50/month (storage + queries)
**Implementation Time**: 2-3 weeks

**Benefits**:
- Automatically adapts to new site structures
- Reduces manual configuration
- Scales to hundreds of sources

## Cost Breakdown

### Option 1: AI Cleaning Only
- **OpenRouter/OpenAI API**: ~$0.001-0.01 per job cleaned
- **Volume**: 1000 jobs/day = $1-10/day = $30-300/month
- **Optimization**: Batch processing, caching, only clean when needed

### Option 2: Full AI Extraction
- **OpenRouter/OpenAI API**: ~$0.01-0.05 per job extracted
- **Volume**: 1000 jobs/day = $10-50/day = $300-1500/month
- **Optimization**: Use cheaper models (gpt-4o-mini), cache results

### Option 3: Embeddings + AI
- **Supabase pgvector**: Free (included)
- **OpenAI Embeddings**: ~$0.0001 per embedding
- **OpenRouter/OpenAI API**: Only for difficult cases (~10% of jobs)
- **Total**: ~$50-200/month

## Implementation Priority

### Immediate (This Week)
1. ✅ Fix UNDP extraction (rule-based improvements)
2. ✅ Fix homepage yellow bar
3. 🔄 Add AI cleaning for contaminated titles

### Short Term (Next 2 Weeks)
1. Implement AI field extraction for failed extractions
2. Add embeddings for job structure matching
3. Create extraction pattern database

### Medium Term (Next Month)
1. Full embeddings-based learning system
2. Automatic pattern detection
3. Self-improving extraction

## Code Structure

```
apps/backend/
├── core/
│   ├── ai_cleaner.py          # AI-based data cleaning
│   ├── ai_extractor.py         # AI-based field extraction
│   └── embedding_matcher.py    # Embeddings-based pattern matching
├── crawler_v2/
│   └── simple_crawler.py       # Enhanced with AI fallback
└── services/
    └── extraction_service.py   # Unified extraction interface
```

## Next Steps

1. **Test AI cleaning** on UNDP consultancies data
2. **Measure cost** and accuracy improvements
3. **Implement gradually** - start with cleaning, add extraction later
4. **Monitor** extraction success rates and costs

## Questions to Consider

1. **Budget**: What's your monthly budget for AI services?
2. **Priority**: Fix current issues first, or build future-proof system?
3. **Volume**: How many jobs do you crawl per day?
4. **Accuracy**: What accuracy level is acceptable? (90%? 95%? 99%?)

