import os
import uuid
import logging
import time
from typing import Any, Optional, TYPE_CHECKING
from datetime import datetime
from urllib.parse import urlparse

from app.db_config import db_config
from app.normalizer import Normalizer
from app.analytics import analytics_tracker
from app.rerank import rerank_results
from core import normalize

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
        has_config = bool(self._get_meili_config()[0] and self._get_meili_config()[1])
        return enabled and has_config
    
    def _get_meili_config(self) -> tuple[Optional[str], Optional[str]]:
        """Get Meilisearch host and key from environment variables.
        
        Checks MEILISEARCH_URL/MEILISEARCH_KEY first, then falls back to MEILI_HOST/MEILI_API_KEY.
        Returns: (host, key) tuple
        """
        host = os.getenv("MEILISEARCH_URL") or os.getenv("MEILI_HOST")
        key = os.getenv("MEILISEARCH_KEY") or os.getenv("MEILI_API_KEY") or os.getenv("MEILI_MASTER_KEY")
        return (host, key)

    def _is_db_enabled(self) -> bool:
        return db_config.is_db_enabled
    
    def _init_meilisearch(self) -> None:
        """Initialize Meilisearch client and configure index. Never crashes."""
        try:
            meili_host, meili_key = self._get_meili_config()
            
            if not meili_host or not meili_key:
                raise ValueError("Meilisearch host and key must be configured")
            
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
                
                index.update_searchable_attributes([
                    'title',
                    'org_name',
                    'description_snippet',
                    'mission_tags',
                    'impact_domain',
                    'functional_role',
                    'matched_keywords'
                ])
                
                index.update_filterable_attributes([
                    'country',
                    'level_norm',
                    'mission_tags',
                    'international_eligible',
                    'org_type',
                    'work_modality',
                    'career_type',
                    'country_iso',
                    'region_code',
                    'crisis_type',
                    'response_phase',
                    'humanitarian_cluster',
                    'benefits',
                    'policy_flags',
                    'donor_context',
                    'project_modality',
                    'application_window.rolling',
                    'status',
                    'impact_domain',
                    'functional_role',
                    'experience_level',
                    'sdgs',
                    'low_confidence'
                ])
                
                index.update_sortable_attributes([
                    'fetched_at',
                    'deadline',
                    'last_seen_at',
                    'compensation_min_usd',
                    'compensation_max_usd'
                ])
                
                index.update_distinct_attribute('canonical_hash')
                
                logger.info(f"[aidjobs] Meilisearch index '{self.meili_index_name}' configured successfully")
            except Exception as e:
                logger.warning(f"[aidjobs] Failed to configure Meilisearch index: {e}")
                self.meili_error = str(e)
                
        except Exception as e:
            logger.error(f"[aidjobs] Failed to initialize Meilisearch client: {e}")
            self.meili_enabled = False
            self.meili_client = None
            self.meili_error = str(e)

    def _compute_reasons(
        self,
        item: dict[str, Any],
        q: Optional[str],
        filters: dict[str, Any],
    ) -> list[str]:
        """
        Compute relevance reasons for a job result (max 3).
        
        Args:
            item: Job result item
            q: Search query
            filters: Applied filters
            
        Returns:
            List of reason strings (max 3)
        """
        reasons = []
        
        # Mission tag match
        item_mission_tags = item.get('mission_tags', []) or []
        filter_mission_tags = filters.get('mission_tags', []) or []
        if filter_mission_tags and item_mission_tags:
            matched_tags = set(item_mission_tags) & set(filter_mission_tags)
            if matched_tags:
                tag = list(matched_tags)[0]
                reasons.append(f"Mission: {tag.capitalize()}")
        
        # Level match
        if filters.get('level_norm') and item.get('level_norm'):
            if item['level_norm'] == filters['level_norm']:
                reasons.append(f"Level: {item['level_norm'].capitalize()}")
        
        # International eligible
        if filters.get('international_eligible') is True and item.get('international_eligible') is True:
            reasons.append("International")
        
        # Org type match
        if filters.get('org_type') and item.get('org_type'):
            if item['org_type'] == filters['org_type']:
                reasons.append(f"Org: {item['org_type'].upper()}")
        
        # Limit to 3 reasons
        return reasons[:3]
    
    def _normalize_filters(
        self,
        country: Optional[str] = None,
        level_norm: Optional[str] = None,
        international_eligible: Optional[bool] = None,
        mission_tags: Optional[list[str]] = None,
        work_modality: Optional[str] = None,
        career_type: Optional[str] = None,
        org_type: Optional[str] = None,
        crisis_type: Optional[list[str]] = None,
        response_phase: Optional[str] = None,
        humanitarian_cluster: Optional[list[str]] = None,
        benefits: Optional[list[str]] = None,
        policy_flags: Optional[list[str]] = None,
        donor_context: Optional[list[str]] = None,
        # Trinity Search enrichment filters
        impact_domain: Optional[list[str]] = None,
        functional_role: Optional[list[str]] = None,
        experience_level: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Normalize user-friendly filter inputs to canonical form.
        
        Returns:
            dict with normalized filters and original inputs for debugging
        """
        normalized = {}
        
        if country:
            if len(country) == 2 and country.isupper():
                normalized['country_iso'] = country
            else:
                country_iso = normalize.to_iso_country(country)
                if not country_iso and psycopg2:
                    country_iso = self._lookup_country_from_db(country)
                if country_iso:
                    normalized['country_iso'] = country_iso
        
        if level_norm:
            normalized_level = normalize.norm_level(level_norm)
            if normalized_level:
                normalized['level_norm'] = normalized_level
        
        if international_eligible is not None:
            normalized['international_eligible'] = normalize.to_bool(international_eligible)
        
        if mission_tags:
            normalized_tags = normalize.norm_tags(mission_tags)
            if normalized_tags:
                normalized['mission_tags'] = normalized_tags
        
        if work_modality:
            normalized_modality = normalize.norm_modality(work_modality)
            if normalized_modality:
                normalized['work_modality'] = normalized_modality
        
        if career_type:
            normalized['career_type'] = career_type.lower().strip()
        
        if org_type:
            normalized['org_type'] = org_type.lower().strip()
        
        if crisis_type:
            normalized['crisis_type'] = [ct.lower().strip() for ct in crisis_type if ct]
        
        if response_phase:
            normalized['response_phase'] = response_phase.lower().strip()
        
        if humanitarian_cluster:
            normalized['humanitarian_cluster'] = [hc.lower().strip() for hc in humanitarian_cluster if hc]
        
        if benefits:
            normalized_benefits = normalize.norm_benefits(benefits)
            if normalized_benefits:
                normalized['benefits'] = normalized_benefits
        
        if policy_flags:
            normalized_policy = normalize.norm_policy(policy_flags)
            if normalized_policy:
                normalized['policy_flags'] = normalized_policy
        
        if donor_context:
            normalized_donors = normalize.norm_donors(donor_context)
            if normalized_donors:
                normalized['donor_context'] = normalized_donors
        
        # Trinity Search enrichment filters (pass through as-is, already canonical)
        if impact_domain:
            normalized['impact_domain'] = [id.strip() for id in impact_domain if id]
        
        if functional_role:
            normalized['functional_role'] = [fr.strip() for fr in functional_role if fr]
        
        if experience_level:
            normalized['experience_level'] = experience_level.strip()
        
        return normalized
    
    def _lookup_country_from_db(self, country_name: str) -> Optional[str]:
        """Lookup country ISO code from database by name."""
        if not psycopg2:
            return None
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            return None
        
        try:
            conn = psycopg2.connect(**conn_params, connect_timeout=1)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT code_iso2 FROM countries WHERE LOWER(name) = LOWER(%s)",
                (country_name,)
            )
            result = cursor.fetchone()
            cursor.close()
            conn.close()
            return result[0] if result else None
        except Exception:
            return None

    async def search_query(
        self,
        q: Optional[str] = None,
        page: int = 1,
        size: int = 20,
        sort: Optional[str] = None,
        country: Optional[str] = None,
        level_norm: Optional[str] = None,
        international_eligible: Optional[bool] = None,
        mission_tags: Optional[list[str]] = None,
        work_modality: Optional[str] = None,
        career_type: Optional[str] = None,
        org_type: Optional[str] = None,
        crisis_type: Optional[list[str]] = None,
        response_phase: Optional[str] = None,
        humanitarian_cluster: Optional[list[str]] = None,
        benefits: Optional[list[str]] = None,
        policy_flags: Optional[list[str]] = None,
        donor_context: Optional[list[str]] = None,
        # Trinity Search enrichment filters
        impact_domain: Optional[list[str]] = None,
        functional_role: Optional[list[str]] = None,
        experience_level: Optional[str] = None,
    ) -> dict[str, Any]:
        start_time = time.time()
        request_id = str(uuid.uuid4())

        page = max(1, page)
        size = max(1, min(100, size))

        original_filters = {
            "country": country,
            "level_norm": level_norm,
            "international_eligible": international_eligible,
            "mission_tags": mission_tags,
            "work_modality": work_modality,
            "career_type": career_type,
            "org_type": org_type,
            "crisis_type": crisis_type,
            "response_phase": response_phase,
            "humanitarian_cluster": humanitarian_cluster,
            "benefits": benefits,
            "policy_flags": policy_flags,
            "donor_context": donor_context,
            "impact_domain": impact_domain,
            "functional_role": functional_role,
            "experience_level": experience_level,
        }
        
        normalized_filters = self._normalize_filters(
            country=country,
            level_norm=level_norm,
            international_eligible=international_eligible,
            mission_tags=mission_tags,
            work_modality=work_modality,
            career_type=career_type,
            org_type=org_type,
            crisis_type=crisis_type,
            response_phase=response_phase,
            humanitarian_cluster=humanitarian_cluster,
            benefits=benefits,
            policy_flags=policy_flags,
            donor_context=donor_context,
            impact_domain=impact_domain,
            functional_role=functional_role,
            experience_level=experience_level,
        )

        result = None
        
        if self.meili_enabled:
            result = await self._search_meilisearch(q, page, size, normalized_filters, sort)
            if result is not None:
                result["source"] = "meili"
        
        if result is None and self.db_enabled:
            result = await self._search_database(q, page, size, normalized_filters, sort)
            result["source"] = "db"
        
        if result is None:
            result = {
                "items": [],
                "total": 0,
                "page": page,
                "size": size,
                "source": "none",
            }
        
        env = os.getenv("AIDJOBS_ENV", "").lower()
        if env == "dev":
            if "debug" not in result:
                result["debug"] = {}
            result["debug"]["normalized_filters"] = normalized_filters
        
        # Track analytics (dev-only)
        latency_ms = (time.time() - start_time) * 1000
        source_map = {"meili": "meilisearch", "db": "database", "none": "fallback"}
        analytics_tracker.track_search(
            query=q,
            filters=original_filters,
            source=source_map.get(result.get("source", "none"), "fallback"),
            total_results=result.get("total", 0),
            latency_ms=latency_ms,
            page=page,
            size=size,
        )

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
        filters: dict[str, Any],
        sort: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Search using Meilisearch with filters and pagination. Returns None on failure."""
        if not self.meili_client:
            logger.warning("Meilisearch client not available")
            return None
        
        try:
            index = self.meili_client.index(self.meili_index_name)
            
            # Calculate today's date for Meilisearch filter (format: YYYY-MM-DD)
            from datetime import date
            today_str = date.today().isoformat()
            
            # Filter by active status and exclude expired jobs
            # Meilisearch date comparison: deadline >= today (or deadline is null)
            filter_conditions = [
                "status = 'active'",
                f"(deadline IS NULL OR deadline >= {today_str})"
            ]
            
            if filters.get('country_iso'):
                filter_conditions.append(f"country_iso = '{filters['country_iso']}'")
            
            if filters.get('level_norm'):
                filter_conditions.append(f"level_norm = '{filters['level_norm']}'")
            
            if filters.get('international_eligible') is not None:
                filter_conditions.append(f"international_eligible = {str(filters['international_eligible']).lower()}")
            
            if filters.get('mission_tags'):
                tags = filters['mission_tags']
                if tags:
                    tag_filters = " OR ".join([f"mission_tags = '{tag}'" for tag in tags])
                    filter_conditions.append(f"({tag_filters})")
            
            if filters.get('work_modality'):
                filter_conditions.append(f"work_modality = '{filters['work_modality']}'")
            
            if filters.get('career_type'):
                filter_conditions.append(f"career_type = '{filters['career_type']}'")
            
            if filters.get('org_type'):
                filter_conditions.append(f"org_type = '{filters['org_type']}'")
            
            if filters.get('crisis_type'):
                crisis_types = filters['crisis_type']
                if crisis_types:
                    ct_filters = " OR ".join([f"crisis_type = '{ct}'" for ct in crisis_types])
                    filter_conditions.append(f"({ct_filters})")
            
            if filters.get('response_phase'):
                filter_conditions.append(f"response_phase = '{filters['response_phase']}'")
            
            if filters.get('humanitarian_cluster'):
                clusters = filters['humanitarian_cluster']
                if clusters:
                    hc_filters = " OR ".join([f"humanitarian_cluster = '{hc}'" for hc in clusters])
                    filter_conditions.append(f"({hc_filters})")
            
            if filters.get('benefits'):
                benefits = filters['benefits']
                if benefits:
                    b_filters = " OR ".join([f"benefits = '{b}'" for b in benefits])
                    filter_conditions.append(f"({b_filters})")
            
            if filters.get('policy_flags'):
                policies = filters['policy_flags']
                if policies:
                    p_filters = " OR ".join([f"policy_flags = '{p}'" for p in policies])
                    filter_conditions.append(f"({p_filters})")
            
            if filters.get('donor_context'):
                donors = filters['donor_context']
                if donors:
                    d_filters = " OR ".join([f"donor_context = '{d}'" for d in donors])
                    filter_conditions.append(f"({d_filters})")
            
            # Enrichment filters
            if filters.get('impact_domain'):
                impact_domains = filters['impact_domain']
                if impact_domains:
                    id_filters = " OR ".join([f"impact_domain = '{id}'" for id in impact_domains])
                    filter_conditions.append(f"({id_filters})")
            
            if filters.get('functional_role'):
                functional_roles = filters['functional_role']
                if functional_roles:
                    fr_filters = " OR ".join([f"functional_role = '{fr}'" for fr in functional_roles])
                    filter_conditions.append(f"({fr_filters})")
            
            if filters.get('experience_level'):
                filter_conditions.append(f"experience_level = '{filters['experience_level']}'")
            
            if filters.get('sdgs'):
                sdgs = filters['sdgs']
                if sdgs:
                    sdg_filters = " OR ".join([f"sdgs = {sdg}" for sdg in sdgs])
                    filter_conditions.append(f"({sdg_filters})")
            
            if filters.get('is_remote') is True:
                filter_conditions.append("work_modality = 'remote' OR work_modality = 'hybrid'")
            
            filter_str = " AND ".join(filter_conditions)
            
            offset = (page - 1) * size
            
            search_params = {
                "filter": filter_str,
                "limit": size,
                "offset": offset,
            }
            
            if sort == "newest":
                search_params["sort"] = ["last_seen_at:desc"]
            elif sort == "closing_soon":
                search_params["sort"] = ["deadline:asc"]
            
            results = index.search(q or "", search_params)
            
            # Attach reasons to each result
            items = []
            for hit in results.get("hits", []):
                hit['reasons'] = self._compute_reasons(hit, q, filters)
                items.append(hit)
            
            return {
                "items": items,
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
        filters: dict[str, Any],
        sort: Optional[str] = None,
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
            # Filter by active status and exclude expired jobs (deadline < CURRENT_DATE)
            where_conditions = [
                "status = 'active'",
                "(deadline IS NULL OR deadline >= CURRENT_DATE)"
            ]
            params = []

            # Search query using ILIKE
            if q:
                where_conditions.append(
                    "(title ILIKE %s OR org_name ILIKE %s OR description_snippet ILIKE %s)"
                )
                search_param = f"%{q}%"
                params.extend([search_param, search_param, search_param])

            # Country filter (using country_iso)
            if filters.get('country_iso'):
                where_conditions.append("country_iso = %s")
                params.append(filters['country_iso'])

            # Level filter
            if filters.get('level_norm'):
                where_conditions.append("level_norm = %s")
                params.append(filters['level_norm'])

            # International eligible filter
            if filters.get('international_eligible') is not None:
                where_conditions.append("international_eligible = %s")
                params.append(filters['international_eligible'])

            # Mission tags filter (using ANY for array)
            if filters.get('mission_tags'):
                where_conditions.append("mission_tags && %s")
                params.append(filters['mission_tags'])
            
            # Work modality filter
            if filters.get('work_modality'):
                where_conditions.append("work_modality = %s")
                params.append(filters['work_modality'])
            
            # Career type filter
            if filters.get('career_type'):
                where_conditions.append("career_type = %s")
                params.append(filters['career_type'])
            
            # Org type filter
            if filters.get('org_type'):
                where_conditions.append("org_type = %s")
                params.append(filters['org_type'])
            
            # Crisis type filter (array)
            if filters.get('crisis_type'):
                where_conditions.append("crisis_type && %s")
                params.append(filters['crisis_type'])
            
            # Response phase filter
            if filters.get('response_phase'):
                where_conditions.append("response_phase = %s")
                params.append(filters['response_phase'])
            
            # Humanitarian cluster filter (array)
            if filters.get('humanitarian_cluster'):
                where_conditions.append("humanitarian_cluster && %s")
                params.append(filters['humanitarian_cluster'])
            
            # Benefits filter (array)
            if filters.get('benefits'):
                where_conditions.append("benefits && %s")
                params.append(filters['benefits'])
            
            # Policy flags filter (array)
            if filters.get('policy_flags'):
                where_conditions.append("policy_flags && %s")
                params.append(filters['policy_flags'])
            
            # Donor context filter (array)
            if filters.get('donor_context'):
                where_conditions.append("donor_context && %s")
                params.append(filters['donor_context'])

            where_clause = " AND ".join(where_conditions)

            # Get total count
            count_query = f"SELECT COUNT(*) as total FROM jobs WHERE {where_clause}"
            cursor.execute(count_query, params)
            total = cursor.fetchone()["total"]

            # Get paginated results
            offset = (page - 1) * size
            
            order_by = "last_seen_at DESC, created_at DESC"
            if sort == "newest":
                order_by = "last_seen_at DESC, created_at DESC"
            elif sort == "closing_soon":
                order_by = "deadline ASC NULLS LAST"
            
            select_query = f"""
                SELECT 
                    id, org_name, title, location_raw, country_iso, 
                    level_norm, deadline, apply_url, last_seen_at,
                    mission_tags, international_eligible, org_type,
                    impact_domain, functional_role, experience_level, sdgs,
                    matched_keywords, confidence_overall, low_confidence
                FROM jobs 
                WHERE {where_clause}
                ORDER BY {order_by}
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
                
                # Compute and attach relevance reasons
                item['reasons'] = self._compute_reasons(item, q, filters)
                
                # Ensure enrichment fields are properly formatted
                # PostgreSQL arrays are already returned as Python lists, but ensure they're not None
                if item.get('impact_domain') is None:
                    item['impact_domain'] = []
                if item.get('functional_role') is None:
                    item['functional_role'] = []
                if item.get('sdgs') is None:
                    item['sdgs'] = []
                if item.get('matched_keywords') is None:
                    item['matched_keywords'] = []
                
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
                "country_iso": {},
                "level_norm": {},
                "mission_tags": {},
                "international_eligible": {},
            }

        conn_params = db_config.get_connection_params()
        if not conn_params:
            return {
                "country_iso": {},
                "level_norm": {},
                "mission_tags": {},
                "international_eligible": {},
            }

        conn = None
        cursor = None
        try:
            conn = psycopg2.connect(**conn_params, connect_timeout=1)
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get country_iso facets (limit 50)
            cursor.execute("""
                SELECT country_iso, COUNT(*) as count
                FROM jobs
                WHERE status = 'active' 
                AND (deadline IS NULL OR deadline >= CURRENT_DATE)
                AND country_iso IS NOT NULL
                GROUP BY country_iso
                ORDER BY count DESC
                LIMIT 50
            """)
            country_facets = {row["country_iso"]: row["count"] for row in cursor.fetchall()}

            # Get level_norm facets (limit 50)
            cursor.execute("""
                SELECT level_norm, COUNT(*) as count
                FROM jobs
                WHERE status = 'active' 
                AND (deadline IS NULL OR deadline >= CURRENT_DATE)
                AND level_norm IS NOT NULL
                GROUP BY level_norm
                ORDER BY count DESC
                LIMIT 50
            """)
            level_facets = {row["level_norm"]: row["count"] for row in cursor.fetchall()}

            # Get international_eligible facets
            cursor.execute("""
                SELECT international_eligible, COUNT(*) as count
                FROM jobs
                WHERE status = 'active' 
                AND (deadline IS NULL OR deadline >= CURRENT_DATE)
                AND international_eligible IS NOT NULL
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
                AND (deadline IS NULL OR deadline >= CURRENT_DATE)
                GROUP BY tag
                ORDER BY count DESC
                LIMIT 10
            """)
            tags_facets = {row["tag"]: row["count"] for row in cursor.fetchall()}

            return {
                "country_iso": country_facets,
                "level_norm": level_facets,
                "mission_tags": tags_facets,
                "international_eligible": international_facets,
            }

        except Exception as e:
            print(f"Database facets error: {e}")
            return {
                "country_iso": {},
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
        base = {
            "enabled": True,
            "facets": {
                "country": {},
                "level_norm": {},
                "mission_tags": {},
                "international_eligible": {}
            }
        }
        
        if self.meili_enabled and self.meili_client:
            try:
                index = self.meili_client.index(self.meili_index_name)
                
                # Calculate today's date for Meilisearch filter
                from datetime import date
                today_str = date.today().isoformat()
                
                search_result = index.search("", {
                    "facets": ["country_iso", "level_norm", "mission_tags", "international_eligible"],
                    "limit": 0,
                    "filter": f"status = 'active' AND (deadline IS NULL OR deadline >= {today_str})"
                })
                
                facet_distribution = search_result.get("facetDistribution", {})
                
                base["facets"]["country"] = facet_distribution.get("country_iso", {}) or {}
                base["facets"]["level_norm"] = facet_distribution.get("level_norm", {}) or {}
                base["facets"]["mission_tags"] = facet_distribution.get("mission_tags", {}) or {}
                base["facets"]["international_eligible"] = facet_distribution.get("international_eligible", {}) or {}
                
                return base
            except Exception as e:
                logger.error(f"Meilisearch facets error: {e}, falling back to database")
        
        if self.db_enabled:
            try:
                facets = await self._get_database_facets()
                base["facets"]["country"] = facets.get("country_iso", {}) or {}
                base["facets"]["level_norm"] = facets.get("level_norm", {}) or {}
                base["facets"]["mission_tags"] = facets.get("mission_tags", {}) or {}
                base["facets"]["international_eligible"] = facets.get("international_eligible", {}) or {}
            except Exception as e:
                logger.error(f"Database facets error: {e}")
                base["enabled"] = False
                base["error"] = str(e)
        else:
            base["enabled"] = False

        return base
    
    async def get_job_by_id(self, job_id: str) -> dict[str, Any]:
        """Get a single job by ID, preferring database over Meilisearch."""
        aidjobs_env = os.getenv("AIDJOBS_ENV", "production").lower()
        is_dev = aidjobs_env == "dev"
        
        # Prefer database even if Meilisearch is enabled
        if self.db_enabled and psycopg2:
            conn_params = db_config.get_connection_params()
            if conn_params:
                try:
                    conn = psycopg2.connect(**conn_params, connect_timeout=1)
                    cursor = conn.cursor(cursor_factory=RealDictCursor)
                    
                    # Select all normalized fields
                    if is_dev:
                        # In dev mode, include raw_metadata
                        cursor.execute(
                            """
                            SELECT 
                                id, org_name, title, location_raw, country_iso, 
                                level_norm, career_type, work_modality, org_type,
                                international_eligible, deadline, apply_url, 
                                last_seen_at, mission_tags, benefits, policy_flags,
                                description_snippet, raw_metadata
                            FROM jobs 
                            WHERE id = %s
                            """,
                            (job_id,)
                        )
                    else:
                        # In production, exclude raw_metadata and internal keys
                        cursor.execute(
                            """
                            SELECT 
                                id, org_name, title, location_raw, country_iso, 
                                level_norm, career_type, work_modality, org_type,
                                international_eligible, deadline, apply_url, 
                                last_seen_at, mission_tags, benefits, policy_flags,
                                description_snippet
                            FROM jobs 
                            WHERE id = %s
                            """,
                            (job_id,)
                        )
                    
                    row = cursor.fetchone()
                    
                    cursor.close()
                    conn.close()
                    
                    if row:
                        job = dict(row)
                        # Convert dates to ISO format
                        if job.get('deadline'):
                            job['deadline'] = job['deadline'].isoformat()
                        if job.get('last_seen_at'):
                            job['last_seen_at'] = job['last_seen_at'].isoformat()
                        if job.get('id'):
                            job['id'] = str(job['id'])
                        
                        return {
                            "status": "ok",
                            "data": job,
                            "source": "db",
                        }
                    else:
                        # Return None if not found (will be handled as 404)
                        return None
                except Exception as e:
                    logger.error(f"Database job lookup error: {e}")
        
        # Fallback to Meilisearch if database fails
        if self.meili_enabled and self.meili_client:
            try:
                index = self.meili_client.index(self.meili_index_name)
                doc = index.get_document(job_id)
                if doc:
                    # Filter out internal keys in production
                    if not is_dev and isinstance(doc, dict):
                        doc = {k: v for k, v in doc.items() if not k.startswith('_')}
                    
                    return {
                        "status": "ok",
                        "data": doc,
                        "source": "meili",
                    }
            except Exception as e:
                logger.warning(f"Failed to get job from Meilisearch: {e}")
        
        # Return None if not found anywhere
        return None
    
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
            
            # Log connection attempt for debugging
            logger.info(f"[search] Attempting database connection to {conn_params.get('host', 'unknown')}:{conn_params.get('port', 'unknown')}")
            
            # Connect with timeout (10 seconds)
            conn = psycopg2.connect(**conn_params, connect_timeout=10)
            
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get row counts for jobs and sources tables
            cursor.execute("SELECT COUNT(*) as count FROM jobs")
            jobs_count = cursor.fetchone()['count']
            
            # Get count of active jobs (what's visible on frontend) - exclude expired
            cursor.execute("""
                SELECT COUNT(*) as count 
                FROM jobs 
                WHERE status = 'active' 
                AND (deadline IS NULL OR deadline >= CURRENT_DATE)
            """)
            active_jobs_count = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM sources")
            sources_count = cursor.fetchone()['count']
            
            # Get job counts by source for breakdown (only active, non-expired jobs, what's visible on frontend)
            cursor.execute("""
                SELECT 
                    s.id::text as source_id,
                    s.org_name,
                    COUNT(j.id) as job_count
                FROM sources s
                LEFT JOIN jobs j ON j.source_id = s.id 
                    AND j.status = 'active' 
                    AND (j.deadline IS NULL OR j.deadline >= CURRENT_DATE)
                GROUP BY s.id, s.org_name
                ORDER BY job_count DESC, s.org_name
            """)
            source_breakdown = [
                {
                    "source_id": row['source_id'],
                    "org_name": row['org_name'],
                    "job_count": row['job_count']
                }
                for row in cursor.fetchall()
            ]
            
            return {
                "ok": True,
                "row_counts": {
                    "jobs": jobs_count,
                    "active_jobs": active_jobs_count,
                    "sources": sources_count
                },
                "source_breakdown": source_breakdown
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
        """Get search engine status - always returns valid JSON"""
        try:
            if not self.meili_enabled:
                logger.debug(f"[search_status] Meilisearch not enabled. Error: {self.meili_error}")
                return {
                    "enabled": False,
                    "error": self.meili_error if self.meili_error else "Meilisearch not configured"
                }
            
            if not self.meili_client:
                logger.warning("[search_status] Meilisearch client is None despite being enabled")
                return {
                    "enabled": False,
                    "error": "Meilisearch client not initialized"
                }
            
            # Try to get index stats
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
                
                logger.debug(f"[search_status] Success: {stats.number_of_documents} documents, indexing={stats.is_indexing}")
                return result
                
            except Exception as index_error:
                logger.error(f"[search_status] Failed to get index stats: {index_error}", exc_info=True)
                # Try to reconnect or reinitialize
                try:
                    self._init_meilisearch()
                    # Retry once
                    index = self.meili_client.index(self.meili_index_name)
                    stats = index.get_stats()
                    return {
                        "enabled": True,
                        "index": {
                            "name": self.meili_index_name,
                            "stats": {
                                "numberOfDocuments": stats.number_of_documents,
                                "isIndexing": stats.is_indexing,
                            }
                        }
                    }
                except Exception as retry_error:
                    logger.error(f"[search_status] Retry also failed: {retry_error}")
                    return {
                        "enabled": False,
                        "error": f"Failed to connect to Meilisearch: {str(index_error)}"
                    }
                    
        except Exception as e:
            logger.error(f"[search_status] Unexpected error in get_search_status: {e}", exc_info=True)
            return {
                "enabled": False,
                "error": f"Unexpected error: {str(e)}"
            }
    
    async def get_search_settings(self) -> dict[str, Any]:
        """Get current Meilisearch index settings for verification"""
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
            
            settings = index.get_settings()
            
            return {
                "enabled": True,
                "index": self.meili_index_name,
                "settings": {
                    "searchableAttributes": settings.get("searchableAttributes", []),
                    "filterableAttributes": settings.get("filterableAttributes", []),
                    "sortableAttributes": settings.get("sortableAttributes", []),
                    "rankingRules": settings.get("rankingRules", []),
                    "stopWords": settings.get("stopWords", []),
                    "synonyms": settings.get("synonyms", {}),
                    "distinctAttribute": settings.get("distinctAttribute"),
                    "typoTolerance": settings.get("typoTolerance", {}),
                    "faceting": settings.get("faceting", {})
                }
            }
        except Exception as e:
            logger.error(f"Failed to get Meilisearch settings: {e}")
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
                    mission_tags, international_eligible, status,
                    work_modality, benefits, policy_flags, donor_context,
                    crisis_type, response_phase, humanitarian_cluster,
                    contract_urgency, contract_duration_months,
                    compensation_visible, compensation_type, 
                    compensation_min_usd, compensation_max_usd,
                    compensation_currency, compensation_confidence,
                    raw_metadata,
                    impact_domain, impact_confidences, functional_role, functional_confidences,
                    experience_level, estimated_experience_years, experience_confidence,
                    sdgs, sdg_confidences, sdg_explanation, matched_keywords,
                    confidence_overall, low_confidence, low_confidence_reason
                FROM jobs
                WHERE status = 'active'
                AND (deadline IS NULL OR deadline >= CURRENT_DATE)
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
                
                # Normalize using comprehensive normalizer
                country_iso = normalize.to_iso_country(raw_doc.get('country'))
                if not country_iso:
                    country_iso = raw_doc.get('country_iso')
                
                level_norm = normalize.norm_level(raw_doc.get('level_norm'))
                
                mission_tags = normalize.norm_tags(raw_doc.get('mission_tags'))
                
                international_eligible = normalize.to_bool(raw_doc.get('international_eligible'))
                
                work_modality = normalize.norm_modality(raw_doc.get('work_modality'))
                
                benefits = normalize.norm_benefits(raw_doc.get('benefits'))
                
                policy_flags = normalize.norm_policy(raw_doc.get('policy_flags'))
                
                donor_context = normalize.norm_donors(raw_doc.get('donor_context'))
                
                # Parse contract duration if string
                contract_duration = raw_doc.get('contract_duration_months')
                if contract_duration is None and raw_doc.get('contract_urgency'):
                    contract_duration = normalize.parse_contract_duration(raw_doc.get('contract_urgency'))
                
                # Track unknowns
                unknowns = []
                
                # Capture unknown mission tags
                raw_tags = raw_doc.get('mission_tags', [])
                if raw_tags and isinstance(raw_tags, list):
                    for tag in raw_tags:
                        if tag and tag not in mission_tags:
                            unknowns.append({'field': 'mission_tags', 'value': tag})
                
                # Capture unknown benefits
                raw_benefits = raw_doc.get('benefits', [])
                if raw_benefits and isinstance(raw_benefits, list):
                    for benefit in raw_benefits:
                        if benefit and benefit not in benefits:
                            unknowns.append({'field': 'benefits', 'value': benefit})
                
                # Capture unknown policy flags
                raw_policies = raw_doc.get('policy_flags', [])
                if raw_policies and isinstance(raw_policies, list):
                    for policy in raw_policies:
                        if policy and policy not in policy_flags:
                            unknowns.append({'field': 'policy_flags', 'value': policy})
                
                # Capture unknown donors
                raw_donors = raw_doc.get('donor_context', [])
                if raw_donors and isinstance(raw_donors, list):
                    for donor in raw_donors:
                        if donor and donor not in donor_context:
                            unknowns.append({'field': 'donor_context', 'value': donor})
                
                # Merge with existing raw_metadata.unknown
                existing_metadata = raw_doc.get('raw_metadata', {})
                if isinstance(existing_metadata, dict):
                    existing_unknowns = existing_metadata.get('unknown', [])
                    if isinstance(existing_unknowns, list):
                        unknowns.extend(existing_unknowns)
                
                deadline = raw_doc.get('deadline')
                last_seen_at = raw_doc.get('last_seen_at')
                
                # Extract enrichment fields
                impact_domain = raw_doc.get('impact_domain', []) or []
                functional_role = raw_doc.get('functional_role', []) or []
                experience_level = raw_doc.get('experience_level')
                sdgs = raw_doc.get('sdgs', []) or []
                matched_keywords = raw_doc.get('matched_keywords', []) or []
                
                normalized_doc = {
                    'id': str(raw_doc['id']) if raw_doc.get('id') else None,
                    'org_name': raw_doc.get('org_name'),
                    'title': raw_doc.get('title'),
                    'location_raw': raw_doc.get('location_raw'),
                    'country_iso': country_iso,
                    'level_norm': level_norm,
                    'deadline': deadline.isoformat() if deadline else None,
                    'apply_url': raw_doc.get('apply_url'),
                    'last_seen_at': last_seen_at.isoformat() if last_seen_at else None,
                    'mission_tags': mission_tags if mission_tags else [],
                    'international_eligible': international_eligible,
                    'work_modality': work_modality,
                    'benefits': benefits if benefits else [],
                    'policy_flags': policy_flags if policy_flags else [],
                    'donor_context': donor_context if donor_context else [],
                    'crisis_type': raw_doc.get('crisis_type', []),
                    'response_phase': raw_doc.get('response_phase'),
                    'humanitarian_cluster': raw_doc.get('humanitarian_cluster', []),
                    'contract_urgency': raw_doc.get('contract_urgency'),
                    'contract_duration_months': contract_duration,
                    'compensation_visible': raw_doc.get('compensation_visible', False),
                    'compensation_type': raw_doc.get('compensation_type'),
                    'compensation_min_usd': raw_doc.get('compensation_min_usd'),
                    'compensation_max_usd': raw_doc.get('compensation_max_usd'),
                    'compensation_currency': raw_doc.get('compensation_currency'),
                    'status': raw_doc.get('status', 'active'),
                    'impact_domain': impact_domain,
                    'functional_role': functional_role,
                    'experience_level': experience_level,
                    'sdgs': sdgs,
                    'matched_keywords': matched_keywords,
                    'low_confidence': raw_doc.get('low_confidence', False),
                    'raw_metadata': {
                        'unknown': unknowns
                    }
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
            
            # Log reindex summary (dev-only)
            env = os.getenv("AIDJOBS_ENV", "").lower()
            if env == "dev":
                logger.info(
                    f"[analytics] reindex complete: indexed={indexed_count} "
                    f"skipped={skipped_count} duration={duration_ms}ms"
                )
            
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
