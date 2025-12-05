#!/usr/bin/env python3
"""
Convert labels CSV into training format.

Reads labels/labels.csv and prepares data for classifier training.
"""

import os
import sys
import csv
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


def load_labels(labels_path: Path):
    """Load labels from CSV."""
    if not labels_path.exists():
        print(f"⚠️  Labels file not found: {labels_path}")
        return {}
    
    labels = {}
    with open(labels_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = row['url']
            label = row['label'].strip().lower()
            if label in ['job', 'not_job', '1', '0']:
                labels[url] = label
    return labels


def load_batch(batch_path: Path):
    """Load batch CSV with HTML snippets."""
    if not batch_path.exists():
        print(f"⚠️  Batch file not found: {batch_path}")
        return []
    
    pages = []
    with open(batch_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pages.append(row)
    return pages


def prepare_training_data(labels_path: Path, batch_path: Path, output_path: Path):
    """Prepare training data from labels and batch."""
    labels = load_labels(labels_path)
    batch = load_batch(batch_path)
    
    if not labels:
        print("❌ No labels found. Please label pages first.")
        return False
    
    if not batch:
        print("❌ No batch data found.")
        return False
    
    # Match labels with batch data
    training_data = []
    for page in batch:
        url = page['url']
        if url in labels:
            label = labels[url]
            # Normalize label
            if label in ['job', '1']:
                label_value = 1
            elif label in ['not_job', '0']:
                label_value = 0
            else:
                continue  # Skip invalid labels
            
            training_data.append({
                'url': url,
                'html_snippet': page['raw_html_snippet'],
                'label': label_value,
                'label_text': 'job' if label_value == 1 else 'not_job'
            })
    
    if not training_data:
        print("❌ No matching labeled data found.")
        return False
    
    # Write training data
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['url', 'html_snippet', 'label', 'label_text'])
        writer.writeheader()
        writer.writerows(training_data)
    
    job_count = sum(1 for d in training_data if d['label'] == 1)
    not_job_count = len(training_data) - job_count
    
    print(f"✅ Prepared {len(training_data)} training examples")
    print(f"   Jobs: {job_count}, Not Jobs: {not_job_count}")
    print(f"   Saved to: {output_path}")
    
    return True


if __name__ == '__main__':
    base_dir = Path(__file__).parent.parent
    labels_path = base_dir / 'tools' / 'labeling' / 'labels' / 'labels.csv'
    batch_path = base_dir / 'tools' / 'labeling' / 'labeling_batch.csv'
    output_path = base_dir / 'tools' / 'labeling' / 'training_data.csv'
    
    success = prepare_training_data(labels_path, batch_path, output_path)
    sys.exit(0 if success else 1)

