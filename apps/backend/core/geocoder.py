"""
Location Geocoding Module
Converts location strings to structured geographic data (lat/lon, country, city).

Uses Nominatim (free) as primary, with Google Geocoding API as fallback.
"""

import logging
import os
import time
from typing import Dict, Optional, Tuple
import httpx
import asyncio

logger = logging.getLogger(__name__)


class Geocoder:
    """
    Geocode location strings to structured data.
    
    Supports:
    - Nominatim (free, no API key required)
    - Google Geocoding API (requires API key, more accurate)
    """
    
    def __init__(self):
        """Initialize geocoder with configuration"""
        self.nominatim_url = "https://nominatim.openstreetmap.org/search"
        self.google_api_key = os.getenv('GOOGLE_GEOCODING_API_KEY')
        self.google_url = "https://maps.googleapis.com/maps/api/geocode/json"
        
        # Rate limiting for Nominatim (1 request per second)
        self._last_nominatim_request = 0
        self._nominatim_delay = 1.0  # 1 second between requests
        
        # Cache for geocoding results (in-memory, simple dict)
        self._cache: Dict[str, Dict] = {}
        self._cache_max_size = 1000
    
    def _get_cached(self, location: str) -> Optional[Dict]:
        """Get cached geocoding result"""
        cache_key = location.lower().strip()
        return self._cache.get(cache_key)
    
    def _set_cached(self, location: str, result: Dict):
        """Cache geocoding result"""
        cache_key = location.lower().strip()
        if len(self._cache) >= self._cache_max_size:
            # Remove oldest entry (simple FIFO)
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
        self._cache[cache_key] = result
    
    async def _geocode_nominatim(self, location: str) -> Optional[Dict]:
        """
        Geocode using Nominatim (free, OpenStreetMap).
        
        Args:
            location: Location string to geocode
            
        Returns:
            Dict with geocoding data or None
        """
        # Rate limiting: wait if needed
        time_since_last = time.time() - self._last_nominatim_request
        if time_since_last < self._nominatim_delay:
            await asyncio.sleep(self._nominatim_delay - time_since_last)
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    self.nominatim_url,
                    params={
                        'q': location,
                        'format': 'json',
                        'limit': 1,
                        'addressdetails': 1
                    },
                    headers={
                        'User-Agent': 'AidJobs/1.0 (contact@aidjobs.app)'
                    }
                )
                
                self._last_nominatim_request = time.time()
                
                if response.status_code != 200:
                    return None
                
                data = response.json()
                if not data or len(data) == 0:
                    return None
                
                result = data[0]
                
                # Extract structured data
                address = result.get('address', {})
                return {
                    'latitude': float(result.get('lat', 0)),
                    'longitude': float(result.get('lon', 0)),
                    'country': address.get('country', ''),
                    'country_code': address.get('country_code', '').upper(),
                    'city': address.get('city') or address.get('town') or address.get('village', ''),
                    'state': address.get('state', ''),
                    'display_name': result.get('display_name', location),
                    'source': 'nominatim'
                }
        
        except Exception as e:
            logger.debug(f"Nominatim geocoding failed for '{location}': {e}")
            return None
    
    async def _geocode_google(self, location: str) -> Optional[Dict]:
        """
        Geocode using Google Geocoding API (requires API key).
        
        Args:
            location: Location string to geocode
            
        Returns:
            Dict with geocoding data or None
        """
        if not self.google_api_key:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    self.google_url,
                    params={
                        'address': location,
                        'key': self.google_api_key
                    }
                )
                
                if response.status_code != 200:
                    return None
                
                data = response.json()
                if data.get('status') != 'OK' or not data.get('results'):
                    return None
                
                result = data['results'][0]
                location_data = result['geometry']['location']
                address_components = result.get('address_components', [])
                
                # Extract country and city from address components
                country = ''
                country_code = ''
                city = ''
                state = ''
                
                for component in address_components:
                    types = component.get('types', [])
                    if 'country' in types:
                        country = component.get('long_name', '')
                        country_code = component.get('short_name', '').upper()
                    elif 'locality' in types or 'administrative_area_level_1' in types:
                        if not city:
                            city = component.get('long_name', '')
                    elif 'administrative_area_level_1' in types:
                        state = component.get('long_name', '')
                
                return {
                    'latitude': location_data.get('lat', 0),
                    'longitude': location_data.get('lng', 0),
                    'country': country,
                    'country_code': country_code,
                    'city': city,
                    'state': state,
                    'display_name': result.get('formatted_address', location),
                    'source': 'google'
                }
        
        except Exception as e:
            logger.debug(f"Google geocoding failed for '{location}': {e}")
            return None
    
    async def geocode(
        self,
        location: str,
        use_google: bool = False
    ) -> Optional[Dict]:
        """
        Geocode a location string.
        
        Args:
            location: Location string (e.g., "Lagos, Nigeria" or "Remote")
            use_google: Whether to prefer Google over Nominatim
            
        Returns:
            Dict with geocoding data or None
        """
        if not location or not location.strip():
            return None
        
        location = location.strip()
        
        # Check for remote/work from home
        location_lower = location.lower()
        if any(term in location_lower for term in ['remote', 'work from home', 'wfh', 'virtual', 'online', 'anywhere']):
            return {
                'latitude': None,
                'longitude': None,
                'country': None,
                'country_code': None,
                'city': None,
                'state': None,
                'display_name': 'Remote',
                'source': 'heuristic',
                'is_remote': True
            }
        
        # Check cache
        cached = self._get_cached(location)
        if cached:
            return cached
        
        # Try geocoding
        result = None
        
        if use_google and self.google_api_key:
            # Try Google first if requested and available
            result = await self._geocode_google(location)
        
        if not result:
            # Fall back to Nominatim
            result = await self._geocode_nominatim(location)
        
        if result:
            # Cache the result
            self._set_cached(location, result)
            return result
        
        return None
    
    async def geocode_batch(
        self,
        locations: list[str],
        use_google: bool = False,
        delay: float = 1.0
    ) -> Dict[str, Optional[Dict]]:
        """
        Geocode multiple locations with rate limiting.
        
        Args:
            locations: List of location strings
            use_google: Whether to prefer Google
            delay: Delay between requests (seconds)
            
        Returns:
            Dict mapping location -> geocoding result
        """
        results = {}
        
        for location in locations:
            result = await self.geocode(location, use_google=use_google)
            results[location] = result
            
            # Rate limiting delay
            if delay > 0:
                await asyncio.sleep(delay)
        
        return results


# Global instance (lazy initialization)
_geocoder: Optional[Geocoder] = None


def get_geocoder() -> Geocoder:
    """Get or create the global geocoder instance"""
    global _geocoder
    
    if _geocoder is None:
        _geocoder = Geocoder()
    
    return _geocoder

