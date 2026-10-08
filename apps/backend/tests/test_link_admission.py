"""Listing-link admission. Repeated numeric detail templates drop one-off pages."""
from crawler_v2.simple_crawler import restrict_to_repeated_detail_templates

_LISTING = "https://jobs.unicef.org/en-us/listing/"
_JOB = "https://jobs.unicef.org/en-us/job/"
_VACANCIES = [
    (
        "Child Protection Specialist, (P-3), Gaza",
        _JOB + "596176/child-protection-specialist-p3-ft-137773-gaza",
    ),
    (
        "National Communication and Advocacy Intern",
        _JOB + "596164/national-communication-and-advocacy-intern",
    ),
    (
        "Consultoría Lineamientos Técnicos, La Paz",
        _JOB + "596152/consultoría-lineamientos-técnicos",
    ),
    (
        "Consultation nationale, Tunis",
        _JOB + "596183/consultation-nationale-tunis",
    ),
]
_JUNK = [
    ("Internship programme", "https://www.unicef.org/careers/internships"),
    ("Job categories", "https://www.unicef.org/careers/unicef-job-categories"),
    (
        "Learning and development",
        "https://www.unicef.org/careers/professional-and-career-development",
    ),
    ("Visit us on Twitter", "https://twitter.com/unicef"),
    ("Visit us on LinkedIn", "https://www.linkedin.com/company/unicef/life"),
    ("Visit us on YouTube", "https://www.youtube.com/c/UNICEFCareers"),
    ("Visit us on Facebook", "https://www.facebook.com/UNICEFCareers"),
    ("Powered by PageUp", "https://www.pageuppeople.com/powered-by-pageup"),
    (
        "Report fraud, abuse, wrongdoing",
        "https://www.unicef.org/auditandinvestigation/report-wrongdoing",
    ),
]


def _jobs(pairs):
    return [{"title": title, "apply_url": url, "listing": _LISTING} for title, url in pairs]


def test_repeated_unicef_detail_template_drops_one_off_pages():
    admitted = restrict_to_repeated_detail_templates(_jobs(_VACANCIES + _JUNK))
    assert [job["apply_url"] for job in admitted] == [url for _title, url in _VACANCIES]


def test_two_repeated_detail_templates_are_both_kept():
    first = [
        ("Role A", "https://jobs.example.org/en-us/job/10/role-a"),
        ("Role B", "https://jobs.example.org/en-us/job/11/role-b"),
    ]
    second = [
        ("Post A", "https://boards.example.org/vacancy/20/post-a"),
        ("Post B", "https://boards.example.org/vacancy/21/post-b"),
    ]
    junk = [("About", "https://example.org/careers/about")]
    admitted = restrict_to_repeated_detail_templates(_jobs(first + second + junk))
    assert [job["apply_url"] for job in admitted] == [url for _title, url in first + second]


def test_listing_without_a_repeated_detail_template_stays_permissive():
    pairs = [
        ("Only vacancy", "https://jobs.example.org/en-us/job/596176/only-role"),
        ("Internship programme", "https://www.unicef.org/careers/internships"),
        ("Our work in schools", "https://example.org/stories/school-programme"),
        ("How to apply", "https://example.org/how-to-apply"),
    ]
    admitted = restrict_to_repeated_detail_templates(_jobs(pairs))
    assert [job["apply_url"] for job in admitted] == [url for _title, url in pairs]
