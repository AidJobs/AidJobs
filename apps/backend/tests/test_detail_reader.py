"""Detail-page reader. Excerpts only; saved career pages are not a dependency."""
import asyncio
from pathlib import Path

import pytest

from contracts.detail_reader import apply_detail_reading, read_detail_page

_OXFAM = """
<title>Oxfam | Careers</title>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Finance Manager",
  "description": "A long description of the role.",
  "validThrough": "2026-10-26",
  "employmentType": "Fixed Term",
  "jobLocation": {
    "name": "Head office",
    "address": {
      "addressLocality": "Damascus",
      "addressRegion": "Damascus",
      "addressCountry": "Syria",
      "streetAddress": "Farabi Street"
    }
  }
}
</script>
<h1>Wrong heading</h1>
<div>Location:</div><div>Syria - Damascus - Head office</div>
"""

_ICRC = """
<title>Pashto Interpreter Job Details | icrc</title>
<script>top.location = self.location;</script>
<script>window.location = url;</script>
<h1>Pashto Interpreter</h1>
<span>Location: Afghanistan, various sites</span>
<span>Location:</span><span>Geneva (GVA)</span>
<strong>Application Deadline:</strong>
<span>06/11/2026</span>
<div>Closing Date:</div><div>26 October 2026</div>
<span>Contract Type:</span><span>Max term contract</span>
<p><label>Contract type</label></p>
<p><label>Job location</label><span>All</span></p>
"""


def test_oxfam_posting_keeps_address_parts_and_ignores_page_title():
    rows = read_detail_page(_OXFAM)
    assert rows == [
        {
            "title": "Finance Manager",
            "locations": ["Damascus, Damascus, Syria"],
            "deadlines": ["2026-10-26"],
            "employment_types": ["Fixed Term"],
        }
    ]


def test_icrc_pairs_same_node_and_sibling_labels():
    rows = read_detail_page(_ICRC)
    assert rows == [
        {
            "title": "Pashto Interpreter",
            "locations": ["Afghanistan, various sites", "Geneva (GVA)"],
            "deadlines": ["06/11/2026", "26 October 2026"],
            "employment_types": ["Max term contract"],
        }
    ]


def test_script_trap_without_a_label_returns_nothing():
    html = "<script>top.location = self.location; window.location = url;</script><h1>Role</h1>"
    assert read_detail_page(html) == []


def test_malformed_jsonld_still_reads_the_visible_label():
    html = """
    <script type="application/ld+json">{not json</script>
    <h1>Burmese Interpreter</h1>
    <span>Location: Myanmar</span>
    """
    rows = read_detail_page(html)
    assert rows == [
        {
            "title": "Burmese Interpreter",
            "locations": ["Myanmar"],
            "deadlines": [],
            "employment_types": [],
        }
    ]


def test_description_only_posting_uses_the_visible_result_whole():
    html = """
    <script type="application/ld+json">
    {"@type": "JobPosting", "title": "JSON Title", "description": "Geneva, apply by 01/02/2026"}
    </script>
    <title>Pashto Interpreter Job Details | icrc</title>
    <h1>Pashto Interpreter</h1>
    <span>Location:</span><span>Geneva (GVA)</span>
    """
    rows = read_detail_page(html)
    assert rows == [
        {
            "title": "Pashto Interpreter",
            "locations": ["Geneva (GVA)"],
            "deadlines": [],
            "employment_types": [],
        }
    ]


def test_two_postings_keep_their_own_fields():
    html = """
    <script type="application/ld+json">
    [
      {"@type": "JobPosting", "title": "First", "jobLocation": "Geneva"},
      {"@type": "JobPosting", "title": "Second", "validThrough": "2026-11-06"}
    ]
    </script>
    <h1>Page heading</h1>
    <span>Location: Should not mix</span>
    """
    rows = read_detail_page(html)
    assert rows == [
        {
            "title": "First",
            "locations": ["Geneva"],
            "deadlines": [],
            "employment_types": [],
        },
        {
            "title": "Second",
            "locations": [],
            "deadlines": ["2026-11-06"],
            "employment_types": [],
        },
    ]


