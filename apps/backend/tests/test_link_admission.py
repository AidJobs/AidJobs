"""Listing-link admission. Repeated numeric detail templates drop one-off pages."""
from pathlib import Path

from contracts.admission import admit_batch

_BACKEND = Path(__file__).resolve().parents[1]

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
    admitted, _rejected = admit_batch(_jobs(_VACANCIES + _JUNK), "html")
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
    admitted, _rejected = admit_batch(_jobs(first + second + junk), "html")
    assert [job["apply_url"] for job in admitted] == [url for _title, url in first + second]


def test_listing_without_a_repeated_detail_template_admits_nothing():
    pairs = [
        ("Only vacancy", "https://jobs.example.org/en-us/job/596176/only-role"),
        ("Internship programme", "https://www.unicef.org/careers/internships"),
        ("Our work in schools", "https://example.org/stories/school-programme"),
        ("How to apply", "https://example.org/how-to-apply"),
    ]
    admitted, rejected = admit_batch(_jobs(pairs), "html")
    assert admitted == []
    assert len(rejected) == len(pairs)


def _batch(pairs, **fields):
    jobs = []
    for title, url in pairs:
        job = {"title": title, "apply_url": url}
        job.update(fields)
        jobs.append(job)
    return jobs


def _urls(jobs):
    return [job["apply_url"] for job in jobs]


def _reasons(rejected):
    return [reason for _job, reason in rejected]


def test_admit_batch_keeps_repeated_numeric_vacancy_family():
    vacancies = [
        ("Role A", "https://jobs.unicef.org/en-us/job/596188/role-a"),
        ("Role B", "https://jobs.unicef.org/en-us/job/596189/role-b"),
    ]
    junk = [
        ("Internship programme", "https://www.unicef.org/careers/internships"),
        ("Job categories", "https://www.unicef.org/careers/unicef-job-categories"),
        (
            "Learning and development",
            "https://www.unicef.org/careers/professional-and-career-development",
        ),
    ]
    admitted, rejected = admit_batch(_batch(vacancies + junk), "html")
    assert _urls(admitted) == [url for _title, url in vacancies]
    assert all(job["admitted"] is True for job in admitted)
    assert set(_reasons(rejected)) == {"no_qualifying_family"}


def test_admit_batch_keeps_every_qualifying_family():
    first = [
        ("Role A", "https://jobs.example.org/job/123/role-a"),
        ("Role B", "https://jobs.example.org/job/124/role-b"),
    ]
    second = [
        ("Post A", "https://boards.example.org/vacancy/20/post-a"),
        ("Post B", "https://boards.example.org/vacancy/21/post-b"),
    ]
    admitted, rejected = admit_batch(_batch(first + second), "html")
    assert _urls(admitted) == [url for _title, url in first + second]
    assert rejected == []


def test_admit_batch_rejects_a_single_numeric_vacancy_and_slugs():
    pairs = [
        ("Only vacancy", "https://jobs.example.org/en-us/job/596176/only-role"),
        ("Internship programme", "https://www.unicef.org/careers/internships"),
        ("About", "https://example.org/careers/about"),
    ]
    admitted, rejected = admit_batch(_batch(pairs), "html")
    assert admitted == []
    assert _reasons(rejected) == ["no_qualifying_family"] * 3


def test_admit_batch_rejects_path_pagination_and_non_vacancy_numbers():
    pages = [
        ("Page 2", "https://example.org/page/2"),
        ("Page 3", "https://example.org/page/3"),
    ]
    more_pages = [
        ("Pages 2", "https://example.org/pages/2"),
        ("Pages 3", "https://example.org/pages/3"),
    ]
    news = [
        ("Story", "https://example.org/news/2024/123"),
        ("Other", "https://example.org/news/2025/456"),
    ]
    other = [
        ("Item", "https://example.org/foo/123"),
        ("Item 2", "https://example.org/foo/124"),
    ]
    categories = [
        ("Categories", "https://example.org/careers/job-categories"),
        ("More", "https://example.org/careers/job-categories/extra"),
    ]
    admitted, rejected = admit_batch(_batch(pages + more_pages + news + other + categories), "html")
    assert admitted == []
    reasons = _reasons(rejected)
    assert reasons[:4] == ["pagination_path"] * 4
    assert reasons[4:] == ["no_qualifying_family"] * 6


def test_admit_batch_query_pagination_stays_a_destination_deny():
    jobs = _batch([("Listing", "https://example.org/jobs?page=2")])
    admitted, rejected = admit_batch(jobs, "html")
    assert admitted == []
    assert _reasons(rejected) == ["search_or_pagination"]


def test_admit_batch_repeated_uuid_family_admits_without_a_noun():
    first = "550e8400-e29b-41d4-a716-446655440000"
    second = "7b9c3f21-1a2b-4c3d-8e9f-123456789abc"
    pairs = [
        ("Role A", f"https://boards.example.org/posts/{first}"),
        ("Role B", f"https://boards.example.org/posts/{second}"),
    ]
    admitted, rejected = admit_batch(_batch(pairs), "html")
    assert _urls(admitted) == [url for _title, url in pairs]
    assert rejected == []


