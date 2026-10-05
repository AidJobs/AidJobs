"""Gate 8 organisation planning. Fixtures only. No live database."""
import inspect
from pathlib import Path

from contracts.organisations import plan_backfill

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent.parent
FIRST = REPO / "infra" / "migrations" / "gate8_organisations.sql"
SECOND = REPO / "infra" / "migrations" / "gate8_organisation_foreign_keys.sql"


def _sources():
    return [
        {"id": "s-undp", "org_name": "UNDP", "org_type": "UN"},
        {"id": "s-undp-pad", "org_name": " UNDP ", "org_type": "UN"},
        {
            "id": "s-undp-long",
            "org_name": "United Nations Development Programme",
            "org_type": "UN",
        },
        {"id": "s-undp-case", "org_name": "Undp", "org_type": "UN"},
        {"id": "s-blank", "org_name": "   ", "org_type": "NGO"},
        {"id": "s-acme-a", "org_name": "Acme", "org_type": "NGO"},
        {"id": "s-acme-b", "org_name": "Acme", "org_type": "INGO"},
    ]


def _jobs():
    return [
        {"id": "j-same", "source_id": "s-undp", "org_name": "UNDP"},
        {
            "id": "j-spelling",
            "source_id": "s-undp",
            "org_name": "United Nations Development Programme",
        },
        {"id": "j-blank-source", "source_id": "s-blank", "org_name": "Mystery"},
        {"id": "j-no-source", "source_id": None, "org_name": "UNDP"},
    ]


def test_exact_trimmed_names_group_and_spellings_stay_separate():
    sources = _sources()
    jobs = _jobs()
    before_sources = [dict(row) for row in sources]
    before_jobs = [dict(row) for row in jobs]
    plan = plan_backfill(sources, jobs)
    names = {row["name"] for row in plan["organisations"]}
    assert names == {
        "UNDP",
        "United Nations Development Programme",
        "Undp",
        "Acme",
    }
    assert plan["counts"]["organisations"] == 4
    assert plan["counts"]["mapped_sources"] == 6
    assert plan["counts"]["unmapped_sources"] == 1
    undp = plan["source_organisation_id"]["s-undp"]
    assert plan["source_organisation_id"]["s-undp-pad"] == undp
    assert plan["source_organisation_id"]["s-undp-long"] != undp
    assert plan["source_organisation_id"]["s-undp-case"] != undp
    assert plan["source_organisation_id"]["s-blank"] is None
    assert sources == before_sources
    assert jobs == before_jobs


def test_jobs_copy_the_source_and_keep_their_own_name():
    plan = plan_backfill(_sources(), _jobs())
    undp = plan["source_organisation_id"]["s-undp"]
    assert plan["job_organisation_id"]["j-same"] == undp
    assert plan["job_organisation_id"]["j-spelling"] == undp
    assert plan["job_organisation_id"]["j-blank-source"] is None
    assert plan["job_organisation_id"]["j-no-source"] is None
    assert plan["mismatches"] == ["j-spelling"]
    assert plan["counts"]["mapped_jobs"] == 2
    assert plan["counts"]["unmapped_jobs"] == 2
    assert plan["counts"]["name_mismatches"] == 1


def test_disagreeing_types_stay_unset_and_slugs_do_not_merge_case():
    plan = plan_backfill(_sources(), [])
    by_name = {row["name"]: row for row in plan["organisations"]}
    assert by_name["Acme"]["type"] is None
    assert by_name["UNDP"]["type"] == "UN"
    assert by_name["UNDP"]["website_url"] is None
    assert by_name["UNDP"]["status"] == "active"
    assert by_name["UNDP"]["slug"] == "undp"
    assert by_name["Undp"]["slug"] == "undp-2"
    assert by_name["UNDP"]["id"] != by_name["Undp"]["id"]


def test_planning_is_stable_and_has_no_database_access():
    first = plan_backfill(_sources(), _jobs())
    second = plan_backfill(_sources(), _jobs())
    assert first == second
    source = inspect.getsource(plan_backfill)
    for token in ("psycopg2", "connect(", "cursor", "execute(", "UPDATE", "DELETE"):
        assert token not in source


def test_migrations_keep_names_and_delay_foreign_keys():
    first = FIRST.read_text(encoding="utf-8")
    second = SECOND.read_text(encoding="utf-8")
    folded = " ".join(first.lower().split())
    assert "group by btrim(org_name)" in folded
    assert "group by lower" not in folded
    assert "drop column" not in folded
    assert "drop table" not in folded
    assert "references" not in folded
    assert "foreign key" not in folded
    assert "set org_name" not in folded
    assert "set organisation_id" in folded
    assert "united nations development programme" not in folded
    assert "on delete cascade" not in second.lower()
    assert second.lower().count("on delete restrict") == 2
    assert "references organisations" in second.lower()


def test_live_crawler_and_persist_do_not_use_organisation_id():
    persist = (ROOT / "contracts" / "persist.py").read_text(encoding="utf-8")
    assert "organisation_id" not in persist
    orchestrator = (ROOT / "orchestrator.py").read_text(encoding="utf-8")
    assert "organisation_id" not in orchestrator
    for name in ("simple_crawler.py", "rss_crawler.py", "api_crawler.py"):
        text = (ROOT / "crawler_v2" / name).read_text(encoding="utf-8")
        assert "organisation_id" not in text
