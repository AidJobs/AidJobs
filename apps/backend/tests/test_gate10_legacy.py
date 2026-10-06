"""Gate 10 legacy removal. The orchestrator imports the crawlers; they do not import it."""
from pathlib import Path

from fastapi.testclient import TestClient

from main import app

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent.parent


def test_deleted_legacy_modules_stay_deleted():
    for relative in (
        "app/auth.py",
        "app/crawl.py",
        "app/find_earn.py",
        "app/crawler_v2_routes.py",
        "crawler_v2/orchestrator.py",
    ):
        assert not (ROOT / relative).exists()
    assert (ROOT / "security" / "admin_auth.py").exists()
    assert (ROOT / "app" / "normalizer.py").exists()
    assert (ROOT / "contracts" / "normalize.py").exists()
    assert (ROOT / "core" / "normalize.py").exists()
    main = (ROOT / "main.py").read_text(encoding="utf-8")
    assert "from app.crawl import" not in main
    assert "from app.auth import" not in main
    assert "crawler_v2_routes" not in main
    assert "find_earn" not in main


def test_orchestrator_imports_the_three_production_crawlers():
    orchestrator = (ROOT / "orchestrator.py").read_text(encoding="utf-8")
    assert "from crawler_v2.simple_crawler import SimpleCrawler" in orchestrator
    assert "from crawler_v2.rss_crawler import SimpleRSSCrawler" in orchestrator
    assert "from crawler_v2.api_crawler import SimpleAPICrawler" in orchestrator
    for name in ("simple_crawler.py", "rss_crawler.py", "api_crawler.py"):
        text = (ROOT / "crawler_v2" / name).read_text(encoding="utf-8")
        assert "persist_candidate" in text
        assert "organisation_id" not in text
    assert "organisation_id" not in (ROOT / "contracts" / "persist.py").read_text(encoding="utf-8")


def test_shadow_catalogue_cannot_be_written():
    source = (ROOT / "pipeline" / "db_insert.py").read_text(encoding="utf-8")
    assert "jobs_side" not in source
    assert "CREATE TABLE" not in source
    mounted = (ROOT / "main.py").read_text(encoding="utf-8")
    assert "/api/admin/crawl-v2" not in mounted


def test_removed_admin_routes_are_absent():
    client = TestClient(app)
    submit = client.post("/api/find-earn/submit", json={"url": "https://example.org"})
    assert submit.status_code == 404
    assert client.post("/admin/database/migrate").status_code == 404
    assert client.post("/admin/jobs/enrich", json={"job_id": "1"}).status_code == 404
    assert client.post("/admin/normalize/reindex").status_code == 404
    assert client.post("/api/admin/crawl-v2/run", json={"source_id": "1"}).status_code == 404
    assert "/api/admin/setup/status" in [getattr(route, "path", "") for route in app.routes]


def test_v1_admin_pages_remain():
    admin = REPO / "apps" / "frontend" / "app" / "admin"
    for relative in (
        "page.tsx",
        "organisations/page.tsx",
        "sources/page.tsx",
        "sources/[id]/page.tsx",
        "jobs/page.tsx",
        "crawl/page.tsx",
        "data-quality/page.tsx",
        "setup/page.tsx",
        "login/page.tsx",
    ):
        assert (admin / relative).exists()
    removed = (
        "find-earn/page.tsx",
        "taxonomy/page.tsx",
        "normalize/page.tsx",
        "enrichment/page.tsx",
        "analytics/page.tsx",
    )
    for relative in removed:
        assert not (admin / relative).exists()
    setup = (admin / "setup" / "page.tsx").read_text(encoding="utf-8")
    assert "Run Migration" not in setup
    assert "/api/admin/setup/status" in setup
    layout_path = REPO / "apps" / "frontend" / "components" / "AdminLayoutClient.tsx"
    layout = layout_path.read_text(encoding="utf-8")
    assert "Settings" in layout
    assert "session !== 'ok'" in layout
