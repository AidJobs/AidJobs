# Job Page Classification Labeling Tools

This directory contains tools for labeling web pages as job listings or non-job pages to train a machine learning classifier.

## Files

- `labeling_batch.csv` - 200 candidate pages for labeling (pre-filled with suggested labels)
- `labeling_instructions.md` - Guidelines for human labelers
- `app.py` - Flask web UI for labeling (optional)
- `labels/labels.csv` - Final labeled dataset (created after labeling)

## Quick Start

### Option 1: Web UI (Recommended)

1. Install Flask (if not already installed):
   ```bash
   pip install flask
   # Or use requirements-dev.txt
   pip install -r requirements-dev.txt
   ```

2. Start the labeling UI:
   ```bash
   cd apps/backend/tools/labeling
   python app.py
   ```

3. Open your browser to `http://localhost:5000`

4. Label pages by clicking "✓ Job" or "✗ Not Job" buttons

5. Labels are automatically saved to `labels/labels.csv`

### Option 2: CSV Editing (Bulk)

1. Open `labeling_batch.csv` in a spreadsheet editor (Excel, Google Sheets, etc.)

2. Fill in the `label` column with:
   - `job` for job listing pages
   - `not_job` for non-job pages

3. Export as CSV and save to `labels/labels.csv` with columns: `url, label, labeled_by, labeled_at`

   Example:
   ```csv
   url,label,labeled_by,labeled_at
   https://example.com/job/1,job,human_labeler,2025-01-05T18:00:00Z
   https://example.com/about,not_job,human_labeler,2025-01-05T18:00:00Z
   ```

## Bulk Import/Export

### Import Labels

If you have labels in a different format, convert them to match `labels/labels.csv` format:

```csv
url,label,labeled_by,labeled_at
https://example.com/page1,job,import_script,2025-01-05T18:00:00Z
https://example.com/page2,not_job,import_script,2025-01-05T18:00:00Z
```

### Export Labels

Labels are stored in `labels/labels.csv`. You can:
- Copy the file to backup
- Open in Excel/Google Sheets for review
- Use for training (see `scripts/convert_labels_for_training.py`)

## Next Steps

After labeling:

1. **Convert labels to training format:**
   ```bash
   python scripts/convert_labels_for_training.py
   ```

2. **Train the classifier:**
   ```bash
   python scripts/build_classifier.py
   ```

3. **Check metrics:**
   ```bash
   cat report/classifier_metrics.json
   ```

## Labeling Guidelines

See `labeling_instructions.md` for detailed guidelines on:
- What constitutes a job page
- What constitutes a non-job page
- Common patterns to look for
- Quality checks

## Troubleshooting

**Flask not found:**
```bash
pip install flask
```

**Labels not saving:**
- Check that `labels/` directory exists
- Check file permissions
- Verify CSV format matches expected columns

**Web UI not loading:**
- Check that port 5000 is available
- Try a different port: `app.run(port=5001)`

## CSV Format

### labeling_batch.csv
```csv
url,raw_html_snippet,suggested_label,label
https://example.com/job/1,"HTML snippet...",job,
```

### labels/labels.csv (output)
```csv
url,label,labeled_by,labeled_at
https://example.com/job/1,job,web_ui,2025-01-05T18:00:00Z
```

