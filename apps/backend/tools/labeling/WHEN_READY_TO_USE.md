# Classifier Labeling Pipeline - Usage Guide (When Ready)

## Current Status

⚠️ **Not in use yet** - The labeling pipeline is implemented and ready, but we're waiting for correct/real data before using it.

## When You Have Correct Data

Follow these steps to train the classifier:

### Step 1: Prepare Your Data

You'll need 200+ pages with correct labels. Options:

**Option A: Use Real Production Data**
- Export URLs from your `jobs` table that you know are correctly classified
- Export URLs from failed crawls or validation errors
- Mix of job pages and non-job pages

**Option B: Manual Collection**
- Visit actual job board sites
- Collect URLs of job pages and non-job pages
- Save them with their correct labels

### Step 2: Generate Labeling Batch

```bash
cd apps/backend
python scripts/generate_labeling_batch.py
```

This creates `tools/labeling/labeling_batch.csv` with 200 candidate pages.

**To use your own data:**
- Modify `scripts/generate_labeling_batch.py` to pull from your database
- Or manually create `labeling_batch.csv` with columns: `url, raw_html_snippet, suggested_label, label`

### Step 3: Label the Pages

**Option A: Web UI (Recommended)**
```bash
cd apps/backend/tools/labeling
pip install flask  # if not already installed
python app.py
# Open http://localhost:5000
```

**Option B: CSV Editing**
- Open `tools/labeling/labeling_batch.csv` in Excel/Google Sheets
- Fill in the `label` column with `job` or `not_job`
- Save as `tools/labeling/labels/labels.csv` with columns: `url, label, labeled_by, labeled_at`

### Step 4: Convert to Training Format

```bash
cd apps/backend
python scripts/convert_labels_for_training.py
```

This creates `tools/labeling/training_data.csv`

### Step 5: Train the Classifier

```bash
cd apps/backend
python scripts/build_classifier.py
```

This will:
- Train TF-IDF + LogisticRegression model
- Save to `models/job_classifier_v1.pkl`
- Generate `report/classifier_metrics.json` with metrics

### Step 6: Verify Results

```bash
# Check metrics
cat apps/backend/report/classifier_metrics.json

# Run tests
cd apps/backend
python -m pytest tests/test_classifier_training.py tests/unit/test_rule_based_classifier.py -v
```

### Step 7: Integrate into Pipeline

Once trained, the model can be loaded in `pipeline/classifier.py`:

```python
from pipeline.classifier import JobPageClassifier

classifier = JobPageClassifier(use_ml=True)  # Enable ML model
is_job, confidence = classifier.classify(html, soup, url)
```

## Data Requirements

- **Minimum:** 20 labeled examples (10 job, 10 not-job)
- **Recommended:** 200+ examples (balanced: ~100 job, ~100 not-job)
- **Quality:** Labels must be accurate - bad labels = bad model

## Quality Checklist

Before training, ensure:
- ✅ Labels are accurate (verified by human review)
- ✅ Balanced dataset (~50% job, ~50% not-job)
- ✅ Representative of real-world pages
- ✅ No duplicate URLs
- ✅ HTML snippets are complete and meaningful

## Troubleshooting

**Low F1 Score (<0.5):**
- Add more training data
- Check label quality
- Ensure balanced dataset

**Model Not Loading:**
- Check `models/job_classifier_v1.pkl` exists
- Verify file permissions
- Check model version matches code

**Poor Classification:**
- Retrain with more/better data
- Review misclassified examples
- Adjust feature extraction if needed

## Next Steps When Ready

1. Collect 200+ real, correctly labeled pages
2. Follow steps 1-7 above
3. Test on a small subset first
4. Monitor classifier performance in production
5. Retrain periodically with new data

## Files Reference

- `tools/labeling/labeling_batch.csv` - Input: pages to label
- `tools/labeling/labels/labels.csv` - Output: human labels
- `tools/labeling/training_data.csv` - Converted training format
- `models/job_classifier_v1.pkl` - Trained model
- `report/classifier_metrics.json` - Training metrics

