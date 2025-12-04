"""
Data Quality Scoring Module
Scores jobs on completeness and data quality, flags low-quality jobs for review.
"""

import logging
from typing import Dict, Optional
from datetime import datetime, date

logger = logging.getLogger(__name__)


class DataQualityScorer:
    """
    Scores job data quality based on completeness and accuracy.
    
    Quality factors:
    - Required fields presence (title, apply_url)
    - Optional fields completeness (location, deadline, description)
    - Data validity (URL format, date format, location format)
    - Geocoding status
    - Field consistency
    """
    
    # Field weights for scoring
    FIELD_WEIGHTS = {
        'title': 0.20,
        'apply_url': 0.20,
        'location': 0.15,
        'deadline': 0.15,
        'description': 0.10,
        'org_name': 0.10,
        'geocoding': 0.05,
        'country': 0.05
    }
    
    # Quality thresholds
    HIGH_QUALITY_THRESHOLD = 0.85
    MEDIUM_QUALITY_THRESHOLD = 0.70
    LOW_QUALITY_THRESHOLD = 0.50
    
    def score_job(self, job: Dict) -> Dict:
        """
        Score a single job's data quality.
        
        Args:
            job: Job dictionary with fields
            
        Returns:
            Dict with:
            - score: float (0.0 to 1.0)
            - grade: str ('high', 'medium', 'low')
            - factors: dict of field scores
            - missing_fields: list of missing important fields
            - issues: list of data quality issues
        """
        factors = {}
        missing_fields = []
        issues = []
        total_score = 0.0
        
        # Title (required)
        title = job.get('title', '').strip()
        if title and len(title) >= 5:
            factors['title'] = 1.0
        elif title:
            factors['title'] = 0.5
            issues.append('Title too short')
        else:
            factors['title'] = 0.0
            missing_fields.append('title')
        
        total_score += factors['title'] * self.FIELD_WEIGHTS['title']
        
        # Apply URL (required)
        apply_url = job.get('apply_url', '').strip()
        if apply_url and (apply_url.startswith('http://') or apply_url.startswith('https://')):
            factors['apply_url'] = 1.0
        elif apply_url:
            factors['apply_url'] = 0.5
            issues.append('Invalid URL format')
        else:
            factors['apply_url'] = 0.0
            missing_fields.append('apply_url')
        
        total_score += factors['apply_url'] * self.FIELD_WEIGHTS['apply_url']
        
        # Location
        location = job.get('location_raw', '').strip()
        location_normalized = job.get('location_normalized')
        has_location = bool(location or location_normalized)
        
        if has_location:
            # Check if geocoded
            if job.get('latitude') and job.get('longitude'):
                factors['location'] = 1.0
                factors['geocoding'] = 1.0
            elif job.get('is_remote'):
                factors['location'] = 1.0
                factors['geocoding'] = 1.0
            else:
                factors['location'] = 0.7  # Has location but not geocoded
                factors['geocoding'] = 0.0
        else:
            factors['location'] = 0.0
            factors['geocoding'] = 0.0
            missing_fields.append('location')
        
        total_score += factors['location'] * self.FIELD_WEIGHTS['location']
        total_score += factors['geocoding'] * self.FIELD_WEIGHTS['geocoding']
        
        # Deadline
        deadline = job.get('deadline')
        if deadline:
            # Check if valid date format
            if isinstance(deadline, (date, datetime)):
                factors['deadline'] = 1.0
            elif isinstance(deadline, str) and len(deadline) == 10 and deadline.count('-') == 2:
                factors['deadline'] = 1.0
            else:
                factors['deadline'] = 0.5
                issues.append('Deadline format unclear')
        else:
            factors['deadline'] = 0.0
            missing_fields.append('deadline')
        
        total_score += factors['deadline'] * self.FIELD_WEIGHTS['deadline']
        
        # Description
        description = job.get('description_snippet', '').strip()
        if description and len(description) >= 50:
            factors['description'] = 1.0
        elif description:
            factors['description'] = 0.5
        else:
            factors['description'] = 0.0
            missing_fields.append('description')
        
        total_score += factors['description'] * self.FIELD_WEIGHTS['description']
        
        # Organization name
        org_name = job.get('org_name', '').strip()
        if org_name:
            factors['org_name'] = 1.0
        else:
            factors['org_name'] = 0.0
            missing_fields.append('org_name')
        
        total_score += factors['org_name'] * self.FIELD_WEIGHTS['org_name']
        
        # Country
        country = job.get('country') or job.get('country_iso')
        if country:
            factors['country'] = 1.0
        else:
            factors['country'] = 0.0
        
        total_score += factors['country'] * self.FIELD_WEIGHTS['country']
        
        # Determine grade
        if total_score >= self.HIGH_QUALITY_THRESHOLD:
            grade = 'high'
        elif total_score >= self.MEDIUM_QUALITY_THRESHOLD:
            grade = 'medium'
        elif total_score >= self.LOW_QUALITY_THRESHOLD:
            grade = 'low'
        else:
            grade = 'very_low'
        
        # Additional consistency checks
        if location and not country and not job.get('is_remote'):
            issues.append('Location present but country missing')
        
        if deadline and isinstance(deadline, str):
            try:
                from datetime import datetime
                parsed = datetime.strptime(deadline, '%Y-%m-%d')
                if parsed.date() < date.today():
                    issues.append('Deadline in the past')
            except:
                pass
        
        return {
            'score': round(total_score, 3),
            'grade': grade,
            'factors': factors,
            'missing_fields': missing_fields,
            'issues': issues,
            'needs_review': grade in ['low', 'very_low'] or len(issues) > 0
        }
    
    def score_batch(self, jobs: list[Dict]) -> Dict:
        """
        Score multiple jobs and return aggregate statistics.
        
        Args:
            jobs: List of job dictionaries
            
        Returns:
            Dict with:
            - scores: list of individual scores
            - average_score: float
            - grade_distribution: dict
            - low_quality_count: int
            - common_issues: dict
        """
        scores = []
        grade_counts = {'high': 0, 'medium': 0, 'low': 0, 'very_low': 0}
        issue_counts = {}
        low_quality_jobs = []
        
        for job in jobs:
            result = self.score_job(job)
            scores.append(result['score'])
            grade_counts[result['grade']] += 1
            
            if result['needs_review']:
                low_quality_jobs.append({
                    'title': job.get('title', 'Unknown')[:50],
                    'score': result['score'],
                    'grade': result['grade'],
                    'issues': result['issues'],
                    'missing_fields': result['missing_fields']
                })
            
            # Count issues
            for issue in result['issues']:
                issue_counts[issue] = issue_counts.get(issue, 0) + 1
        
        average_score = sum(scores) / len(scores) if scores else 0.0
        
        return {
            'total_jobs': len(jobs),
            'average_score': round(average_score, 3),
            'grade_distribution': grade_counts,
            'low_quality_count': len(low_quality_jobs),
            'low_quality_jobs': low_quality_jobs[:20],  # Top 20
            'common_issues': dict(sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:10])
        }


# Global instance
_quality_scorer: Optional[DataQualityScorer] = None


def get_quality_scorer() -> DataQualityScorer:
    """Get or create the global quality scorer instance"""
    global _quality_scorer
    
    if _quality_scorer is None:
        _quality_scorer = DataQualityScorer()
    
    return _quality_scorer
