# Labeling Instructions — Job vs Not-job

## Purpose

Label web pages (or page snippets) as `job` if the page contains a job vacancy or job posting for a position to be filled, otherwise label as `not-job`.

## Label values:

- `job`     — page contains a job posting/vacancy (open role, application link, closing date, requirements).

- `not-job` — page does NOT contain a job posting (e.g., blog post, news article, career tips, contact page, event listing).

## What to look for (positive signals)

- Explicit phrases in title/body: "Job", "Vacancy", "Apply", "Apply by", "Closing date", "Job Posting"

- Structured fields and CTAs: "How to Apply", "Submit application", "Apply online", an email address or link labelled "apply"

- Presence of schema.org JobPosting JSON-LD or meta tags mentioning job roles

- Sections with "Duties", "Requirements", "Qualifications", "Contract type", "Duty Station" etc.

## What to avoid (negative signals)

- News articles, blog posts, event pages, product pages, general advice articles

- Pages that mention jobs generically ("we are hiring") but have no specific posting or application details — treat as `not-job` unless there is a clear open role listed

- Aggregator index pages that only link to job listings (label depends: if this page is an index listing jobs, treat as `job-listing-index` — for this seed dataset, prefer `not-job` unless the page itself is an actionable job posting)

## Edge cases

- **PDFs linked as the primary job**: If the snippet clearly points to a PDF job description with application instructions, label `job`.

- **Job summary without application link**: If the post lists role, duties and closing date, label `job` even if application link missing.

- **Remote/general "we are hiring" careers landing page**: Label `not-job` unless it contains an explicit job posting entry.

## Labeling fields

Each CSV row includes:

- `url` — page URL

- `raw_html_snippet` — relevant snippet of the page or first 2k chars

- `suggested_label` — prefilled label (rule-based); confirm or correct

- `final_label` — (when labeling) `job` or `not-job`

- `labeled_by` — name/email of labeler

- `labeled_at` — ISO timestamp

## Example rows (CSV)

```
url,raw_html_snippet,suggested_label
https://example.org/jobs/123,"<h1>Senior Data Analyst</h1><p>Apply by 15 Dec 2025</p>",job
https://example.org/news/2025/dec/new-program,"<h1>New program launched</h1><p>Details...</p>",not-job
```

## Quality guidelines

- Aim for balanced dataset: ~50% job and ~50% not-job in the 200 rows.

- If unsure about a page, mark as `not-job` and add a short note to `labels/labels_notes.csv` explaining ambiguity.

- Two-pass QA: after initial labeling, have a second reviewer check a random 10% sample for agreement; record inter-annotator agreement.

## How to run the lightweight UI

1. Install dependencies: `pip install -r requirements-dev.txt`

2. From repo root:
   ```bash
   cd apps/backend/tools/labeling
   python app.py
   ```

3. UI opens on localhost:5000 — label rows then click 'Save' to write to `labels/labels.csv`.

## Contact

If you have questions about label definitions, leave a note in `labels/labels_notes.csv` and tag the ML owner for review.
