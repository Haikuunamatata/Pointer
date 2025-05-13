"""
Tool handlers for AI tool calling functionality.
"""

import os
import json
import aiohttp
import asyncio
from typing import Dict, Any, List, Optional
from pathlib import Path


async def read_file(target_file: str) -> Dict[str, Any]:
    """
    Read the contents of a file and return as a dictionary.
    
    Args:
        target_file: Path to the file to read
        
    Returns:
        Dictionary with file content and metadata
    """
    try:
        # Security check: prevent path traversal
        abs_path = os.path.abspath(target_file)
        
        # Check if file exists
        if not os.path.exists(abs_path):
            return {
                "success": False,
                "error": f"File not found: {target_file}"
            }
        
        # Get file extension and size
        file_extension = os.path.splitext(abs_path)[1].lower()
        file_size = os.path.getsize(abs_path)
        
        # Read file based on extension
        if file_extension == '.json':
            with open(abs_path, 'r', encoding='utf-8') as f:
                content = json.load(f)
                file_type = "json"
        else:
            # Default to text for all other file types
            with open(abs_path, 'r', encoding='utf-8') as f:
                content = f.read()
                file_type = "text"
        
        return {
            "success": True,
            "content": content,
            "metadata": {
                "path": target_file,
                "size": file_size,
                "type": file_type,
                "extension": file_extension
            }
        }
    except json.JSONDecodeError:
        # Handle invalid JSON
        with open(abs_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "success": False,
            "error": "Invalid JSON format",
            "content": content,
            "metadata": {
                "path": target_file,
                "size": file_size,
                "type": "text",
                "extension": file_extension
            }
        }
    except UnicodeDecodeError:
        # Handle binary files
        return {
            "success": False,
            "error": "Cannot read binary file as text",
            "metadata": {
                "path": target_file,
                "size": file_size,
                "type": "binary",
                "extension": file_extension
            }
        }
    except Exception as e:
        # Handle all other exceptions
        return {
            "success": False,
            "error": str(e),
            "metadata": {
                "path": target_file
            }
        }


async def list_directory(directory_path: str) -> Dict[str, Any]:
    """
    List the contents of a directory.
    
    Args:
        directory_path: Path to the directory to list
        
    Returns:
        Dictionary with directory contents
    """
    try:
        # Security check: prevent path traversal
        abs_path = os.path.abspath(directory_path)
        
        # Check if directory exists
        if not os.path.exists(abs_path) or not os.path.isdir(abs_path):
            return {
                "success": False,
                "error": f"Directory not found: {directory_path}"
            }
        
        # List directory contents
        contents = []
        for item in os.listdir(abs_path):
            item_path = os.path.join(abs_path, item)
            item_type = "directory" if os.path.isdir(item_path) else "file"
            
            contents.append({
                "name": item,
                "path": os.path.join(directory_path, item),
                "type": item_type,
                "size": os.path.getsize(item_path) if item_type == "file" else None
            })
        
        return {
            "success": True,
            "directory": directory_path,
            "contents": contents
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "directory": directory_path
        }


async def web_search(query: str, num_results: int = 3) -> Dict[str, Any]:
    """
    Simulated web search for information.
    
    Args:
        query: Search query
        num_results: Number of results to return
        
    Returns:
        Dictionary with search results
    """
    # This is a mock implementation - in a production environment,
    # you would connect to a real search API
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
    await asyncio.sleep(0.5)
    
    # Limit results based on num_results
    limited_results = mock_results[:min(num_results, len(mock_results))]
    
    return {
        "success": True,
        "query": query,
        "num_results": len(limited_results),
        "results": limited_results
    }


async def fetch_webpage(url: str) -> Dict[str, Any]:
    """
    Fetch content from a webpage.
    
    Args:
        url: URL to fetch
        
    Returns:
        Dictionary with webpage content
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=10) as response:
                content_type = response.headers.get('Content-Type', '')
                
                if 'text/html' in content_type:
                    # For HTML, return simplified content
                    text = await response.text()
                    return {
                        "success": True,
                        "url": url,
                        "content_type": content_type,
                        "status_code": response.status,
                        "content": text[:5000] + ("..." if len(text) > 5000 else ""),
                        "truncated": len(text) > 5000
                    }
                elif 'application/json' in content_type:
                    # For JSON, parse and return
                    try:
                        data = await response.json()
                        return {
                            "success": True,
                            "url": url,
                            "content_type": content_type,
                            "status_code": response.status,
                            "content": data
                        }
                    except json.JSONDecodeError:
                        text = await response.text()
                        return {
                            "success": False,
                            "url": url,
                            "error": "Invalid JSON response",
                            "content_type": content_type,
                            "status_code": response.status,
                            "content": text[:1000] + ("..." if len(text) > 1000 else "")
                        }
                else:
                    # For other content types, return raw text (limited)
                    text = await response.text()
                    return {
                        "success": True,
                        "url": url,
                        "content_type": content_type,
                        "status_code": response.status,
                        "content": text[:1000] + ("..." if len(text) > 1000 else ""),
                        "truncated": len(text) > 1000
                    }
    except Exception as e:
        return {
            "success": False,
            "url": url,
            "error": str(e)
        }


# Dictionary mapping tool names to handler functions
TOOL_HANDLERS = {
    "read_file": read_file,
    "list_directory": list_directory,
    "web_search": web_search,
    "fetch_webpage": fetch_webpage,
}

# Tool definitions for API documentation
TOOL_DEFINITIONS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file",
        "parameters": {
            "type": "object",
            "properties": {
                "target_file": {
                    "type": "string",
                    "description": "The path to the file to read"
                }
            },
            "required": ["target_file"]
        }
    },
    {
        "name": "list_directory",
        "description": "List the contents of a directory",
        "parameters": {
            "type": "object",
            "properties": {
                "directory_path": {
                    "type": "string",
                    "description": "The path to the directory to list"
                }
            },
            "required": ["directory_path"]
        }
    },
    {
        "name": "web_search",
        "description": "Search the web for information",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "num_results": {
                    "type": "integer",
                    "description": "Number of results to return (default: 3)"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "fetch_webpage",
        "description": "Fetch and extract content from a webpage",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL of the webpage to fetch"
                }
            },
            "required": ["url"]
        }
    }
]


async def handle_tool_call(tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle a tool call by dispatching to the appropriate handler.
    
    Args:
        tool_name: Name of the tool to call
        params: Parameters for the tool
        
    Returns:
        Result of the tool execution
    """
    if tool_name not in TOOL_HANDLERS:
        return {
            "success": False,
            "error": f"Unknown tool: {tool_name}"
        }
    
    # Get the handler function
    handler = TOOL_HANDLERS[tool_name]
    
    try:
        # Call the handler with parameters
        result = await handler(**params)
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"Error executing tool {tool_name}: {str(e)}"
        } 