"""
Simple API crawler - extracts jobs from JSON APIs.
"""

import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx
import psycopg2

from contracts.admission import admit_batch, extraction_logger_for, log_admission_rejections
from contracts.outbound import FetchError, current_budget, fetch_url
from contracts.identity import heuristics_enabled
from contracts.persist import persist_candidate
from contracts.persist import created_ids
from contracts.refusal import refusal
from contracts.run_ownership import OwnershipLost, confirm_running, save_failure_outcome
from app.log_safety import redact_exception, stored_text
from app.search_projection import commit_and_schedule

logger = logging.getLogger(__name__)


class SimpleAPICrawler:
    """Simple JSON API crawler"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.timeout = httpx.Timeout(30.0)
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url, connect_timeout=10)
    
    async def fetch_api(self, url: str, headers: Optional[Dict] = None) -> Optional[Dict]:
        """Fetch JSON from API"""
        try:
            # The fetch policy sets the identity; a source's own headers cannot replace it.
            request_headers = {
                key: value for key, value in (headers or {}).items()
                if str(key).lower() not in ("user-agent", "from")
            }
            result = await fetch_url(
                url,
                headers=request_headers,
                timeout=float(self.timeout.connect or 30.0),
            )
            if result.status_code != 200 or refusal(result.status_code, result.headers, result.text):
                logger.error(f"API fetch failed: HTTP {result.status_code}")
                return None
            return json.loads(result.body.decode("utf-8"))
        except FetchError as exc:
            logger.error(f"Error fetching API {url}: {exc}")
            return None
        except Exception as e:
            logger.error(f"Error fetching API {url}: {e}")
            return None
    
    def extract_jobs_from_json(self, data: Dict, base_url: str) -> List[Dict]:
        """
        Extract jobs from JSON API response.
        
        Tries common patterns:
        - data.jobs[]
        - data.results[]
        - data.items[]
        - data[]
        - jobs[]
        - results[]
        """
        jobs = []
        
        # Try to find job array
        job_array = None
        
        if isinstance(data, dict):
            # Common patterns
            for key in ['jobs', 'results', 'items', 'data', 'positions', 'vacancies']:
                if key in data and isinstance(data[key], list):
                    job_array = data[key]
                    break
            
            # If no key found, check if data itself is a list
            if not job_array and isinstance(data.get('data'), list):
                job_array = data['data']
        elif isinstance(data, list):
            job_array = data
        
        if not job_array:
            logger.warning("Could not find job array in JSON response")
            return []
        
        # Use pipeline extractor for unified schema
        try:
            from pipeline.extractor import Extractor
            extractor = Extractor(enable_ai=False, enable_snapshots=False, shadow_mode=False)
        except ImportError:
            extractor = None
        
        # Extract jobs from array
        for item in job_array:
            if not isinstance(item, dict):
                continue
            
            # Use pipeline if available
            if extractor:
                import asyncio
                try:
                    result = asyncio.run(extractor.extract_from_json(item, base_url))
                    result_dict = result.to_dict()
                    
                    # Convert to existing format
                    job = {}
                    if result_dict['fields']['title']['value']:
                        job['title'] = result_dict['fields']['title']['value']
                    if result_dict['fields']['application_url']['value']:
                        job['apply_url'] = result_dict['fields']['application_url']['value']
                    if result_dict['fields']['description']['value']:
                        job['description_snippet'] = result_dict['fields']['description']['value'][:500]
                    if result_dict['fields']['location']['value']:
                        job['location_raw'] = result_dict['fields']['location']['value']
                    if result_dict['fields']['deadline']['value']:
                        job['deadline'] = result_dict['fields']['deadline']['value']
                    
                    if job.get('title'):
                        jobs.append(job)
                    continue
                except Exception as e:
                    logger.debug(f"Pipeline extraction failed, using fallback: {e}")
            
            # Fallback to simple extraction
            job = {}
            
            # Common field names
            title_fields = ['title', 'name', 'position', 'job_title', 'position_title']
            url_fields = ['url', 'link', 'apply_url', 'application_url', 'job_url', 'href']
            location_fields = ['location', 'duty_station', 'city', 'country', 'place']
            deadline_fields = ['deadline', 'closing_date', 'application_deadline', 'due_date']
            
            # Extract title
            for field in title_fields:
                if field in item and item[field]:
                    job['title'] = str(item[field]).strip()
                    break
            
            # Extract URL
            for field in url_fields:
                if field in item and item[field]:
                    url = str(item[field]).strip()
                    if url and not url.startswith('#') and not url.startswith('javascript:'):
                        job['apply_url'] = url
                        break
            
            # If no direct URL, try to construct from ID
            if 'apply_url' not in job:
                for id_field in ['id', 'job_id', 'position_id']:
                    if id_field in item:
                        job_id = str(item[id_field])
                        # Try common URL patterns
                        if base_url:
                            job['apply_url'] = f"{base_url.rstrip('/')}/{job_id}"
                            break
            
            # Extract location
            for field in location_fields:
                if field in item and item[field]:
                    job['location_raw'] = str(item[field]).strip()
                    break
            
            # Extract deadline
            for field in deadline_fields:
                if field in item and item[field]:
                    job['deadline'] = str(item[field]).strip()
                    break
            
            # Only add if we have title and URL
            if job.get('title') and job.get('apply_url'):
                jobs.append(job)
        
        logger.info(f"Extracted {len(jobs)} jobs from JSON API")
        return jobs
    
    def save_jobs(
        self,
        jobs: List[Dict],
        source_id: str,
        org_name: str,
        base_url: Optional[str] = None,
        *,
        run_token: Optional[str] = None,
        loop=None,
    ) -> Dict:
        """Save jobs as the run that owns the source, one savepoint per job.

        Without a valid running run token nothing is written and OwnershipLost is raised.
        """
        if not run_token:
            raise OwnershipLost("save_jobs needs a run token")
        if not jobs:
            return {'inserted': 0, 'updated': 0, 'skipped': 0, 'failed': 0, 'validated': 0}
        
        # Ensure apply_url exists - use fallback if missing
        for job in jobs:
            if not job.get('apply_url'):
                if job.get('url'):
                    job['apply_url'] = job['url']
                elif job.get('detail_url'):
                    job['apply_url'] = job['detail_url']
                elif base_url:
                    job['apply_url'] = base_url
                    logger.debug(f"API job missing apply_url, using base_url as fallback: {job.get('title', '')[:50]}")
                else:
                    job['apply_url'] = f"https://placeholder.missing-url/{abs(hash(job.get('title', '')))}"
                    logger.warning(f"API job missing apply_url and no base_url, using placeholder: {job.get('title', '')[:50]}")
        
        conn = self._get_db_conn()
        inserted = 0
        updated = 0
        skipped = 0
        failed = 0
        validated = 0
        seen_active = []
        not_open = []
        returned = []
        recorded = []
        unrecorded = 0  # rows whose sighting was not recorded (a hidden job seen again is)
        
        try:
            with conn.cursor() as cur:
                open_on = confirm_running(cur, run_token, source_id)
                for job in jobs:
                    title = job.get('title', '').strip()
                    apply_url = job.get('apply_url', '').strip()

                    if not title or not apply_url:
                        skipped += 1
                        unrecorded += 1
                        continue

                    candidate = {
                        "title": title,
                        "apply_url": apply_url,
                    }
                    if "location_raw" in job:
                        raw_location = job.get("location_raw") or ""
                        candidate["location_raw"] = (
                            raw_location.strip() if isinstance(raw_location, str) else raw_location
                        )
                    if job.get("admitted") is True:
                        candidate["admitted"] = True
                    observed_at = datetime.now(timezone.utc)
                    validated += 1
                    recorded_mark = len(recorded)
                    seen_mark = len(seen_active)
                    not_open_mark = len(not_open)
                    returned_mark = len(returned)
                    cur.execute("SAVEPOINT job_save")
                    try:
                        outcome = persist_candidate(
                            cur,
                            candidate,
                            observed_at=observed_at,
                            heuristics=heuristics_enabled(),
                            reference=job.get("reference"),
                            source_id=source_id,
                            org_name=org_name,
                            recorded=recorded,
                            seen=seen_active,
                            not_open=not_open,
                            open_on=open_on,
                            returned=returned,
                        )
                        cur.execute("RELEASE SAVEPOINT job_save")
                    except Exception as exc:
                        # This job only: roll back to its savepoint and drop what it recorded.
                        cur.execute("ROLLBACK TO SAVEPOINT job_save")
                        del recorded[recorded_mark:]
                        del seen_active[seen_mark:]
                        del not_open[not_open_mark:]
                        del returned[returned_mark:]
                        failed += 1
                        logger.error("API job failed to save: %s", redact_exception(exc))
                        continue
                    if outcome == "created":
                        inserted += 1
                    elif outcome == "updated":
                        updated += 1
                    elif outcome == "unchanged":
                        logger.debug("API job unchanged, last_seen_at only: %s", title[:80])
                    else:
                        skipped += 1
                        if outcome != "seen_again":
                            unrecorded += 1
                
                commit_and_schedule(conn, recorded, loop=loop)
        
        except Exception as e:
            logger.error(f"Error saving jobs: {redact_exception(e)}")
            conn.rollback()
            raise
        finally:
            conn.close()
        
        return {
            'inserted': inserted,
            'updated': updated,
            'skipped': skipped,
            'failed': failed,
            'validated': validated,
            'unrecorded': unrecorded,
            'seen_active': seen_active,
            'not_open_ids': not_open,
            'created_ids': created_ids(recorded),
            'returned_ids': returned,
        }
    
    async def crawl_source(self, source: Dict, run=None) -> Dict:
        """Crawl API source"""
        source_id = str(source['id'])
        org_name = source.get('org_name', 'Unknown')
        careers_url = source['careers_url']
        
        logger.info(f"Crawling API {org_name}: {careers_url}")
        
        try:
            # Fetch JSON
            data = await self.fetch_api(careers_url)
            
            if not data:
                budget = current_budget()
                return {
                    'status': 'failed',
                    'message': (f'Refused: {budget.refused}' if budget is not None
                                and budget.refused else 'Failed to fetch API'),
                    'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
                }
            
            # Extract jobs
            jobs = self.extract_jobs_from_json(data, careers_url)
            
            # Save to database. Admission sees the finished list and does not fetch.
            admitted, rejected = admit_batch(jobs, "api")
            await asyncio.to_thread(
                log_admission_rejections, extraction_logger_for(self.db_url), rejected, source_id
            )
            if run is None:
                raise OwnershipLost("crawl_source needs the run that owns the source")
            counts = await run.save(
                self.save_jobs, admitted, source_id, org_name, base_url=careers_url
            )
            status, message = save_failure_outcome(
                'ok' if jobs else 'warn',
                f'Found {len(jobs)} jobs' if jobs else 'No jobs found',
                counts,
            )
            
            return {
                'status': status,
                'message': message,
                'counts': {
                    'found': len(jobs),
                    'inserted': counts['inserted'],
                    'updated': counts['updated'],
                    'skipped': counts['skipped']
                }
            }
        
        except Exception as e:
            logger.error(f"Error crawling API {org_name}: {redact_exception(e)}", exc_info=True)
            return {
                'status': 'failed',
                'message': stored_text(e, 200),
                'counts': {'found': 0, 'inserted': 0, 'updated': 0, 'skipped': 0}
            }