def test_admit_batch_rejects_one_uuid_and_unhyphenated_hex():
    one = _batch(
        [("Only", "https://example.org/posts/550e8400-e29b-41d4-a716-446655440000")]
    )
    blob = "a" * 32
    blobs = _batch(
        [
            ("A", f"https://example.org/posts/{blob}"),
            ("B", f"https://example.org/posts/{'b' * 32}"),
        ]
    )
    admitted, rejected = admit_batch(one + blobs, "html")
    assert admitted == []
    assert _reasons(rejected) == ["no_qualifying_family"] * 3


def test_admit_batch_ignores_extracted_by():
    pairs = [
        ("Role A", "https://jobs.example.org/job/10/a"),
        ("Role B", "https://jobs.example.org/job/11/b"),
    ]
    ai = _batch(pairs, extracted_by="ai")
    html = _batch(pairs, extracted_by="html")
    ai_admitted, _ai_rejected = admit_batch(ai, "html")
    html_admitted, _html_rejected = admit_batch(html, "html")
    assert _urls(ai_admitted) == _urls(html_admitted)


def test_admit_batch_html_location_and_deadline_do_not_admit_a_slug():
    jobs = _batch(
        [("Internships", "https://example.org/careers/internships")],
        location_raw="Geneva",
        deadline="2026-02-01",
        extracted_by="ai",
    )
    admitted, rejected = admit_batch(jobs, "html")
    assert admitted == []
    assert _reasons(rejected) == ["no_qualifying_family"]


def test_admit_batch_job_posting_needs_a_structured_field():
    bare = {
        "title": "Analyst",
        "apply_url": "https://example.org/careers/analyst",
        "record_class": "job_posting",
    }
    located = dict(bare, location_raw="Gaza")
    dated = dict(bare, apply_url="https://example.org/careers/dated", deadline="2026-03-01")
    typed = dict(bare, apply_url="https://example.org/careers/typed", employment_type="FULL_TIME")
    admitted, rejected = admit_batch([bare, located, dated, typed], "html")
    assert _urls(admitted) == [
        "https://example.org/careers/analyst",
        "https://example.org/careers/dated",
        "https://example.org/careers/typed",
    ]
    assert _reasons(rejected) == ["no_qualifying_structured_evidence"]


def test_admit_batch_rss_deadline_qualifies_and_location_does_not():
    bare = {"title": "Note", "apply_url": "https://example.org/notes/1"}
    dated = dict(bare, apply_url="https://example.org/notes/2", deadline="01/02/2026")
    located = dict(bare, apply_url="https://example.org/notes/3", location_raw="Kabul")
    admitted, rejected = admit_batch([bare, dated, located], "rss")
    assert _urls(admitted) == ["https://example.org/notes/2"]
    assert _reasons(rejected) == [
        "no_qualifying_structured_evidence",
        "no_qualifying_structured_evidence",
    ]


def test_admit_batch_api_deadline_or_location_qualifies():
    bare = {"title": "Note", "apply_url": "https://example.org/notes/1"}
    dated = dict(bare, apply_url="https://example.org/notes/2", deadline="01/02/2026")
    located = dict(bare, apply_url="https://example.org/notes/3", location_raw="Kabul")
    identified = dict(
        bare,
        apply_url="https://example.org/notes/4",
        id="99",
        job_id="99",
        position_id="99",
    )
    admitted, rejected = admit_batch([bare, dated, located, identified], "api")
    assert _urls(admitted) == [
        "https://example.org/notes/2",
        "https://example.org/notes/3",
    ]
    assert _reasons(rejected) == [
        "no_qualifying_structured_evidence",
        "no_qualifying_structured_evidence",
    ]


def test_admit_batch_extracted_by_does_not_change_rss_or_api():
    located = {
        "title": "Note",
        "apply_url": "https://example.org/notes/3",
        "location_raw": "Kabul",
        "extracted_by": "ai",
    }
    rss_admitted, rss_rejected = admit_batch([dict(located)], "rss")
    api_admitted, _api_rejected = admit_batch([dict(located)], "api")
    assert rss_admitted == []
    assert _reasons(rss_rejected) == ["no_qualifying_structured_evidence"]
    assert _urls(api_admitted) == ["https://example.org/notes/3"]


def test_each_adapter_admits_once_before_save_and_the_orchestrator_does_not():
    html = (_BACKEND / "crawler_v2" / "simple_crawler.py").read_text(encoding="utf-8")
    rss = (_BACKEND / "crawler_v2" / "rss_crawler.py").read_text(encoding="utf-8")
    api = (_BACKEND / "crawler_v2" / "api_crawler.py").read_text(encoding="utf-8")
    orchestrator = (_BACKEND / "orchestrator.py").read_text(encoding="utf-8")
    assert html.count("admit_batch(") == 1
    assert rss.count("admit_batch(") == 1
    assert api.count("admit_batch(") == 1
    assert 'admit_batch(jobs, "html")' in html
    assert 'admit_batch(jobs, "rss")' in rss
    assert 'admit_batch(jobs, "api")' in api
    assert html.index('admit_batch(jobs, "html")') < html.index("self.save_jobs(admitted")
    assert rss.index('admit_batch(jobs, "rss")') < rss.index("self.save_jobs(admitted")
    assert api.index('admit_batch(jobs, "api")') < api.index("self.save_jobs(admitted")
    assert 'job[\'record_class\'] = \'job_posting\'' in html
    assert "restrict_to_repeated_detail_templates" not in html
    assert "admit_batch" not in orchestrator
