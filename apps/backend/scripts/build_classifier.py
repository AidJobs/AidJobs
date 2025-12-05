#!/usr/bin/env python3
"""
Build and train job page classifier.

Trains TF-IDF + logistic regression model and saves to models/job_classifier_v1.pkl
"""

import os
import sys
import csv
import pickle
import json
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report
except ImportError:
    print("❌ scikit-learn not installed. Install with: pip install scikit-learn")
    sys.exit(1)


def load_training_data(training_path: Path):
    """Load training data from CSV."""
    if not training_path.exists():
        print(f"❌ Training data not found: {training_path}")
        print("   Run scripts/convert_labels_for_training.py first")
        return None, None
    
    texts = []
    labels = []
    
    with open(training_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            texts.append(row['html_snippet'])
            labels.append(int(row['label']))
    
    if not texts:
        print("❌ No training data found in CSV")
        return None, None
    
    return texts, labels


def train_classifier(texts, labels, model_path: Path, min_examples: int = 20):
    """Train classifier model."""
    if len(texts) < min_examples:
        print(f"❌ Need at least {min_examples} examples, got {len(texts)}")
        return False
    
    # Check label distribution
    label_counts = Counter(labels)
    print(f"\nTraining data:")
    print(f"  Total examples: {len(texts)}")
    print(f"  Jobs (1): {label_counts[1]}")
    print(f"  Not Jobs (0): {label_counts[0]}")
    
    if label_counts[1] < 5 or label_counts[0] < 5:
        print("⚠️  Warning: Very imbalanced dataset. Model may not perform well.")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )
    
    print(f"\nSplit:")
    print(f"  Training: {len(X_train)} examples")
    print(f"  Testing: {len(X_test)} examples")
    
    # Vectorize
    print("\nVectorizing text...")
    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words='english',
        ngram_range=(1, 2),  # Unigrams and bigrams
        min_df=2,  # Minimum document frequency
        max_df=0.95  # Maximum document frequency
    )
    
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)
    
    print(f"  Vocabulary size: {len(vectorizer.vocabulary_)}")
    
    # Train model
    print("\nTraining classifier...")
    classifier = LogisticRegression(
        max_iter=1000,
        random_state=42,
        class_weight='balanced'  # Handle imbalanced data
    )
    
    classifier.fit(X_train_vec, y_train)
    
    # Evaluate
    print("\nEvaluating...")
    y_train_pred = classifier.predict(X_train_vec)
    y_test_pred = classifier.predict(X_test_vec)
    
    train_accuracy = accuracy_score(y_train, y_train_pred)
    test_accuracy = accuracy_score(y_test, y_test_pred)
    
    train_precision = precision_score(y_train, y_train_pred, zero_division=0)
    test_precision = precision_score(y_test, y_test_pred, zero_division=0)
    
    train_recall = recall_score(y_train, y_train_pred, zero_division=0)
    test_recall = recall_score(y_test, y_test_pred, zero_division=0)
    
    train_f1 = f1_score(y_train, y_train_pred, zero_division=0)
    test_f1 = f1_score(y_test, y_test_pred, zero_division=0)
    
    print(f"\nTraining Metrics:")
    print(f"  Accuracy: {train_accuracy:.3f}")
    print(f"  Precision: {train_precision:.3f}")
    print(f"  Recall: {train_recall:.3f}")
    print(f"  F1: {train_f1:.3f}")
    
    print(f"\nTest Metrics:")
    print(f"  Accuracy: {test_accuracy:.3f}")
    print(f"  Precision: {test_precision:.3f}")
    print(f"  Recall: {test_recall:.3f}")
    print(f"  F1: {test_f1:.3f}")
    
    print(f"\nClassification Report:")
    print(classification_report(y_test, y_test_pred, target_names=['Not Job', 'Job']))
    
    # Save model
    model_data = {
        'vectorizer': vectorizer,
        'classifier': classifier,
        'version': 'v1',
        'training_size': len(texts),
        'vocab_size': len(vectorizer.vocabulary_)
    }
    
    model_path.parent.mkdir(parents=True, exist_ok=True)
    with open(model_path, 'wb') as f:
        pickle.dump(model_data, f)
    
    print(f"\n✅ Model saved to: {model_path}")
    
    # Save metrics
    metrics = {
        'model_version': 'v1',
        'training_size': len(texts),
        'test_size': len(X_test),
        'vocab_size': len(vectorizer.vocabulary_),
        'train_metrics': {
            'accuracy': float(train_accuracy),
            'precision': float(train_precision),
            'recall': float(train_recall),
            'f1': float(train_f1)
        },
        'test_metrics': {
            'accuracy': float(test_accuracy),
            'precision': float(test_precision),
            'recall': float(test_recall),
            'f1': float(test_f1)
        },
        'label_distribution': {
            'job': int(label_counts[1]),
            'not_job': int(label_counts[0])
        }
    }
    
    metrics_path = Path(__file__).parent.parent / 'report' / 'classifier_metrics.json'
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"✅ Metrics saved to: {metrics_path}")
    
    # Check if F1 meets threshold
    if test_f1 < 0.5:
        print(f"\n⚠️  Warning: Test F1 ({test_f1:.3f}) is below 0.5 threshold")
        print("   Consider adding more training data or improving features")
    else:
        print(f"\n✅ Test F1 ({test_f1:.3f}) meets threshold (≥0.5)")
    
    return True


def main():
    """Main function."""
    base_dir = Path(__file__).parent.parent
    training_path = base_dir / 'tools' / 'labeling' / 'training_data.csv'
    model_path = base_dir / 'models' / 'job_classifier_v1.pkl'
    
    # Load training data
    texts, labels = load_training_data(training_path)
    if texts is None:
        sys.exit(1)
    
    # Train model
    success = train_classifier(texts, labels, model_path)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()

