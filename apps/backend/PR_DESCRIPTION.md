# PR Description: feat: classifier labeling kit + training

## Summary

This PR adds a classifier labeling and training pipeline to seed the job-page classifier with labeled data.

## What's included

- `tools/labeling/labeling_instructions.md` — labeling guidelines for human labelers
- `tools/labeling/labeling_batch.csv` — 200 candidate pages (url, raw_html_snippet, suggested_label)
- `tools/labeling/app.py` (optional) — small Flask UI for labeling
- `tools/labeling/README.md` — how to run the UI and labeling flow
- `labels/labels.csv` — output CSV of labeled examples (created after labeling)
- `scripts/convert_labels_for_training.py` — convert labels to training format
- `scripts/build_classifier.py` — trains TF-IDF + LogisticRegression and creates `models/job_classifier_v1.pkl`
- `models/job_classifier_v1.pkl` — trained model (created by script)
- `report/classifier_metrics.json` — training evaluation metrics (precision/recall/f1)
- `tests/test_classifier_training.py` — tests that training runs and artifacts are produced
- `tests/unit/test_rule_based_classifier.py` — unit tests for rule-based prefills
- `requirements-dev.txt` — development dependencies (Flask for UI)

## How to run (short)

1. **Install dev dependencies:**
   ```bash
   cd apps/backend
   pip install -r requirements-dev.txt
   ```

2. **(Optional) Launch labeling UI:**
   ```bash
   cd apps/backend/tools/labeling
   python app.py
   # Open http://localhost:5000 in browser
   ```

3. **After labeling, convert labels to training format:**
   ```bash
   cd apps/backend
   python scripts/convert_labels_for_training.py
   ```

4. **Train the classifier:**
   ```bash
   cd apps/backend
   python scripts/build_classifier.py
   ```

5. **Review metrics:**
   ```bash
   cat apps/backend/report/classifier_metrics.json
   ```

## Alternative: CSV-based labeling

If you prefer to label via CSV instead of the web UI:

1. Open `apps/backend/tools/labeling/labeling_batch.csv` in Excel/Google Sheets
2. Fill in the `label` column with `job` or `not_job`
3. Save as `apps/backend/tools/labeling/labels/labels.csv` with columns: `url, label, labeled_by, labeled_at`
4. Run steps 3-5 above

## Notes & constraints

- This PR does not change production flags or write to production DBs.
- All scripts use deterministic random seeds for reproducibility.
- Minimum 20 labeled examples required for training (target: 200).
- Model will be saved to `models/job_classifier_v1.pkl` after training.
- Metrics include precision, recall, F1 score, and classification report.

## Requested reviewers

- Backend / ML dev to review model training script and requirements
- QA to validate `labeling_batch.csv` and sample labels

## Reports & outputs

- `tools/labeling/labeling_batch.csv` — 200 candidate pages with suggested labels
- `tools/labeling/labels/labels.csv` — (created after human labeling)
- `models/job_classifier_v1.pkl` — (created after training)
- `report/classifier_metrics.json` — (created after training)

## Testing

Run the test suite:
```bash
cd apps/backend
python -m pytest tests/test_classifier_training.py tests/unit/test_rule_based_classifier.py -v
```

## Status

✅ Code implementation: **100% complete**
⏳ Data deliverables: **Pending human labeling**

The pipeline is ready for human labeling. Once labels are added, run the conversion and training scripts to generate the model.

