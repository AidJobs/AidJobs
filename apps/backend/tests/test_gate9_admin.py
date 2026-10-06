"""Gate 9 admin consolidation. No live database and no live Meilisearch."""
import inspect
from pathlib import Path

from fastapi.testclient import TestClient

import security.admin_auth as admin_auth
from app.sources import list_organisations
from main import app

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent.parent


def test_organisation_screen_does_not_touch_organisation_rows():
    source = inspect.getsource(list_organisations)
    assert "organisation_id" not in source
    assert "INSERT" not in source
    assert "UPDATE" not in source
    assert "gate8_" not in source
    for name in ("simple_crawler.py", "rss_crawler.py", "api_crawler.py"):
        text = (ROOT / "crawler_v2" / name).read_text(encoding="utf-8")
        assert "organisation_id" not in text
    assert "organisation_id" not in (ROOT / "contracts" / "persist.py").read_text(encoding="utf-8")


def test_core_admin_routes_use_the_single_prefix():
    sources = (ROOT / "app" / "sources.py").read_text(encoding="utf-8")
    presets = (ROOT / "app" / "presets.py").read_text(encoding="utf-8")
    assert '@router.get("/api/admin/sources")' in sources
    assert '@router.post("/api/admin/sources")' in sources
    assert '"/admin/sources' not in sources
    assert '"/api/admin/presets/sources"' in presets
    main = (ROOT / "main.py").read_text(encoding="utf-8")
    assert "include_router(crawl_router)" not in main
    assert "from app.crawl import" not in main
    assert "https://*.vercel.app" not in main
    assert 'allow_origins=["*"]' not in main
    cookie = inspect.getsource(admin_auth.set_admin_cookie)
    assert 'samesite="lax"' in cookie


def test_old_admin_mutations_do_not_perform_the_operation(monkeypatch):
    monkeypatch.setenv("AIDJOBS_ENV", "dev")
    monkeypatch.setenv("COOKIE_SECRET", "gate9-test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "gate9-test-password")
    client = TestClient(app)
    assert client.get("/admin/search/reindex").status_code == 404
    assert client.post("/admin/search/reindex").status_code == 404
    assert client.post("/admin/search/init").status_code == 404
    assert client.post("/api/admin/search/reindex").status_code == 401
    assert client.post("/admin/sources").status_code == 404
    assert client.post("/admin/normalize/reindex").status_code == 404
    assert client.post("/admin/database/migrate").status_code == 404
    assert client.post("/admin/find-earn/approve/1").status_code == 404


def test_v1_navigation_and_session_guard():
    layout_path = REPO / "apps" / "frontend" / "components" / "AdminLayoutClient.tsx"
    layout = layout_path.read_text(encoding="utf-8")
    assert "fetch('/api/admin/session'" in layout
    assert "session !== 'ok'" in layout
    for label in ("Dashboard", "Organisations", "Sources", "Jobs", "Crawls", "Data Quality"):
        assert label in layout
    for label in ("Find & Earn", "Taxonomy", "Enrichment", "Analytics"):
        assert label not in layout
    proxies = (REPO / "apps" / "frontend" / "app" / "api" / "admin").rglob("*.ts")
    for path in proxies:
        text = path.read_text(encoding="utf-8")
        assert "/admin/sources" not in text.replace("/api/admin/sources", "")
        assert "/admin/search/reindex" not in text.replace("/api/admin/search/reindex", "")
        assert "/admin/presets" not in text.replace("/api/admin/presets", "")
