import requests
from typing import Dict, Any, Optional, List
import json
import time
from datetime import datetime, timedelta
from collections import defaultdict
import hashlib

# Cache configuration
CACHE_DURATION = timedelta(hours=1)
cache = defaultdict(dict)

# Rate limiting configuration
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 30
request_timestamps = []

def is_rate_limited() -> bool:
    """Check if the current request should be rate limited."""
    current_time = time.time()
    # Remove old timestamps
    request_timestamps[:] = [ts for ts in request_timestamps if current_time - ts < RATE_LIMIT_WINDOW]
    
    if len(request_timestamps) >= RATE_LIMIT_MAX_REQUESTS:
        return True
    
    request_timestamps.append(current_time)
    return False

def get_cache_key(query: str) -> str:
    """Generate a cache key for the query."""
    return hashlib.md5(query.encode()).hexdigest()

def web_search(query: str, num_results: int = 3) -> Dict[str, Any]:
    """
    Perform a web search using DuckDuckGo API.
    
    Args:
        query (str): Search query
        num_results (int): Number of results to return
        
    Returns:
        Dict[str, Any]: Search results
    """
    if is_rate_limited():
        return {
            "success": False,
            "error": "Rate limit exceeded. Please try again later.",
            "query": query
        }
    
    # Check cache
    cache_key = get_cache_key(query)
    cached_result = cache.get(cache_key)
    if cached_result and (datetime.now() - cached_result['timestamp']) < CACHE_DURATION:
        return cached_result['data']
    
    try:
        # DuckDuckGo API endpoint
        url = "https://api.duckduckgo.com/"
        params = {
            "q": query,
            "format": "json",
            "no_html": 1,
            "no_redirect": 1,
            "skip_disambig": 1
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # Process results
        results = []
        if data.get('RelatedTopics'):
            for topic in data['RelatedTopics']:
                if 'Text' in topic and 'FirstURL' in topic:
                    results.append({
                        "title": topic.get('Text', ''),
                        "url": topic['FirstURL'],
                        "snippet": topic.get('Text', '')
                    })
        
        # Cache the results
        cache[cache_key] = {
            'timestamp': datetime.now(),
            'data': {
                "success": True,
                "query": query,
                "num_results": len(results),
                "results": results[:num_results]
            }
        }
        
        return cache[cache_key]['data']
        
    except requests.RequestException as e:
        return {
            "success": False,
            "error": str(e),
            "query": query
        }

def fetch_webpage(url: str) -> Dict[str, Any]:
    """
    Fetch content from a webpage with caching and rate limiting.
    
    Args:
        url (str): URL to fetch
        
    Returns:
        Dict[str, Any]: Content of the webpage
    """
    if is_rate_limited():
        return {
            "success": False,
            "error": "Rate limit exceeded. Please try again later.",
            "url": url
        }
    
    # Check cache
    cache_key = get_cache_key(url)
    cached_result = cache.get(cache_key)
    if cached_result and (datetime.now() - cached_result['timestamp']) < CACHE_DURATION:
        return cached_result['data']
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        # Get content type
        content_type = response.headers.get('Content-Type', '')
        
        result = None
        
        if 'text/html' in content_type:
            # For HTML, return simplified content
            result = {
                "success": True,
                "url": url,
                "content_type": content_type,
                "status_code": response.status_code,
                "content": response.text[:5000] + ("..." if len(response.text) > 5000 else ""),
                "truncated": len(response.text) > 5000
            }
        elif 'application/json' in content_type:
            # For JSON, parse and return the JSON
            try:
                json_content = response.json()
                result = {
                    "success": True,
                    "url": url,
                    "content_type": content_type,
                    "status_code": response.status_code,
                    "content": json_content
                }
            except json.JSONDecodeError:
                result = {
                    "success": False,
                    "url": url,
                    "error": "Invalid JSON response",
                    "content_type": content_type,
                    "status_code": response.status_code
                }
        else:
            # For other content types, return raw text (limited)
            result = {
                "success": True,
                "url": url,
                "content_type": content_type,
                "status_code": response.status_code,
                "content": response.text[:1000] + ("..." if len(response.text) > 1000 else ""),
                "truncated": len(response.text) > 1000
            }
        
        # Cache the result
        if result:
            cache[cache_key] = {
                'timestamp': datetime.now(),
                'data': result
            }
        
        return result
        
    except requests.RequestException as e:
        return {
            "success": False,
            "url": url,
            "error": str(e)
        } 