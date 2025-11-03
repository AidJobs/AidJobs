import os
import uuid
from typing import Any, Optional
from datetime import datetime
from urllib.parse import urlparse

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None


class SearchService:
    def __init__(self):
        self.meili_enabled = self._is_meili_enabled()
        self.db_enabled = self._is_db_enabled()

    def _is_meili_enabled(self) -> bool:
        enabled = os.getenv("AIDJOBS_ENABLE_SEARCH", "true").lower() == "true"
        has_config = bool(os.getenv("MEILI_HOST") and os.getenv("MEILI_MASTER_KEY"))
        return enabled and has_config

    def _is_db_enabled(self) -> bool:
        return bool(os.getenv("DATABASE_URL"))

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
        if not psycopg2:
            return {
                "items": [],
                "total": 0,
                "page": page,
                "size": size,
                "fallback": True,
            }

        try:
            database_url = os.getenv("DATABASE_URL")
            
            if not database_url:
                return {
                    "items": [],
                    "total": 0,
                    "page": page,
                    "size": size,
                    "fallback": True,
                }

            # Connect to database with timeout using connection string
            conn = psycopg2.connect(database_url, connect_timeout=1)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Build WHERE clause
            where_conditions = ["status = 'active'"]
            params = []

            # Search query using ILIKE
            if q:
                where_conditions.append(
                    "(title ILIKE %s OR org_name ILIKE %s OR description_snippet ILIKE %s)"
                )
                search_param = f"%{q}%"
                params.extend([search_param, search_param, search_param])

            # Country filter
            if country:
                where_conditions.append("country = %s")
                params.append(country)

            # Level filter
            if level_norm:
                where_conditions.append("level_norm = %s")
                params.append(level_norm)

            # International eligible filter
            if international_eligible is not None:
                where_conditions.append("international_eligible = %s")
                params.append(international_eligible)

            # Mission tags filter (using ANY for array)
            if mission_tags and len(mission_tags) > 0:
                where_conditions.append("mission_tags && %s")
                params.append(mission_tags)

            where_clause = " AND ".join(where_conditions)

            # Get total count
            count_query = f"SELECT COUNT(*) as total FROM jobs WHERE {where_clause}"
            cursor.execute(count_query, params)
            total = cursor.fetchone()["total"]

            # Get paginated results
            offset = (page - 1) * size
            select_query = f"""
                SELECT 
                    id, org_name, title, location_raw, country, 
                    level_norm, deadline, apply_url, last_seen_at
                FROM jobs 
                WHERE {where_clause}
                ORDER BY last_seen_at DESC, created_at DESC
                LIMIT %s OFFSET %s
            """
            
            cursor.execute(select_query, params + [size, offset])
            rows = cursor.fetchall()

            # Convert rows to dict and format dates
            items = []
            for row in rows:
                item = dict(row)
                # Convert deadline to string if present
                if item.get('deadline'):
                    item['deadline'] = item['deadline'].isoformat()
                # Convert last_seen_at to string if present
                if item.get('last_seen_at'):
                    item['last_seen_at'] = item['last_seen_at'].isoformat()
                # Convert UUID to string
                if item.get('id'):
                    item['id'] = str(item['id'])
                items.append(item)

            cursor.close()
            conn.close()

            return {
                "items": items,
                "total": total,
                "page": page,
                "size": size,
                "fallback": True,
            }

        except Exception as e:
            # Log error but don't crash - return empty results
            print(f"Database search error: {e}")
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
