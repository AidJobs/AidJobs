"""
Browser-based crawler using Playwright for JavaScript-heavy sites.
"""
import logging
import re
import hashlib
from typing import Optional, List, Dict
from playwright.async_api import async_playwright, Browser, Page

logger = logging.getLogger(__name__)


class BrowserCrawler:
    """Use headless browser for JavaScript-rendered pages"""
    
    def __init__(self):
        self.browser: Optional[Browser] = None
    
    async def fetch_html(self, url: str, wait_selector: Optional[str] = None, timeout: int = 30000) -> str:
        """
        Fetch HTML from URL using browser rendering.
        
        Args:
            url: URL to fetch
            wait_selector: CSS selector to wait for (e.g., 'div.job-listing')
            timeout: Maximum wait time in milliseconds
        
        Returns:
            Rendered HTML content
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Set realistic headers
            await page.set_extra_http_headers({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            })
            
            try:
                # Navigate with networkidle wait
                await page.goto(url, wait_until='networkidle', timeout=timeout)
                
                # Wait for specific selector if provided
                if wait_selector:
                    try:
                        await page.wait_for_selector(wait_selector, timeout=timeout)
                    except Exception as e:
                        logger.warning(f"Selector {wait_selector} not found: {e}")
                
                # Additional wait for dynamic content
                await page.wait_for_timeout(2000)  # Wait 2 seconds for AJAX
                
                # Get rendered HTML (final DOM after all JS execution)
                html = await page.content()
                
                return html
            except Exception as e:
                logger.error(f"Browser fetch failed for {url}: {e}")
                # Capture screenshot on error for debugging
                try:
                    screenshot_path = f"/tmp/browser_error_{hashlib.sha256(url.encode()).hexdigest()[:8]}.png"
                    await page.screenshot(path=screenshot_path, full_page=True)
                    logger.info(f"Screenshot saved: {screenshot_path}")
                except Exception as screenshot_error:
                    logger.debug(f"Failed to capture screenshot: {screenshot_error}")
                return ""
            finally:
                await browser.close()
    
    async def monitor_network(self, url: str, pattern: str = "api|json|jobs") -> List[Dict]:
        """
        Monitor network requests to find API endpoints.
        
        Args:
            url: URL to monitor
            pattern: Regex pattern to match API URLs
        
        Returns:
            List of API endpoints found
        """
        api_endpoints = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            def handle_response(response):
                url = response.url
                if re.search(pattern, url, re.I):
                    try:
                        api_endpoints.append({
                            'url': url,
                            'method': response.request.method,
                            'status': response.status,
                            'content_type': response.headers.get('content-type', ''),
                            'headers': dict(response.headers)
                        })
                    except Exception as e:
                        logger.debug(f"Error capturing response: {e}")
            
            page.on('response', handle_response)
            
            try:
                await page.goto(url, wait_until='networkidle')
                await page.wait_for_timeout(5000)  # Wait for AJAX calls
            except Exception as e:
                logger.warning(f"Error monitoring network: {e}")
            finally:
                await browser.close()
        
        return api_endpoints

