import requests
from typing import Dict, Any, List, Optional, Union
import re
import json
from urllib.parse import urlparse

def fetch_webpage(url: str, timeout: int = 10) -> Dict[str, Any]:
    """
    Fetch a webpage and return its content
    """
    try:
        # Validate URL
        parsed_url = urlparse(url)
        if not all([parsed_url.scheme, parsed_url.netloc]):
            return {"error": f"Invalid URL: {url}"}
        
        # Add http:// if scheme is missing
        if not parsed_url.scheme:
            url = f"http://{url}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
        
        content_type = response.headers.get('Content-Type', '')
        is_html = 'text/html' in content_type.lower()
        
        return {
            "url": url,
            "status_code": response.status_code,
            "content_type": content_type,
            "content": response.text,
            "content_length": len(response.text),
            "is_html": is_html
        }
    except requests.RequestException as e:
        return {"error": f"Error fetching webpage: {str(e)}"}

def extract_links(html_content: str) -> Dict[str, Any]:
    """
    Extract all links from HTML content
    """
    try:
        # Basic regex for finding links
        link_pattern = re.compile(r'<a\s+(?:[^>]*?\s+)?href="([^"]*)"', re.IGNORECASE)
        links = link_pattern.findall(html_content)
        
        return {
            "links": links,
            "count": len(links)
        }
    except Exception as e:
        return {"error": f"Error extracting links: {str(e)}"}

def extract_text(html_content: str) -> Dict[str, Any]:
    """
    Extract readable text from HTML content (very basic implementation)
    """
    try:
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', ' ', html_content)
        
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Split into paragraphs (using double newlines)
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        return {
            "text": text,
            "paragraphs": paragraphs,
            "length": len(text),
            "paragraph_count": len(paragraphs)
        }
    except Exception as e:
        return {"error": f"Error extracting text: {str(e)}"}

def extract_metadata(html_content: str) -> Dict[str, Any]:
    """
    Extract metadata from HTML content
    """
    try:
        title_match = re.search(r'<title[^>]*>(.*?)</title>', html_content, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else None
        
        # Extract meta tags
        meta_tags = {}
        meta_pattern = re.compile(r'<meta\s+(?:[^>]*?\s+)?name="([^"]*)"(?:[^>]*?\s+)?content="([^"]*)"', re.IGNORECASE)
        for name, content in meta_pattern.findall(html_content):
            meta_tags[name.lower()] = content
        
        # Extract Open Graph tags
        og_tags = {}
        og_pattern = re.compile(r'<meta\s+(?:[^>]*?\s+)?property="og:([^"]*)"(?:[^>]*?\s+)?content="([^"]*)"', re.IGNORECASE)
        for name, content in og_pattern.findall(html_content):
            og_tags[name.lower()] = content
        
        return {
            "title": title,
            "meta_tags": meta_tags,
            "open_graph": og_tags
        }
    except Exception as e:
        return {"error": f"Error extracting metadata: {str(e)}"}

def search_in_page(html_content: str, search_term: str, case_sensitive: bool = False) -> Dict[str, Any]:
    """
    Search for a term in HTML content and return matches
    """
    try:
        # Extract text first to avoid matching HTML tags
        text_content = re.sub(r'<[^>]+>', ' ', html_content)
        text_content = re.sub(r'\s+', ' ', text_content).strip()
        
        # Perform search
        flags = 0 if case_sensitive else re.IGNORECASE
        pattern = re.compile(re.escape(search_term), flags)
        matches = pattern.findall(text_content)
        
        # Get context for each match (simplified)
        contexts = []
        for match in re.finditer(pattern, text_content):
            start = max(0, match.start() - 50)
            end = min(len(text_content), match.end() + 50)
            context = text_content[start:end].strip()
            contexts.append(f"...{context}...")
        
        return {
            "search_term": search_term,
            "match_count": len(matches),
            "contexts": contexts[:10]  # Limit to first 10 matches for brevity
        }
    except Exception as e:
        return {"error": f"Error searching in page: {str(e)}"} 