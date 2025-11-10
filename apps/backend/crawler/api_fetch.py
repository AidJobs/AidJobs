"""
API-based job fetching (JSON endpoints) with v1 schema support.

Supports:
- Versioned JSON schema (v1)
- Authentication (API key, Bearer, Basic, OAuth2)
- Pagination (offset, page, cursor)
- Field mapping with dot notation and arrays
- Secrets management ({{SECRET:NAME}})
- POST/PUT requests
- Custom headers and query parameters
"""
import logging
import json
import time
import base64
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse
import jsonpath_ng
from jsonpath_ng.ext import parse

from core.net import HTTPClient
from core.secrets import resolve_secrets, check_required_secrets, mask_secrets

logger = logging.getLogger(__name__)


class APICrawler:
    """JSON API crawler with v1 schema support"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.http_client = HTTPClient()
    
    async def fetch_api(
        self,
        url: str,
        parser_hint: Optional[str] = None,
        last_success_at: Optional[datetime] = None
    ) -> List[Dict]:
        """
        Fetch JSON API and extract jobs using v1 schema.
        
        Args:
            url: Base URL (for legacy support, or base_url from schema)
            parser_hint: JSON schema (v1) or legacy format
            last_success_at: Last successful crawl time for incremental fetching
        
        Returns:
            List of raw job dicts
        """
        try:
            # Parse schema
            if not parser_hint:
                # Try auto-detection
                return await self._fetch_auto(url)
            
            schema = json.loads(parser_hint)
            
            # Check version
            version = schema.get("v")
            if version == 1:
                return await self._fetch_v1(schema, url, last_success_at)
            else:
                # Legacy format or auto-detect
                logger.warning(f"[api_fetch] Unknown schema version: {version}, trying legacy format")
                return await self._fetch_legacy(url, parser_hint)
        
        except json.JSONDecodeError as e:
            logger.error(f"[api_fetch] Invalid JSON schema: {e}")
            raise ValueError(f"Invalid JSON schema: {e}")
        except ValueError as e:
            # Re-raise validation errors
            raise
        except Exception as e:
            logger.error(f"[api_fetch] Error fetching API {url}: {e}")
            raise RuntimeError(f"Failed to fetch API {url}: {e}")
    
    async def _fetch_v1(
        self,
        schema: Dict[str, Any],
        base_url: Optional[str],
        last_success_at: Optional[datetime]
    ) -> List[Dict]:
        """Fetch using v1 schema"""
        # Validate schema version
        version = schema.get("v")
        if version != 1:
            raise ValueError(f"Unsupported schema version: {version}. Expected v=1")
        
        # Check required secrets BEFORE resolving (to detect missing ones)
        missing_secrets = check_required_secrets(schema)
        if missing_secrets:
            logger.error(f"[api_fetch] Missing required secrets: {missing_secrets}")
            raise ValueError(f"Missing required secrets: {', '.join(missing_secrets)}")
        
        # Resolve secrets (after validation)
        schema = resolve_secrets(schema)
        
        # Get configuration
        config_base_url = schema.get("base_url") or base_url
        if not config_base_url:
            raise ValueError("base_url is required in v1 schema")
        
        path = schema.get("path", "/")
        method = schema.get("method", "GET").upper()
        auth_config = schema.get("auth", {})
        headers = schema.get("headers", {})
        query = schema.get("query", {})
        body = schema.get("body")
        pagination = schema.get("pagination", {})
        since_config = schema.get("since", {})
        data_path = schema.get("data_path", "data")
        field_map = schema.get("map", {})
        transforms = schema.get("transforms", {})
        success_codes = schema.get("success_codes", [200, 201])
        throttle_config = schema.get("throttle", {})
        retry_config = schema.get("retry", {})
        
        # Build full URL
        full_url = urljoin(config_base_url.rstrip("/") + "/", path.lstrip("/"))
        
        # Handle authentication
        auth_header, auth_extra_headers, auth_query_params = await self._get_auth_header(auth_config)
        
        # Merge auth query params with base query
        if auth_query_params:
            query = {**query, **auth_query_params}
        
        # Merge auth headers with base headers (for custom header auth)
        if auth_extra_headers:
            headers = {**headers, **auth_extra_headers}
        
        # Calculate since value for incremental fetching (will be injected per-page)
        since_value = None
        if since_config.get("enabled"):
            if last_success_at:
                since_value = self._format_since_value(last_success_at, since_config)
            else:
                # Fallback to fallback_days if no last_success_at
                fallback_days = since_config.get("fallback_days", 14)
                fallback_date = datetime.utcnow() - timedelta(days=fallback_days)
                since_value = self._format_since_value(fallback_date, since_config)
        
        # Fetch all pages
        all_jobs = []
        page_count = 0
        max_pages = pagination.get("max_pages", 50)
        until_empty = pagination.get("until_empty", True)
        
        cursor = None
        page = 1
        offset = 0
        
        while True:
            # Build request parameters for this page (create new dicts to avoid mutations)
            page_query = dict(query) if query else {}
            page_body = dict(body) if body and isinstance(body, dict) else (body.copy() if body else None)
            
            # Inject since parameter if enabled
            if since_value and since_config.get("enabled"):
                since_field = since_config.get("field", "since")
                if method == "GET":
                    page_query[since_field] = since_value
                elif method in ["POST", "PUT"] and page_body and isinstance(page_body, dict):
                    page_body[since_field] = since_value
            
            # Handle pagination
            pagination_type = pagination.get("type")
            if pagination_type:
                page_size = pagination.get("page_size", 100)
                
                if pagination_type == "offset":
                    page_query[pagination.get("offset_param", "offset")] = offset
                    page_query[pagination.get("limit_param", "limit")] = page_size
                elif pagination_type == "page":
                    page_query[pagination.get("page_param", "page")] = page
                    page_query[pagination.get("limit_param", "limit")] = page_size
                elif pagination_type == "cursor":
                    # For cursor pagination, only add cursor if we have one (first page has no cursor)
                    if cursor is not None:
                        cursor_param = pagination.get("cursor_param", "cursor")
                        if method == "GET":
                            page_query[cursor_param] = cursor
                        elif method in ["POST", "PUT"] and page_body and isinstance(page_body, dict):
                            page_body[cursor_param] = cursor
            # If no pagination type specified, fetch only first page
            
            # Make request with throttling
            try:
                # Enable throttling if configured
                throttle_enabled = throttle_config.get("enabled", False) if throttle_config else False
                throttle_for_fetch = {
                    "enabled": throttle_enabled,
                    "requests_per_minute": throttle_config.get("requests_per_minute", 30) if throttle_config else 30,
                    "burst": throttle_config.get("burst", 5) if throttle_config else 5,
                } if throttle_enabled else None
                
                status, response_headers, response_body, size = await self.http_client.fetch(
                    url=full_url,
                    method=method,
                    headers=headers,
                    params=page_query,
                    json_data=page_body,
                    auth_header=auth_header,
                    max_size_kb=2048,
                    throttle_config=throttle_for_fetch
                )
            except Exception as e:
                logger.error(f"[api_fetch] Request failed: {e}")
                # Apply retry logic if configured
                max_retries = retry_config.get("max_retries", 0) if retry_config else 0
                backoff_ms = retry_config.get("backoff_ms", 1000) if retry_config else 1000
                if page_count == 0 and max_retries > 0:
                    # Retry first page failure
                    logger.info(f"[api_fetch] Retrying request (max_retries={max_retries})...")
                    await asyncio.sleep(backoff_ms / 1000.0)
                    continue
                break
            
            # Check success codes
            if status not in success_codes:
                error_msg = f"Non-success status {status} for {full_url}"
                error_category = "unknown"
                
                if status == 401:
                    error_msg = f"Authentication failed (401) for {full_url} - check credentials"
                    error_category = "authentication"
                elif status == 403:
                    error_msg = f"Access forbidden (403) for {full_url} - check permissions"
                    error_category = "authorization"
                elif status == 404:
                    error_msg = f"Resource not found (404) for {full_url}"
                    error_category = "not_found"
                elif status == 429:
                    error_msg = f"Rate limit exceeded (429) for {full_url} - consider enabling throttling"
                    error_category = "rate_limit"
                elif status >= 500:
                    error_msg = f"Server error ({status}) for {full_url} - API server issue"
                    error_category = "server_error"
                elif status >= 400:
                    error_msg = f"Client error ({status}) for {full_url}"
                    error_category = "client_error"
                
                logger.warning(f"[api_fetch] {error_msg} (category: {error_category})")
                if page_count == 0:
                    # Raise a more descriptive error for first page failures
                    raise ValueError(f"{error_category}: {error_msg}")
                break  # Stop pagination on error
            
            # Parse JSON
            try:
                data = json.loads(response_body.decode('utf-8'))
            except json.JSONDecodeError as e:
                logger.error(f"[api_fetch] Invalid JSON response: {e}")
                break
            
            # Extract data at data_path
            items = self._extract_data_path(data, data_path)
            
            if not items:
                logger.info(f"[api_fetch] No items found at data_path '{data_path}'")
                break
            
            # Map fields
            page_jobs = []
            for item in items:
                job = self._map_fields(item, field_map, transforms)
                if job.get("title"):  # Require title
                    page_jobs.append(job)
            
            all_jobs.extend(page_jobs)
            page_count += 1
            
            # Check if we should continue pagination
            if pagination_type == "cursor":
                cursor = self._extract_cursor(data, pagination.get("cursor_path"))
                if not cursor:
                    break
            elif pagination_type == "offset":
                offset += len(items)
                if len(items) < page_size:
                    break
            elif pagination_type == "page":
                page += 1
                if len(items) < page_size:
                    break
            
            # Check limits
            if page_count >= max_pages:
                logger.warning(f"[api_fetch] Reached max_pages limit: {max_pages}")
                break
            
            if until_empty and len(items) == 0:
                break
        
        logger.info(f"[api_fetch] Fetched {len(all_jobs)} jobs from {page_count} pages")
        return all_jobs
    
    async def _get_auth_header(
        self, 
        auth_config: Dict[str, Any]
    ) -> Tuple[Optional[str], Optional[Dict[str, str]], Optional[Dict[str, str]]]:
        """
        Get authentication header, extra headers, and query parameters based on auth configuration.
        
        Returns:
            Tuple of (auth_header, auth_extra_headers, auth_query_params)
            - auth_header: Authorization header value (for Bearer/Basic)
            - auth_extra_headers: Additional headers (for custom header auth)
            - auth_query_params: Query parameters (for query auth)
        """
        auth_type = auth_config.get("type", "none")
        
        if auth_type == "none":
            return None, None, None
        elif auth_type == "header":
            header_name = auth_config.get("header_name", "Authorization")
            token = auth_config.get("token")
            if token:
                # For custom header, return as extra headers
                return None, {header_name: token}, None
        elif auth_type == "query":
            query_name = auth_config.get("query_name", "api_key")
            token = auth_config.get("token")
            if token:
                # For query auth, return as query params
                return None, None, {query_name: token}
        elif auth_type == "bearer":
            token = auth_config.get("token")
            if token:
                # Bearer token goes in Authorization header
                return f"Bearer {token}", None, None
        elif auth_type == "basic":
            username = auth_config.get("username")
            password = auth_config.get("password")
            if username and password:
                credentials = f"{username}:{password}"
                encoded = base64.b64encode(credentials.encode()).decode()
                return f"Basic {encoded}", None, None
        elif auth_type == "oauth2_client_credentials":
            oauth2_config = auth_config.get("oauth2", {})
            token_url = oauth2_config.get("token_url")
            client_id = oauth2_config.get("client_id")
            client_secret = oauth2_config.get("client_secret")
            scope = oauth2_config.get("scope")
            
            if token_url and client_id and client_secret:
                try:
                    token = await self.http_client.get_oauth2_token(
                        token_url, client_id, client_secret, scope
                    )
                    return f"Bearer {token}", None, None
                except Exception as e:
                    logger.error(f"[api_fetch] OAuth2 token fetch failed: {e}")
                    raise
        
        return None, None, None
    
    def _format_since_value(self, last_success_at: datetime, since_config: Dict[str, Any]) -> Optional[str]:
        """Format since value based on configuration"""
        format_type = since_config.get("format", "iso8601")
        
        if format_type == "iso8601":
            return last_success_at.isoformat() + "Z"
        elif format_type == "unix_ms":
            return str(int(last_success_at.timestamp() * 1000))
        elif format_type == "unix":
            return str(int(last_success_at.timestamp()))
        else:
            logger.warning(f"[api_fetch] Unknown since format: {format_type}")
            return None
    
    def _extract_data_path(self, data: Any, data_path: str) -> List[Dict]:
        """Extract data at data_path using JSONPath"""
        if not data_path or data_path == ".":
            # Root level, check if it's a list or dict with common keys
            if isinstance(data, list):
                return data
            elif isinstance(data, dict):
                # Try common keys
                for key in ["data", "items", "results", "jobs"]:
                    if key in data and isinstance(data[key], list):
                        return data[key]
                # Return as single item list
                return [data]
            return []
        
        try:
            expr = parse(data_path)
            matches = expr.find(data)
            items = [match.value for match in matches]
            
            # Flatten if needed
            if items and isinstance(items[0], list):
                flattened = []
                for item in items:
                    if isinstance(item, list):
                        flattened.extend(item)
                    else:
                        flattened.append(item)
                return flattened
            
            return items if isinstance(items, list) else [items] if items else []
        except Exception as e:
            logger.error(f"[api_fetch] Error extracting data_path '{data_path}': {e}")
            return []
    
    def _map_fields(self, item: Dict, field_map: Dict[str, str], transforms: Dict[str, Any]) -> Dict:
        """Map fields from API response to job format"""
        job = {}
        
        for target_field, source_path in field_map.items():
            value = self._extract_field_value(item, source_path)
            if value is not None:
                # Apply transforms
                if target_field in transforms:
                    value = self._apply_transforms(value, transforms[target_field])
                job[target_field] = value
        
        return job
    
    def _extract_field_value(self, item: Dict, path: str) -> Any:
        """Extract field value using dot notation or JSONPath"""
        if not path:
            return None
        
        # Try JSONPath first (if it starts with $)
        if path.startswith("$"):
            try:
                expr = parse(path)
                matches = expr.find(item)
                if matches:
                    return matches[0].value
            except Exception:
                pass
        
        # Try dot notation
        try:
            parts = path.split(".")
            value = item
            for part in parts:
                # Handle array access like "tags[0]"
                if "[" in part and "]" in part:
                    key, index_str = part.split("[")
                    index = int(index_str.rstrip("]"))
                    if isinstance(value, dict) and key in value:
                        arr = value[key]
                        if isinstance(arr, list) and 0 <= index < len(arr):
                            value = arr[index]
                        else:
                            return None
                    else:
                        return None
                else:
                    if isinstance(value, dict) and part in value:
                        value = value[part]
                    else:
                        return None
            return value
        except (KeyError, IndexError, ValueError, TypeError):
            return None
    
    def _apply_transforms(self, value: Any, transform_config: Dict[str, Any]) -> Any:
        """
        Apply transforms to a value with enhanced error handling.
        
        Supported transforms:
        - lower: Convert string to lowercase
        - upper: Convert string to uppercase
        - strip: Remove leading/trailing whitespace
        - join: Join array elements with separator (string or dict with separator)
        - first: Get first element of array
        - map_table: Map values using lookup table
        - date_parse: Parse date strings (iso8601, unix, unix_ms)
        - default: Set default value if null/empty
        """
        if not transform_config:
            return value
        
        try:
            # Handle array transforms first
            if isinstance(value, list):
                if "first" in transform_config:
                    if transform_config["first"]:  # Only if explicitly enabled
                        return value[0] if value else None
                if "join" in transform_config:
                    join_config = transform_config["join"]
                    if isinstance(join_config, str):
                        separator = join_config
                    elif isinstance(join_config, dict):
                        separator = join_config.get("separator", ",")
                    else:
                        separator = ","
                    return separator.join(str(v) for v in value if v is not None)
            
            # Convert to string for string transforms if needed
            original_value = value
            if not isinstance(value, str) and value is not None:
                # Try to convert to string for string transforms
                if any(key in transform_config for key in ["lower", "upper", "strip"]):
                    value = str(value)
            
            # String transforms
            if isinstance(value, str):
                if transform_config.get("lower") is True:
                    value = value.lower()
                if transform_config.get("upper") is True:
                    value = value.upper()
                if transform_config.get("strip") is True:
                    value = value.strip()
            
            # Map table transform (works on any type that can be a dict key)
            if "map_table" in transform_config:
                map_table = transform_config["map_table"]
                if isinstance(map_table, dict):
                    # Try original value first, then string representation
                    if original_value in map_table:
                        return map_table[original_value]
                    elif str(original_value) in map_table:
                        return map_table[str(original_value)]
            
            # Default value (check after all transforms)
            if "default" in transform_config:
                if value is None or value == "" or (isinstance(value, list) and len(value) == 0):
                    return transform_config["default"]
            
            # Date parsing (convert to ISO string or datetime object)
            if "date_parse" in transform_config:
                format_type = transform_config["date_parse"]
                try:
                    if format_type == "iso8601":
                        from dateutil import parser as date_parser
                        parsed_date = date_parser.parse(str(value))
                        # Return as ISO string for consistency
                        return parsed_date.isoformat() + "Z"
                    elif format_type == "unix_ms":
                        timestamp = int(float(value)) / 1000
                        parsed_date = datetime.fromtimestamp(timestamp)
                        return parsed_date.isoformat() + "Z"
                    elif format_type == "unix":
                        timestamp = int(float(value))
                        parsed_date = datetime.fromtimestamp(timestamp)
                        return parsed_date.isoformat() + "Z"
                except (ValueError, TypeError, OverflowError) as e:
                    logger.warning(f"[api_fetch] Date parse failed for value '{value}': {e}")
                    # Return original value on parse failure
                    return value
            
            return value
        
        except Exception as e:
            logger.error(f"[api_fetch] Transform error for value '{value}': {e}")
            # Return original value on any error
            return original_value if 'original_value' in locals() else value
    
    def _extract_cursor(self, data: Dict, cursor_path: Optional[str]) -> Optional[str]:
        """Extract cursor for next page"""
        if not cursor_path:
            # Try common patterns
            for key in ["next_cursor", "cursor", "page_token", "next_page"]:
                if key in data:
                    return str(data[key])
            # Check for next_url
            if "next_url" in data:
                return data["next_url"]
            return None
        
        try:
            expr = parse(cursor_path)
            matches = expr.find(data)
            if matches:
                return str(matches[0].value)
        except Exception:
            pass
        
        return None
    
    async def _fetch_legacy(self, url: str, parser_hint: str) -> List[Dict]:
        """Fetch using legacy format (backward compatibility)"""
        try:
            status, headers, body, size = await self.http_client.fetch(url, max_size_kb=2048)
            
            if status != 200:
                logger.warning(f"[api_fetch] Non-200 status for {url}: {status}")
                return []
            
            data = json.loads(body.decode('utf-8'))
            hint = json.loads(parser_hint)
            
            # Use legacy extraction
            jobs_expr = parse(hint.get('jobs_path', '$[*]'))
            job_items = [match.value for match in jobs_expr.find(data)]
            
            jobs = []
            for item in job_items:
                job = {}
                
                if 'title_path' in hint:
                    title_expr = parse(hint['title_path'])
                    matches = title_expr.find(item)
                    if matches:
                        job['title'] = matches[0].value
                
                if 'url_path' in hint:
                    url_expr = parse(hint['url_path'])
                    matches = url_expr.find(item)
                    if matches:
                        job['apply_url'] = matches[0].value
                
                if 'location_path' in hint:
                    loc_expr = parse(hint['location_path'])
                    matches = loc_expr.find(item)
                    if matches:
                        job['location_raw'] = matches[0].value
                
                if 'description_path' in hint:
                    desc_expr = parse(hint['description_path'])
                    matches = desc_expr.find(item)
                    if matches:
                        job['description_snippet'] = str(matches[0].value)[:500]
                
                if job.get('title'):
                    jobs.append(job)
            
            logger.info(f"[api_fetch] Extracted {len(jobs)} jobs using legacy format")
            return jobs
        
        except Exception as e:
            logger.error(f"[api_fetch] Error in legacy fetch: {e}")
            return []
    
    async def _fetch_auto(self, url: str) -> List[Dict]:
        """Auto-detect jobs in common JSON structures"""
        try:
            status, headers, body, size = await self.http_client.fetch(url, max_size_kb=2048)
            
            if status != 200:
                return []
            
            data = json.loads(body.decode('utf-8'))
            
            # Common patterns
            job_arrays = []
            if isinstance(data, list):
                job_arrays = data
            elif isinstance(data, dict):
                for key in ['jobs', 'results', 'items', 'data', 'positions', 'vacancies']:
                    if key in data:
                        val = data[key]
                        if isinstance(val, list):
                            job_arrays = val
                            break
                        elif isinstance(val, dict) and 'jobs' in val:
                            job_arrays = val['jobs']
                            break
            
            if not job_arrays:
                return []
            
            jobs = []
            for item in job_arrays:
                if not isinstance(item, dict):
                    continue
                
                job = {}
                for key in ['title', 'name', 'position', 'job_title']:
                    if key in item:
                        job['title'] = str(item[key])
                        break
                
                for key in ['url', 'link', 'apply_url', 'href', 'job_url']:
                    if key in item:
                        job['apply_url'] = str(item[key])
                        break
                
                for key in ['location', 'city', 'place', 'country']:
                    if key in item:
                        job['location_raw'] = str(item[key])
                        break
                
                for key in ['description', 'summary', 'details', 'snippet']:
                    if key in item:
                        job['description_snippet'] = str(item[key])[:500]
                        break
                
                if job.get('title'):
                    jobs.append(job)
            
            logger.info(f"[api_fetch] Auto-extracted {len(jobs)} jobs")
            return jobs
        
        except Exception as e:
            logger.error(f"[api_fetch] Error in auto-fetch: {e}")
            return []
