#!/usr/bin/env python3
"""
Retrain the job page classifier using seed dataset.

This script trains a TF-IDF + classifier model on labeled examples.
"""

import os
import sys
from pathlib import Path
import argparse

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
import pickle
import json


def load_training_data(data_dir: Path):
    """Load labeled examples from directory."""
    job_pages_dir = data_dir / 'job_pages'
    non_job_pages_dir = data_dir / 'non_job_pages'
    
    texts = []
    labels = []
    
    # Load job pages (positive examples)
    if job_pages_dir.exists():
        for html_file in job_pages_dir.glob('*.html'):
            with open(html_file, 'r', encoding='utf-8') as f:
                texts.append(f.read())
                labels.append(1)
    
    # Load non-job pages (negative examples)
    if non_job_pages_dir.exists():
        for html_file in non_job_pages_dir.glob('*.html'):
            with open(html_file, 'r', encoding='utf-8') as f:
                texts.append(f.read())
                labels.append(0)
    
    return texts, labels


def train_classifier(data_dir: Path, output_path: Path):
    """Train classifier model."""
    print(f"Loading training data from {data_dir}...")
    texts, labels = load_training_data(data_dir)
    
    if len(texts) < 20:
        print(f"⚠️  Warning: Only {len(texts)} examples found. Need at least 20 for training.")
        return False
    
    print(f"Loaded {len(texts)} examples ({sum(labels)} job pages, {len(labels) - sum(labels)} non-job pages)")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42
    )
    
    # Vectorize
    print("Vectorizing text...")
    vectorizer = TfidfVectorizer(max_features=5000, stop_words='english')
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)
    
    # Train model
    print("Training classifier...")
    classifier = LogisticRegression(max_iter=1000)
    classifier.fit(X_train_vec, y_train)
    
    # Evaluate
    y_pred = classifier.predict(X_test_vec)
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"\n✅ Model trained successfully!")
    print(f"   Accuracy: {accuracy:.2%}")
    print(f"\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['Non-Job', 'Job']))
    
    # Save model
    model_data = {
        'vectorizer': vectorizer,
        'classifier': classifier
    }
    
    with open(output_path, 'wb') as f:
        pickle.dump(model_data, f)
    
    print(f"\n✅ Model saved to {output_path}")
    
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Retrain job page classifier')
    parser.add_argument('--data-dir', type=str, 
                       default='tests/fixtures/classifier_seed',
                       help='Directory with labeled examples')
    parser.add_argument('--output', type=str,
                       default='pipeline/classifier_model.pkl',
                       help='Output model file')
    
    args = parser.parse_args()
    
    data_dir = Path(args.data_dir)
    output_path = Path(args.output)
    
    if not data_dir.exists():
        print(f"❌ Error: Data directory not found: {data_dir}")
        sys.exit(1)
    
    success = train_classifier(data_dir, output_path)
    sys.exit(0 if success else 1)

