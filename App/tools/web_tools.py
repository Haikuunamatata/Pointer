import requests
from typing import Dict, Any, Optional, List
import json
import time

def web_search(query: str, num_results: int = 3) -> Dict[str, Any]:
    """
    Simulated web search tool.
    In a production environment, this would connect to a real search API.
    
    Args:
        query (str): Search query
        num_results (int): Number of results to return
        
    Returns:
        Dict[str, Any]: Search results
    """
    # This is a mock implementation - in production, connect to a real search API
    mock_results = [
        {
            "title": f"Result for {query} - Example 1",
            "url": f"https://example.com/search?q={query.replace(' ', '+')}",
            "snippet": f"This is a sample search result for the query '{query}'. It demonstrates how the web search tool works."
        },
        {
            "title": f"Another result for {query}",
            "url": f"https://example.org/results?query={query.replace(' ', '+')}",
            "snippet": f"Another example result for '{query}'. In a real implementation, this would contain actual search results."
        },
        {
            "title": f"{query} - Documentation",
            "url": f"https://docs.example.com/{query.replace(' ', '-').lower()}",
            "snippet": f"Documentation related to {query}. Contains guides, tutorials and reference materials."
        },
        {
            "title": f"Learn about {query}",
            "url": f"https://learn.example.edu/topics/{query.replace(' ', '_').lower()}",
            "snippet": f"Educational resources about {query} with examples and exercises."
        }
    ]
    
    # Simulate network latency
    time.sleep(0.5)
    
    # Return limited results based on num_results
    limited_results = mock_results[:min(num_results, len(mock_results))]
    
    return {
        "success": True,
        "query": query,
        "num_results": len(limited_results),
        "results": limited_results
    }

def fetch_webpage(url: str) -> Dict[str, Any]:
    """
    Fetch content from a webpage.
    
    Args:
        url (str): URL to fetch
        
    Returns:
        Dict[str, Any]: Content of the webpage
    """
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        # Get content type
        content_type = response.headers.get('Content-Type', '')
        
        if 'text/html' in content_type:
            # For HTML, return simplified content
            return {
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
                return {
                    "success": True,
                    "url": url,
                    "content_type": content_type,
                    "status_code": response.status_code,
                    "content": json_content
                }
            except json.JSONDecodeError:
                return {
                    "success": False,
                    "url": url,
                    "error": "Invalid JSON response",
                    "content_type": content_type,
                    "status_code": response.status_code
                }
        else:
            # For other content types, return raw text (limited)
            return {
                "success": True,
                "url": url,
                "content_type": content_type,
                "status_code": response.status_code,
                "content": response.text[:1000] + ("..." if len(response.text) > 1000 else ""),
                "truncated": len(response.text) > 1000
            }
    except requests.RequestException as e:
        return {
            "success": False,
            "url": url,
            "error": str(e)
        } 