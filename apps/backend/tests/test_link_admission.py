"""Listing-link admission. A vacancy shape still needs evidence fields."""
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


def test_repeated_unicef_detail_template_without_evidence_is_thin():
    admitted, rejected = admit_batch(_jobs(_VACANCIES + _JUNK), "html")
    assert admitted == []
    reasons = {job["apply_url"]: reason for job, reason in rejected}
    for _title, url in _VACANCIES:
        assert reasons[url] == "thin_vacancy"


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
    admitted, rejected = admit_batch(_jobs(first + second + junk), "html")
    assert admitted == []
    reasons = {job["apply_url"]: reason for job, reason in rejected}
    for _title, url in first + second:
        assert reasons[url] == "thin_vacancy"
    assert reasons[junk[0][1]] == "no_qualifying_family"


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
    assert admitted == []
    reasons = {job["apply_url"]: reason for job, reason in rejected}
    for _title, url in vacancies:
        assert reasons[url] == "thin_vacancy"
    for _title, url in junk:
        assert reasons[url] == "no_qualifying_family"


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
    assert admitted == []
    assert _reasons(rejected) == ["thin_vacancy"] * 4


def test_admit_batch_rejects_a_single_numeric_vacancy_and_slugs():
    pairs = [
        ("Only vacancy", "https://jobs.example.org/en-us/job/596176/only-role"),
        ("Internship programme", "https://www.unicef.org/careers/internships"),
        ("About", "https://example.org/careers/about"),
    ]
    admitted, rejected = admit_batch(_batch(pairs), "html")
    assert admitted == []
    assert _reasons(rejected) == [
        "thin_vacancy",
        "no_qualifying_family",
        "no_qualifying_family",
    ]


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


def test_vacancy_shape_with_evidence_admits_one_url():
    jobs = [
        {
            "title": "Pashto Interpreter",
            "apply_url": (
                "https://careers.icrc.org/job/"
                "Geneva-Pashto-Interpreter-32910/1425552433/"
            ),
            "location_raw": "Geneva",
        },
        {
            "title": "Finance Manager",
            "apply_url": (
                "https://jobs.oxfam.org.uk/jobs/vacancy/"
                "finance-manager-int11888/25150/description/"
            ),
            "deadline": "2026-10-26",
        },
        {
            "title": "Admin Assistant",
            "apply_url": "https://devnetjobsindia.org/jobdescription.aspx?job_id=304752",
            "location_raw": "Ranchi",
            "deadline": "2026-11-08",
        },
    ]
    admitted, rejected = admit_batch(jobs, "html")
    assert _urls(admitted) == [job["apply_url"] for job in jobs]
    assert rejected == []


def test_blank_vacancy_evidence_is_thin_vacancy():
    jobs = _batch(
        [
            (
                "Finance ManagerSyria - Damascus - Head office26 October 2026",
                "https://jobs.oxfam.org.uk/jobs/vacancy/"
                "finance-manager-int11888/25150/description/",
            ),
            (
                "Pashto Interpreter",
                "https://careers.icrc.org/job/"
                "Geneva-Pashto-Interpreter-32910/1425552433/",
            ),
        ]
    )
    admitted, rejected = admit_batch(jobs, "html")
    assert admitted == []
    assert _reasons(rejected) == ["thin_vacancy", "thin_vacancy"]


def test_membership_profile_and_icrc_junk_stay_rejected():
    filled = [
        {
            "title": "Admin Assistant",
            "apply_url": "https://www.devnetjobsindia.org/valuemembership.aspx?job_id=304752",
            "location_raw": "Ranchi",
            "deadline": "2026-11-08",
        },
        {
            "title": "A Person",
            "apply_url": "https://www.devnetjobsindia.org/myProfile.aspx?Can_Id=99",
            "location_raw": "Delhi",
        },
        {
            "title": "Subscribe",
            "apply_url": "https://www.devnetjobsindia.org/jobseeker_payment_new.aspx",
            "deadline": "2026-11-08",
        },
        {
            "title": "Display your box banner here",
            "apply_url": "https://www.devnetjobsindia.org/advertise.aspx",
            "location_raw": "India",
        },
        {
            "title": "Post your Events and Notices here",
            "apply_url": "https://www.devnetjobsindia.org/EventSubmissionInfo.aspx",
            "deadline": "2026-11-08",
        },
    ]
    junk = _batch(
        [
            ("Open Jobs", "https://careers.icrc.org/go/All-Jobs/3807301/"),
            (
                "How to Apply",
                "https://careers.icrc.org/content/application/?locale=en_GB",
            ),
            (
                "Opportunities and Benefits",
                "https://careers.icrc.org/content/opportunities-benefits/?locale=en_GB",
            ),
            (
                "local opportunities page",
                "https://careers.icrc.org/go/LOCAL-OPPORTUNITIES/9002901/",
            ),
            (
                "Our job categories",
                "https://careers.icrc.org/content/job-categories/?locale=en_GB",
            ),
            (
                "Before you apply",
                "https://careers.icrc.org/content/Prepare-Your-Application/?locale=en_GB",
            ),
            (
                "Our recruitment process",
                "https://careers.icrc.org/content/Our-Recruitment-Process/?locale=en_GB",
            ),
        ]
    )
    admitted, rejected = admit_batch(filled + junk, "html")
    assert admitted == []
    assert _reasons(rejected) == ["non_vacancy_destination"] * 5 + [
        "no_qualifying_family"
    ] * 7


def test_job_id_without_one_numeric_value_does_not_qualify():
    base = "https://devnetjobsindia.org/jobdescription.aspx"
    rows = [
        {"title": "A", "apply_url": base, "location_raw": "Delhi"},
        {"title": "B", "apply_url": base + "?job_id=", "location_raw": "Delhi"},
        {"title": "C", "apply_url": base + "?job_id=abc", "deadline": "2026-01-01"},
        {
            "title": "D",
            "apply_url": base + "?job_id=304752&job_id=304753",
            "location_raw": "Delhi",
        },
        {
            "title": "E",
            "apply_url": "https://devnetjobsindia.org/valuemembership.aspx?job_id=304752",
            "location_raw": "Delhi",
            "deadline": "2026-01-01",
        },
    ]
    admitted, rejected = admit_batch(rows, "html")
    assert admitted == []
    reasons = {job["apply_url"]: reason for job, reason in rejected}
    assert reasons[base] == "no_qualifying_family"
    assert reasons[base + "?job_id="] == "no_qualifying_family"
    assert reasons[base + "?job_id=abc"] == "no_qualifying_family"
    assert reasons[base + "?job_id=304752&job_id=304753"] == "no_qualifying_family"
    assert (
        reasons["https://devnetjobsindia.org/valuemembership.aspx?job_id=304752"]
        == "non_vacancy_destination"
    )


def test_non_vacancy_path_does_not_change_rss():
    job = {
        "title": "Note",
        "apply_url": "https://example.org/membership/1",
        "deadline": "2026-01-01",
    }
    admitted, rejected = admit_batch([job], "rss")
    assert _urls(admitted) == [job["apply_url"]]
    assert rejected == []


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