def test_item_list_and_organization_are_not_postings():
    html = """
    <script type="application/ld+json">
    {
      "@type": "ItemList",
      "itemListElement": [
        {"@type": "JobPosting", "title": "Hidden", "jobLocation": "Geneva"}
      ]
    }
    </script>
    <script type="application/ld+json">
    {
      "@graph": [
        {"@type": "Organization", "name": "ICRC"},
        {
          "@type": ["JobPosting"],
          "title": "Listed role",
          "employmentType": ["Fixed Term", " "]
        }
      ]
    }
    </script>
    """
    rows = read_detail_page(html)
    assert rows == [
        {
            "title": "Listed role",
            "locations": [],
            "deadlines": [],
            "employment_types": ["Fixed Term"],
        }
    ]


def test_two_location_objects_stay_separate_and_skip_an_empty_object():
    html = """
    <script type="application/ld+json">
    {
      "@type": "JobPosting",
      "title": "Delegate",
      "jobLocation": [
        {"address": {"addressLocality": "Geneva", "addressCountry": "Switzerland"}},
        {},
        {"address": {"streetAddress": "Farabi Street"}},
        "Kabul"
      ]
    }
    </script>
    """
    rows = read_detail_page(html)
    assert rows[0]["locations"] == ["Geneva, Switzerland", "Farabi Street", "Kabul"]


def test_empty_evidence_does_not_qualify():
    html = """
    <script type="application/ld+json">
    {
      "@type": "JobPosting",
      "title": "   ",
      "jobLocation": {},
      "validThrough": "  ",
      "employmentType": []
    }
    </script>
    <h1> </h1>
    <span>Location:</span>
    """
    assert read_detail_page(html) == []


def test_text_sibling_after_a_label_is_the_value():
    html = "<h1>Delegate</h1><strong>Location:</strong> Global Field Deployment."
    rows = read_detail_page(html)
    assert rows[0]["locations"] == ["Global Field Deployment."]


def _listing(**extra):
    job = {
        "title": "Listing title",
        "apply_url": "https://example.org/jobs/role/1",
        "reference": "keep-me",
    }
    job.update(extra)
    return job


def test_mapping_keeps_listing_values_and_identity():
    original = _listing(
        location_raw="Geneva",
        deadline="2026-01-01",
        employment_type="Consultant",
    )
    updated = apply_detail_reading(original, read_detail_page(_ICRC))
    assert updated["location_raw"] == "Geneva"
    assert updated["deadline"] == "2026-01-01"
    assert updated["employment_type"] == "Consultant"
    assert updated["title"] == "Listing title"
    assert updated["apply_url"] == "https://example.org/jobs/role/1"
    assert updated["reference"] == "keep-me"
    assert original["location_raw"] == "Geneva"


def test_mapping_uses_the_first_nonblank_value_in_reader_order():
    updated = apply_detail_reading(_listing(location_raw="  "), read_detail_page(_ICRC))
    assert updated["location_raw"] == "Afghanistan, various sites"
    assert updated["deadline"] == "06/11/2026"
    assert updated["employment_type"] == "Max term contract"
    assert updated["title"] == "Listing title"
    assert updated["apply_url"] == "https://example.org/jobs/role/1"
    assert updated["reference"] == "keep-me"


def test_several_reader_results_leave_the_listing_unchanged():
    html = """
    <script type="application/ld+json">
    [
      {"@type": "JobPosting", "title": "One", "jobLocation": "Geneva"},
      {"@type": "JobPosting", "title": "Two", "validThrough": "2026-10-26"}
    ]
    </script>
    <h1>Visible</h1>
    <span>Location: Nairobi</span>
    """
    original = _listing()
    updated = apply_detail_reading(original, read_detail_page(html))
    assert updated == original
    assert "location_raw" not in updated


def test_empty_read_leaves_the_listing_unchanged():
    original = _listing(location_raw="Geneva")
    updated = apply_detail_reading(original, read_detail_page("<html></html>"))
    assert updated == original


def test_blank_reader_values_do_not_replace_a_blank_listing_field():
    updated = apply_detail_reading(
        _listing(),
        [{"title": "Role", "locations": [" ", ""], "deadlines": [], "employment_types": None}],
    )
    assert "location_raw" not in updated
    assert "deadline" not in updated
    assert "employment_type" not in updated
    assert updated["title"] == "Listing title"
    assert updated["reference"] == "keep-me"


