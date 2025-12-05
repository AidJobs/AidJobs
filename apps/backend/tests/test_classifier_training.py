"""
Unit tests for classifier training pipeline.
"""

import pytest
import csv
import tempfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    import pickle
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    pytest.skip("scikit-learn not available", allow_module_level=True)


def create_test_training_data():
    """Create test training data."""
    # Simple job examples
    job_texts = [
        "Program Officer position. Apply by deadline. Location: New York.",
        "Finance Manager job opening. Submit application. Deadline: March 1.",
        "Senior Program Manager vacancy. Apply now. Duty station: Kabul.",
        "Data Analyst position. Application deadline: April 10.",
        "Communications Officer job. Closing date: May 5.",
    ]
    
    # Simple non-job examples
    non_job_texts = [
        "Welcome to our organization. Learn about our mission.",
        "Candidate login page. Sign in to your account.",
        "Latest news and updates from our programs.",
        "About us. Our history and values.",
        "Contact information. Get in touch with our team.",
    ]
    
    return job_texts + non_job_texts, [1] * 5 + [0] * 5


def test_training_completes():
    """Test that training completes successfully."""
    texts, labels = create_test_training_data()
    
    # Vectorize
    vectorizer = TfidfVectorizer(max_features=100, stop_words='english')
    X = vectorizer.fit_transform(texts)
    
    # Train
    classifier = LogisticRegression(max_iter=1000, random_state=42)
    classifier.fit(X, labels)
    
    # Predict
    predictions = classifier.predict(X)
    
    # Should have some accuracy
    from sklearn.metrics import accuracy_score
    accuracy = accuracy_score(labels, predictions)
    assert accuracy > 0.5, f"Accuracy {accuracy} should be > 0.5"
    
    # Should predict some jobs correctly
    job_predictions = [p for i, p in enumerate(predictions) if labels[i] == 1]
    assert sum(job_predictions) > 0, "Should predict at least some jobs correctly"


def test_training_produces_model():
    """Test that training produces a valid model file."""
    texts, labels = create_test_training_data()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        model_path = Path(tmpdir) / 'test_model.pkl'
        
        # Train
        vectorizer = TfidfVectorizer(max_features=100, stop_words='english')
        X = vectorizer.fit_transform(texts)
        
        classifier = LogisticRegression(max_iter=1000, random_state=42)
        classifier.fit(X, labels)
        
        # Save
        model_data = {
            'vectorizer': vectorizer,
            'classifier': classifier
        }
        
        with open(model_path, 'wb') as f:
            pickle.dump(model_data, f)
        
        # Load and verify
        with open(model_path, 'rb') as f:
            loaded = pickle.load(f)
        
        assert 'vectorizer' in loaded
        assert 'classifier' in loaded
        
        # Test prediction
        test_text = "Program Officer job. Apply now."
        test_vec = loaded['vectorizer'].transform([test_text])
        prediction = loaded['classifier'].predict(test_vec)[0]
        assert prediction in [0, 1]


def test_metrics_calculation():
    """Test that metrics are calculated correctly."""
    texts, labels = create_test_training_data()
    
    vectorizer = TfidfVectorizer(max_features=100, stop_words='english')
    X = vectorizer.fit_transform(texts)
    
    classifier = LogisticRegression(max_iter=1000, random_state=42)
    classifier.fit(X, labels)
    
    predictions = classifier.predict(X)
    
    from sklearn.metrics import f1_score, precision_score, recall_score
    
    f1 = f1_score(labels, predictions, zero_division=0)
    precision = precision_score(labels, predictions, zero_division=0)
    recall = recall_score(labels, predictions, zero_division=0)
    
    # Metrics should be valid numbers
    assert 0 <= f1 <= 1
    assert 0 <= precision <= 1
    assert 0 <= recall <= 1
    
    # For seed data, F1 should be > 0.5
    assert f1 > 0.5, f"F1 score {f1} should be > 0.5 for seed data"


def test_training_data_loading():
    """Test loading training data from CSV."""
    texts, labels = create_test_training_data()
    
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['url', 'html_snippet', 'label', 'label_text'])
        writer.writeheader()
        for i, (text, label) in enumerate(zip(texts, labels)):
            writer.writerow({
                'url': f'https://example.com/{i}',
                'html_snippet': text,
                'label': label,
                'label_text': 'job' if label == 1 else 'not_job'
            })
        csv_path = f.name
    
    # Load
    loaded_texts = []
    loaded_labels = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            loaded_texts.append(row['html_snippet'])
            loaded_labels.append(int(row['label']))
    
    assert len(loaded_texts) == len(texts)
    assert len(loaded_labels) == len(labels)
    assert loaded_labels == labels

