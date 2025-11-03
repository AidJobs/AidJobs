import os
import uuid
import logging
import time
from typing import Any, Optional, TYPE_CHECKING
from datetime import datetime
from urllib.parse import urlparse

from app.db_config import db_config
from app.normalizer import Normalizer

if TYPE_CHECKING:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    import meilisearch
else:
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        psycopg2 = None  # type: ignore[assignment]
        RealDictCursor = None  # type: ignore[assignment,misc]

    try:
        import meilisearch
    except ImportError:
        meilisearch = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


class SearchService:
    def __init__(self):
        self.meili_client = None
        self.meili_index_name = os.getenv("MEILI_JOBS_INDEX", "jobs_index")
        self.meili_enabled = self._is_meili_enabled()
        self.db_enabled = self._is_db_enabled()
        self.meili_error = None
        self.last_reindexed_at: Optional[str] = None
        
        if self.meili_enabled:
            self._init_meilisearch()

    def _is_meili_enabled(self) -> bool:
        if not meilisearch:
            return False
        enabled = os.getenv("AIDJOBS_ENABLE_SEARCH", "true").lower() == "true"
        has_config = bool(os.getenv("MEILI_HOST") and os.getenv("MEILI_MASTER_KEY"))
        return enabled and has_config

    def _is_db_enabled(self) -> bool:
        return db_config.is_db_enabled
    
    def _init_meilisearch(self) -> None:
        """Initialize Meilisearch client and configure index. Never crashes."""
        try:
            meili_host = os.getenv("MEILI_HOST")
            meili_key = os.getenv("MEILI_MASTER_KEY")
            
            self.meili_client = meilisearch.Client(meili_host, meili_key)
            
            try:
                try:
                    index = self.meili_client.get_index(self.meili_index_name)
                except Exception:
                    task = self.meili_client.create_index(
                        self.meili_index_name,
                        {'primaryKey': 'id'}
                    )
                    index = self.meili_client.get_index(self.meili_index_name)
                
                index.update_filterable_attributes([
                    'country',
                    'level_norm',
                    'mission_tags',
                    'international_eligible',
                    'status'
                ])
                
                index.update_sortable_attributes([
                    'deadline',
                    'last_seen_at'
                ])
                
                index.update_searchable_attributes([
                    'title',
                    'org_name',
                    'description_snippet',
                    'mission_tags'
                ])
                
                logger.info(f"[aidjobs] Meilisearch index '{self.meili_index_name}' configured successfully")
            except Exception as e:
                logger.warning(f"[aidjobs] Failed to configure Meilisearch index: {e}")
                self.meili_error = str(e)
                
        except Exception as e:
            logger.error(f"[aidjobs] Failed to initialize Meilisearch client: {e}")
            self.meili_enabled = False
            self.meili_client = None
            self.meili_error = str(e)

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

        result = None
        
        if self.meili_enabled:
            result = await self._search_meilisearch(
                q, page, size, country, level_norm, international_eligible, mission_tags
            )
            if result is not None:
                result["source"] = "meili"
        
        if result is None and self.db_enabled:
            result = await self._search_database(
                q, page, size, country, level_norm, international_eligible, mission_tags
            )
            result["source"] = "db"
        
        if result is None:
            result = {
                "items": [],
                "total": 0,
                "page": page,
                "size": size,
                "source": "none",
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
    ) -> Optional[dict[str, Any]]:
        """Search using Meilisearch with filters and pagination. Returns None on failure."""
        if not self.meili_client:
            logger.warning("Meilisearch client not available")
            return None
        
        try:
            index = self.meili_client.index(self.meili_index_name)
            
            filters = ["status = 'active'"]
            
            if country:
                filters.append(f"country = '{country}'")
            
            if level_norm:
                filters.append(f"level_norm = '{level_norm}'")
            
            if international_eligible is not None:
                filters.append(f"international_eligible = {str(international_eligible).lower()}")
            
            if mission_tags and len(mission_tags) > 0:
                tag_filters = " OR ".join([f"mission_tags = '{tag}'" for tag in mission_tags])
                filters.append(f"({tag_filters})")
            
            filter_str = " AND ".join(filters)
            
            offset = (page - 1) * size
            
            search_params = {
                "filter": filter_str,
                "limit": size,
                "offset": offset,
            }
            
            results = index.search(q or "", search_params)
            
            return {
                "items": results.get("hits", []),
                "total": results.get("estimatedTotalHits", 0),
                "page": page,
                "size": size,
                "facets": {},
            }
            
        except Exception as e:
            logger.error(f"Meilisearch search error: {e}, falling back to database")
            return None

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
            }

        conn_params = db_config.get_connection_params()
        
        if not conn_params:
            return {
                "items": [],
                "total": 0,
                "page": page,
                "size": size,
            }

        conn = None
        cursor = None
        try:
            # Connect to database with timeout
            conn = psycopg2.connect(**conn_params, connect_timeout=1)
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

            return {
                "items": items,
                "total": total,
                "page": page,
                "size": size,
            }

        except Exception as e:
            # Log error but don't crash - return empty results
            logger.error(f"Database search error: {e}")
            return {
                "items": [],
                "total": 0,
                "page": page,
                "size": size,
            }
        finally:
            # Always close cursor and connection
            if cursor:
                cursor.close()
            if conn:
                conn.close()

    async def _get_database_facets(self) -> dict[str, dict[str, int]]:
        """Get facet counts from database using GROUP BY queries"""
        if not psycopg2:
            return {
                "country": {},
                "level_norm": {},
                "mission_tags": {},
                "international_eligible": {},
            }

        conn_params = db_config.get_connection_params()
        if not conn_params:
            return {
                "country": {},
                "level_norm": {},
                "mission_tags": {},
                "international_eligible": {},
            }

        conn = None
        cursor = None
        try:
            conn = psycopg2.connect(**conn_params, connect_timeout=1)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get country facets (limit 50)
            cursor.execute("""
                SELECT country, COUNT(*) as count
                FROM jobs
                WHERE status = 'active' AND country IS NOT NULL
                GROUP BY country
                ORDER BY count DESC
                LIMIT 50
            """)
            country_facets = {row["country"]: row["count"] for row in cursor.fetchall()}

            # Get level_norm facets (limit 50)
            cursor.execute("""
                SELECT level_norm, COUNT(*) as count
                FROM jobs
                WHERE status = 'active' AND level_norm IS NOT NULL
                GROUP BY level_norm
                ORDER BY count DESC
                LIMIT 50
            """)
            level_facets = {row["level_norm"]: row["count"] for row in cursor.fetchall()}

            # Get international_eligible facets
            cursor.execute("""
                SELECT international_eligible, COUNT(*) as count
                FROM jobs
                WHERE status = 'active' AND international_eligible IS NOT NULL
                GROUP BY international_eligible
                ORDER BY count DESC
            """)
            international_facets = {
                str(row["international_eligible"]).lower(): row["count"] 
                for row in cursor.fetchall()
            }

            # Get mission_tags facets using UNNEST (top 10)
            cursor.execute("""
                SELECT tag, COUNT(*) as count
                FROM jobs, UNNEST(mission_tags) as tag
                WHERE status = 'active'
                GROUP BY tag
                ORDER BY count DESC
                LIMIT 10
            """)
            tags_facets = {row["tag"]: row["count"] for row in cursor.fetchall()}

            return {
                "country": country_facets,
                "level_norm": level_facets,
                "mission_tags": tags_facets,
                "international_eligible": international_facets,
            }

        except Exception as e:
            print(f"Database facets error: {e}")
            return {
                "country": {},
                "level_norm": {},
                "mission_tags": {},
                "international_eligible": {},
            }
        finally:
            # Always close cursor and connection
            if cursor:
                cursor.close()
            if conn:
                conn.close()

    async def get_facets(self) -> dict[str, Any]:
        if self.meili_enabled and self.meili_client:
            try:
                index = self.meili_client.index(self.meili_index_name)
                
                search_result = index.search("", {
                    "facets": ["country", "level_norm", "mission_tags", "international_eligible"],
                    "limit": 0,
                    "filter": "status = 'active'"
                })
                
                facet_distribution = search_result.get("facetDistribution", {})
                
                return {
                    "enabled": True,
                    "facets": {
                        "country": facet_distribution.get("country", {}),
                        "level_norm": facet_distribution.get("level_norm", {}),
                        "mission_tags": facet_distribution.get("mission_tags", {}),
                        "international_eligible": facet_distribution.get("international_eligible", {}),
                    },
                }
            except Exception as e:
                logger.error(f"Meilisearch facets error: {e}, falling back to database")
        
        if self.db_enabled:
            facets = await self._get_database_facets()
            return {
                "enabled": True,
                "facets": facets,
            }

        return {"enabled": False}
    
    async def get_db_status(self) -> dict[str, Any]:
        """Get database status with row counts"""
        if not self.db_enabled:
            return {
                "ok": False,
                "error": "Database not configured"
            }
        
        if not psycopg2:
            return {
                "ok": False,
                "error": "psycopg2 not installed"
            }
        
        conn = None
        cursor = None
        
        try:
            conn_params = db_config.get_connection_params()
            if not conn_params:
                return {
                    "ok": False,
                    "error": "Database connection params missing"
                }
            
            conn = psycopg2.connect(**conn_params)
            cursor = conn.cursor()
            
            # Get row counts for jobs and sources tables
            cursor.execute("SELECT COUNT(*) as count FROM jobs")
            jobs_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) as count FROM sources")
            sources_count = cursor.fetchone()[0]
            
            return {
                "ok": True,
                "row_counts": {
                    "jobs": jobs_count,
                    "sources": sources_count
                }
            }
        except Exception as e:
            logger.error(f"Database status check failed: {e}")
            return {
                "ok": False,
                "error": str(e)
            }
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
    
    async def get_search_status(self) -> dict[str, Any]:
        """Get search engine status"""
        if not self.meili_enabled:
            return {
                "enabled": False,
                "error": self.meili_error if self.meili_error else "Meilisearch not configured"
            }
        
        if not self.meili_client:
            return {
                "enabled": False,
                "error": "Meilisearch client not initialized"
            }
        
        try:
            index = self.meili_client.index(self.meili_index_name)
            stats = index.get_stats()
            
            result = {
                "enabled": True,
                "index": {
                    "name": self.meili_index_name,
                    "stats": {
                        "numberOfDocuments": stats.number_of_documents,
                        "isIndexing": stats.is_indexing,
                    }
                }
            }
            
            if self.last_reindexed_at:
                result["index"]["lastReindexedAt"] = self.last_reindexed_at
            
            return result
        except Exception as e:
            logger.error(f"Failed to get Meilisearch status: {e}")
            return {
                "enabled": False,
                "error": str(e)
            }
    
    async def reindex_jobs(self) -> dict[str, Any]:
        """Reindex all active jobs from database to Meilisearch"""
        if not self.meili_enabled or not self.meili_client:
            return {
                "indexed": 0,
                "skipped": 0,
                "duration_ms": 0,
                "error": "Meilisearch not enabled or configured"
            }
        
        if not psycopg2:
            return {
                "indexed": 0,
                "skipped": 0,
                "duration_ms": 0,
                "error": "Database driver not available"
            }
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            return {
                "indexed": 0,
                "skipped": 0,
                "duration_ms": 0,
                "error": "Database not configured"
            }
        
        start_time = time.time()
        conn = None
        cursor = None
        
        try:
            conn = psycopg2.connect(**conn_params, connect_timeout=5)
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute("""
                SELECT 
                    id, org_name, title, location_raw, country, country_iso,
                    level_norm, deadline, apply_url, last_seen_at, 
                    mission_tags, international_eligible, status
                FROM jobs
                WHERE status = 'active'
                ORDER BY created_at DESC
            """)
            
            rows = cursor.fetchall()
            
            if not rows:
                duration_ms = int((time.time() - start_time) * 1000)
                return {
                    "indexed": 0,
                    "skipped": 0,
                    "duration_ms": duration_ms
                }
            
            documents = []
            skipped_count = 0
            
            for row in rows:
                raw_doc = dict(row)
                
                country_iso = Normalizer.to_iso_country(raw_doc.get('country'))
                if not country_iso:
                    country_iso = raw_doc.get('country_iso')
                
                level_norm = Normalizer.norm_level(raw_doc.get('level_norm'))
                
                mission_tags = Normalizer.norm_tags(raw_doc.get('mission_tags'))
                
                international_eligible = Normalizer.to_bool(raw_doc.get('international_eligible'))
                
                deadline = raw_doc.get('deadline')
                last_seen_at = raw_doc.get('last_seen_at')
                
                normalized_doc = {
                    'id': str(raw_doc['id']) if raw_doc.get('id') else None,
                    'org_name': raw_doc.get('org_name'),
                    'title': raw_doc.get('title'),
                    'location_raw': raw_doc.get('location_raw'),
                    'country': country_iso,
                    'level_norm': level_norm,
                    'deadline': deadline.isoformat() if deadline else None,
                    'apply_url': raw_doc.get('apply_url'),
                    'last_seen_at': last_seen_at.isoformat() if last_seen_at else None,
                    'mission_tags': mission_tags if mission_tags else [],
                    'international_eligible': international_eligible,
                    'status': raw_doc.get('status', 'active')
                }
                
                if not normalized_doc.get('id') or not normalized_doc.get('title'):
                    skipped_count += 1
                    continue
                
                documents.append(normalized_doc)
            
            index = self.meili_client.index(self.meili_index_name)
            
            batch_size = 500
            indexed_count = 0
            
            for i in range(0, len(documents), batch_size):
                batch = documents[i:i + batch_size]
                index.add_documents(batch, primary_key='id')
                indexed_count += len(batch)
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Update last reindexed timestamp
            self.last_reindexed_at = datetime.utcnow().isoformat() + 'Z'
            
            return {
                "indexed": indexed_count,
                "skipped": skipped_count,
                "duration_ms": duration_ms
            }
            
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Failed to reindex jobs: {e}")
            return {
                "indexed": 0,
                "skipped": 0,
                "duration_ms": duration_ms,
                "error": str(e)
            }
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()


search_service = SearchService()
