# Classifier Seed Dataset

This directory contains labeled examples for training the job page classifier.

## Structure

- `job_pages/` - HTML files of actual job listing pages (positive examples)
- `non_job_pages/` - HTML files of non-job pages (negative examples)

## Format

Each file should be named with a descriptive identifier and contain the raw HTML.

## Labeling Guidelines

- **Job pages**: Pages that contain job listings, application forms, or job descriptions
- **Non-job pages**: Homepages, about pages, login pages, news articles, etc.

## Target Size

- 200 total pages (100 job, 100 non-job)
- Minimum 50 pages to start training

