"""Detail-page reader. Excerpts only; saved career pages are not a dependency."""
from contracts.detail_reader import read_detail_page

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
