# AI Extraction for Different Source Types

## Overview

The AI extraction system is **primarily designed for HTML sources** (where structure is unclear), but can also enhance RSS and API sources when needed.

## Source Type Support

### ✅ HTML Sources (Primary Use Case)

**Why AI is needed:**
- HTML structure varies wildly between sites
- Tables, divs, lists - all different structures
- Metadata contamination (e.g., "Apply by" in titles)
- AI understands context and extracts cleanly

**How it works:**
1. AI analyzes HTML structure
2. Identifies job listing containers
3. Extracts clean title, URL, location, deadline
4. Removes contamination automatically

**Example sites:**
- UNDP (consultancies & jobs)
- MSF
- Save the Children
- BRAC
- Any HTML job board

### ✅ RSS Feeds (Usually Fine Without AI)

**Current status:**
- RSS feeds are already structured (title, link, description)
- Rule-based extraction works well
- AI extraction **not needed by default**

**When AI might help:**
- Messy descriptions with hard-to-parse location/deadline
- Contaminated titles in RSS entries
- Complex nested data in descriptions

**How to enable AI for RSS (if needed):**
- Currently: Rule-based only
- Future: Can add AI cleaning step for descriptions

### ✅ JSON/REST APIs (Usually Fine Without AI)

**Current status:**
- JSON APIs are already structured
- Field mapping works well
- AI extraction **not needed by default**

**When AI might help:**
- Complex nested JSON structures
- Inconsistent field names across endpoints
- Need to extract from description fields

**How to enable AI for APIs (if needed):**
- Currently: Rule-based field mapping
- Future: Can add AI for complex nested structures

## Current Implementation

```
HTML Sources → AI Extraction (primary) → Fallback to rule-based
RSS Sources  → Rule-based extraction (works well)
API Sources  → Rule-based field mapping (works well)
```

## When to Use AI

**✅ Use AI for:**
- HTML job boards (different structures)
- Sites with contaminated data
- Complex HTML layouts
- When rule-based fails

**❌ Don't need AI for:**
- Clean RSS feeds (already structured)
- Well-structured JSON APIs (field mapping works)
- Simple HTML with consistent structure (if rule-based works)

## Cost Considerations

- **HTML sources**: ~$0.000075-0.00015 per job (worth it for reliability)
- **RSS sources**: Usually don't need AI (save cost)
- **API sources**: Usually don't need AI (save cost)

**Recommendation:**
- Use AI for HTML sources (where it's needed)
- Keep rule-based for RSS/API (where it works fine)
- This balances cost and reliability

## Future Enhancements

If RSS/API sources start having issues, we can add:
1. AI cleaning step for RSS descriptions
2. AI parsing for complex JSON structures
3. Hybrid approach: Try rule-based first, AI if needed

But for now, **AI is primarily for HTML sources** where it's most needed.

