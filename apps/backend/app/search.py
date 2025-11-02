import os
import uuid
from typing import Any, Optional
from datetime import datetime


class SearchService:
    def __init__(self):
        self.meili_enabled = self._is_meili_enabled()
        self.db_enabled = self._is_db_enabled()

    def _is_meili_enabled(self) -> bool:
        enabled = os.getenv("AIDJOBS_ENABLE_SEARCH", "true").lower() == "true"
        has_config = bool(os.getenv("MEILI_HOST") and os.getenv("MEILI_MASTER_KEY"))
        return enabled and has_config

    def _is_db_enabled(self) -> bool:
        return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_ANON_KEY"))

    async def search_query(
        self,
        q: Optional[str] = None,
        page: int = 1,
        size: int = 20,
        country: Optional[str] = None,
        level_norm: Optional[str] = None,
        international_eligible: Optional[bool] = None,
        mission_tags: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        request_id = str(uuid.uuid4())

        page = max(1, page)
        size = max(1, min(100, size))

        if self.meili_enabled:
            result = await self._search_meilisearch(
                q, page, size, country, level_norm, international_eligible, mission_tags
            )
        elif self.db_enabled:
            result = await self._search_database(
                q, page, size, country, level_norm, international_eligible, mission_tags
            )
        else:
            result = {
                "items": [],
                "total": 0,
                "page": page,
                "size": size,
                "fallback": True,
            }

        return {
            "status": "ok",
            "data": result,
            "error": None,
            "request_id": request_id,
        }

    async def _search_meilisearch(
        self,
        q: Optional[str],
        page: int,
        size: int,
        country: Optional[str],
        level_norm: Optional[str],
        international_eligible: Optional[bool],
        mission_tags: Optional[list[str]],
    ) -> dict[str, Any]:
        return {
            "items": [],
            "total": 0,
            "page": page,
            "size": size,
            "facets": {},
        }

    async def _search_database(
        self,
        q: Optional[str],
        page: int,
        size: int,
        country: Optional[str],
        level_norm: Optional[str],
        international_eligible: Optional[bool],
        mission_tags: Optional[list[str]],
    ) -> dict[str, Any]:
        return {
            "items": [],
            "total": 0,
            "page": page,
            "size": size,
            "fallback": True,
        }

    async def get_facets(self) -> dict[str, Any]:
        if not self.meili_enabled:
            return {"enabled": False}

        return {
            "enabled": True,
            "facets": {
                "country": {},
                "level_norm": {},
                "mission_tags": {},
                "international_eligible": {},
            },
        }


search_service = SearchService()
