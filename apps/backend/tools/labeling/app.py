#!/usr/bin/env python3
"""
Tiny web labeling UI for job page classification.

Simple Flask app to label pages for classifier training.
"""

import os
import csv
from datetime import datetime
from pathlib import Path
from flask import Flask, render_template_string, request, redirect, url_for

app = Flask(__name__)

# Paths
BASE_DIR = Path(__file__).parent
BATCH_CSV = BASE_DIR / 'labeling_batch.csv'
LABELS_CSV = BASE_DIR / 'labels' / 'labels.csv'

# Ensure labels directory exists
LABELS_CSV.parent.mkdir(parents=True, exist_ok=True)


def load_batch():
    """Load labeling batch CSV."""
    if not BATCH_CSV.exists():
        return []
    
    rows = []
    with open(BATCH_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def save_label(url: str, label: str, labeled_by: str = 'web_ui'):
    """Save a label."""
    # Load existing labels
    labels = {}
    if LABELS_CSV.exists():
        with open(LABELS_CSV, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                labels[row['url']] = {
                    'label': row.get('label', ''),
                    'labeled_by': row.get('labeled_by', ''),
                    'labeled_at': row.get('labeled_at', '')
                }
    
    # Update label
    labels[url] = {
        'label': label,
        'labeled_by': labeled_by,
        'labeled_at': datetime.utcnow().isoformat() + 'Z'
    }
    
    # Save all labels
    with open(LABELS_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['url', 'label', 'labeled_by', 'labeled_at'])
        writer.writeheader()
        for url_key, label_data in labels.items():
            writer.writerow({
                'url': url_key,
                'label': label_data['label'],
                'labeled_by': label_data['labeled_by'],
                'labeled_at': label_data['labeled_at']
            })


def get_label(url: str) -> str:
    """Get existing label for URL."""
    if not LABELS_CSV.exists():
        return ''
    
    with open(LABELS_CSV, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['url'] == url:
                return row.get('label', '')
    return ''


HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Job Page Labeling</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .page { border: 1px solid #ddd; padding: 20px; margin: 20px 0; }
        .url { color: #0066cc; font-weight: bold; margin-bottom: 10px; }
        .snippet { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; white-space: pre-wrap; }
        .suggested { color: #666; font-style: italic; }
        .buttons { margin: 20px 0; }
        .btn { padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
        .btn-job { background: #4CAF50; color: white; }
        .btn-not-job { background: #f44336; color: white; }
        .btn-skip { background: #999; color: white; }
        .current-label { background: #e3f2fd; padding: 10px; border-radius: 5px; margin: 10px 0; }
        .stats { background: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <h1>Job Page Classification Labeling</h1>
    
    <div class="stats">
        <strong>Progress:</strong> {{ current_index + 1 }} / {{ total_pages }}<br>
        <strong>Labeled:</strong> {{ labeled_count }}<br>
        <strong>Remaining:</strong> {{ remaining_count }}
    </div>
    
    {% if current_page %}
    <div class="page">
        <div class="url">URL: {{ current_page.url }}</div>
        <div class="suggested">Suggested: {{ current_page.suggested_label }}</div>
        {% if current_label %}
        <div class="current-label">Current Label: <strong>{{ current_label }}</strong></div>
        {% endif %}
        <div class="snippet">{{ current_page.raw_html_snippet }}</div>
        <div class="buttons">
            <form method="post" style="display: inline;">
                <input type="hidden" name="url" value="{{ current_page.url }}">
                <button type="submit" name="label" value="job" class="btn btn-job">✓ Job</button>
                <button type="submit" name="label" value="not_job" class="btn btn-not-job">✗ Not Job</button>
                <button type="submit" name="label" value="skip" class="btn btn-skip">Skip</button>
            </form>
        </div>
    </div>
    
    <div style="margin-top: 30px;">
        {% if current_index > 0 %}
        <a href="?index={{ current_index - 1 }}">← Previous</a>
        {% endif %}
        {% if current_index < total_pages - 1 %}
        <a href="?index={{ current_index + 1 }}" style="margin-left: 20px;">Next →</a>
        {% endif %}
    </div>
    {% else %}
    <p>No pages to label. Generate labeling_batch.csv first.</p>
    {% endif %}
    
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
        <a href="/export">Export Labels CSV</a>
    </div>
</body>
</html>
"""


@app.route('/')
def index():
    """Main labeling interface."""
    batch = load_batch()
    if not batch:
        return render_template_string(HTML_TEMPLATE, current_page=None, current_index=0, total_pages=0, labeled_count=0, remaining_count=0)
    
    # Get current index
    index = int(request.args.get('index', 0))
    index = max(0, min(index, len(batch) - 1))
    
    current_page = batch[index]
    current_label = get_label(current_page['url'])
    
    # Count labeled
    labeled_count = sum(1 for p in batch if get_label(p['url']))
    remaining_count = len(batch) - labeled_count
    
    return render_template_string(
        HTML_TEMPLATE,
        current_page=current_page,
        current_index=index,
        total_pages=len(batch),
        labeled_count=labeled_count,
        remaining_count=remaining_count,
        current_label=current_label
    )


@app.route('/', methods=['POST'])
def save():
    """Save a label."""
    url = request.form.get('url')
    label = request.form.get('label')
    
    if url and label and label != 'skip':
        save_label(url, label)
    
    # Redirect to next page
    batch = load_batch()
    current_index = next((i for i, p in enumerate(batch) if p['url'] == url), 0)
    next_index = min(current_index + 1, len(batch) - 1)
    return redirect(url_for('index', index=next_index))


@app.route('/export')
def export():
    """Export labels CSV."""
    if not LABELS_CSV.exists():
        return "No labels to export. Label some pages first."
    
    return redirect(f"/static/{LABELS_CSV.name}")


if __name__ == '__main__':
    print("Starting labeling UI on http://localhost:5000")
    print(f"Batch CSV: {BATCH_CSV}")
    print(f"Labels will be saved to: {LABELS_CSV}")
    app.run(debug=True, port=5000)