_SAVED_PAGES = {
    "icrc-pashto.body": {
        "location_raw": "Afghanistan, various sites",
        "employment_type": "Maximum-term contract",
    },
    "icrc-first-aid.body": {
        "location_raw": "Global Field Deployment.",
        "deadline": "06/11/2026",
        "employment_type": "Fixed Term Contract.",
    },
    "icrc-burmese.body": {
        "location_raw": "Myanmar",
        "employment_type": "Maximum-term contract",
    },
    "oxfam-finance.body": {
        "location_raw": "Damascus, Damascus, Syria",
        "deadline": "2026-10-26",
        "employment_type": "Fixed Term",
    },
    "oxfam-protection.body": {
        "location_raw": "Damascus, Damascus, Syria",
        "deadline": "2026-10-23",
        "employment_type": "Fixed Term",
    },
    "oxfam-income.body": {
        "location_raw": "Newcastle-Upon-Tyne, Newcastle-Upon-Tyne, United Kingdom",
        "deadline": "2026-10-25",
        "employment_type": "FULL_TIME",
    },
}


def test_saved_vacancy_pages_fill_blank_fields_in_reader_order():
    root = Path(__file__).resolve().parents[3] / "raw-html" / "career-coverage"
    if not root.is_dir():
        pytest.skip("saved vacancy pages are gitignored")
    for name, expected in _SAVED_PAGES.items():
        html = (root / name).read_text(encoding="utf-8")
        updated = apply_detail_reading(_listing(), read_detail_page(html))
        for field, value in expected.items():
            assert updated[field] == value, name
        if name in {"icrc-pashto.body", "icrc-burmese.body"}:
            assert "deadline" not in updated
        assert updated["title"] == "Listing title"
        assert updated["apply_url"] == "https://example.org/jobs/role/1"
        assert updated["reference"] == "keep-me"


def test_generic_branch_uses_the_reader_and_keeps_unicef_and_undp():
    from crawler_v2.simple_crawler import SimpleCrawler

    pages = {
        "https://jobs.unicef.org/role/1": (
            "<div>Duty Station:</div><div>Nairobi</div><p>Deadline: 10 Dec 2025</p>"
        ),
        "https://jobs.undp.org/role/1": (
            "<span>DEADLINE:</span><span>03-Dec-2025</span>"
            "<span>OFFICE: UNDP-COL - COLOMBIA</span>"
        ),
        "https://www.icrc.org/job/pashto/1": (
            "<script>top.location = self.location;</script>"
            "<h1>Pashto Interpreter</h1>"
            "<span>Location: Afghanistan, various sites</span>"
        ),
    }

    async def fake_fetch(url, use_browser=False):
        return 200, pages[url]

    crawler = SimpleCrawler("postgresql://example")
    crawler.fetch_html = fake_fetch

    unicef = asyncio.run(
        crawler.enrich_job_from_detail_page(
            _listing(apply_url="https://jobs.unicef.org/role/1"),
            "https://jobs.unicef.org/listing",
        )
    )
    undp = asyncio.run(
        crawler.enrich_job_from_detail_page(
            _listing(apply_url="https://jobs.undp.org/role/1"),
            "https://jobs.undp.org/jobs",
        )
    )
    generic = asyncio.run(
        crawler.enrich_job_from_detail_page(
            _listing(apply_url="https://www.icrc.org/job/pashto/1"),
            "https://www.icrc.org/careers",
        )
    )

    assert unicef["location_raw"] == "Nairobi"
    assert unicef["deadline"] == "2025-12-10"
    assert undp["location_raw"] == "COL"
    assert undp["deadline"] == "2025-12-03"
    assert generic["location_raw"] == "Afghanistan, various sites"
    assert generic["location_raw"] != "= self.location;"
    assert "deadline" not in generic
    for row in (unicef, undp, generic):
        assert row["title"] == "Listing title"
        assert row["reference"] == "keep-me"


def test_reader_exception_leaves_the_generic_candidate_unchanged(monkeypatch):
    from crawler_v2.simple_crawler import SimpleCrawler

    def broken(_html):
        raise RuntimeError("reader failed")

    monkeypatch.setattr("crawler_v2.simple_crawler.read_detail_page", broken)

    async def fake_fetch(url, use_browser=False):
        return 200, "<h1>Role</h1><span>Location: Nairobi</span>"

    crawler = SimpleCrawler("postgresql://example")
    crawler.fetch_html = fake_fetch
    original = _listing(apply_url="https://example.org/jobs/role/1", location_raw="Geneva")
    updated = asyncio.run(
        crawler.enrich_job_from_detail_page(original, "https://example.org/careers")
    )
    assert updated == original
    assert updated["location_raw"] == "Geneva"
