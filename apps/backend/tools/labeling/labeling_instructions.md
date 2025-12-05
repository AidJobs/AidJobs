# Job Page Classification Labeling Instructions

## Purpose

Label web pages as **job listings** or **non-job pages** to train a machine learning classifier.

## Labeling Guidelines

### Label: `job` (1)
A page is a **job** if it contains:
- A specific job opening or position description
- Application instructions or "Apply" button
- Job requirements or qualifications
- Job title and description
- Deadline or closing date for applications

**Examples:**
- "Program Officer - Climate Change" with application link
- "Finance Manager Position" with requirements
- Job listing pages with multiple positions

### Label: `not_job` (0)
A page is **not a job** if it contains:
- Homepage or landing page content
- About us / organization information
- Login or registration forms
- News articles or blog posts
- Contact information
- FAQ pages
- Donation pages
- General program descriptions (without specific job openings)

**Examples:**
- "Welcome to our organization"
- "Candidate Login"
- "Latest News - January 2025"
- "About Our Programs"

## Labeling Process

1. **Read the HTML snippet** (first 500 characters)
2. **Check the URL** for context clues
3. **Determine label**: `job` or `not_job`
4. **Save your label** in the CSV

## Quality Checks

- Be consistent: similar pages should get the same label
- When in doubt, check the URL path (e.g., `/jobs/`, `/careers/` suggests job)
- If a page has both job and non-job content, label based on primary purpose
- Skip pages that are clearly errors or empty

## Common Patterns

**Job indicators:**
- URLs with `/job/`, `/position/`, `/vacancy/`, `/career/`
- Text like "Apply Now", "Submit Application", "Deadline:"
- Job titles followed by descriptions

**Non-job indicators:**
- URLs with `/about/`, `/contact/`, `/login/`, `/news/`
- Text like "Welcome", "Sign In", "Donate"
- General organizational information

