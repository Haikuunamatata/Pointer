import requests
import json
import os
from typing import Dict, Any, List, Optional, Union
from tools.file_reader import read_text_file, read_csv_file, read_json_file, file_info, list_directory, read_file
from tools.web_scraper import fetch_webpage, extract_links, extract_text, extract_metadata, search_in_page
from tools.data_processor import format_json, transform_data, encode_decode, calculate_hash, format_datetime

API_URL = "http://192.168.178.169:1234/v1/chat/completions"

tools = [
    {
        "type": "function",
        "function": {
            "name": "read_text_file",
            "description": "Read the contents of a text file",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The path to the text file to read"
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "The line number to start reading from (0-indexed)"
                    },
                    "max_lines": {
                        "type": "integer",
                        "description": "The maximum number of lines to read"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_csv_file",
            "description": "Read the contents of a CSV file",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The path to the CSV file to read"
                    },
                    "max_rows": {
                        "type": "integer",
                        "description": "The maximum number of rows to read"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_json_file",
            "description": "Read the contents of a JSON file",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The path to the JSON file to read"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "file_info",
            "description": "Get information about a file",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The path to the file to get information about"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files in a directory",
            "parameters": {
                "type": "object",
                "properties": {
                    "directory_path": {
                        "type": "string",
                        "description": "The path to the directory to list"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "Optional glob pattern to filter files (e.g., '*.txt')"
                    }
                },
                "required": ["directory_path"]
            }
        }
    },
    
    # Web Scraper Tools
    {
        "type": "function",
        "function": {
            "name": "fetch_webpage",
            "description": "Fetch a webpage and return its content",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL of the webpage to fetch"
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "The timeout in seconds for the request"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "extract_links",
            "description": "Extract all links from HTML content",
            "parameters": {
                "type": "object",
                "properties": {
                    "html_content": {
                        "type": "string",
                        "description": "The HTML content to extract links from"
                    }
                },
                "required": ["html_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "extract_text",
            "description": "Extract readable text from HTML content",
            "parameters": {
                "type": "object",
                "properties": {
                    "html_content": {
                        "type": "string",
                        "description": "The HTML content to extract text from"
                    }
                },
                "required": ["html_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "extract_metadata",
            "description": "Extract metadata (title, meta tags, etc.) from HTML content",
            "parameters": {
                "type": "object",
                "properties": {
                    "html_content": {
                        "type": "string",
                        "description": "The HTML content to extract metadata from"
                    }
                },
                "required": ["html_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_in_page",
            "description": "Search for a term in HTML content and return matches with context",
            "parameters": {
                "type": "object",
                "properties": {
                    "html_content": {
                        "type": "string",
                        "description": "The HTML content to search in"
                    },
                    "search_term": {
                        "type": "string",
                        "description": "The term to search for"
                    },
                    "case_sensitive": {
                        "type": "boolean",
                        "description": "Whether the search should be case sensitive"
                    }
                },
                "required": ["html_content", "search_term"]
            }
        }
    },
    
    # Data Processor Tools
    {
        "type": "function",
        "function": {
            "name": "format_json",
            "description": "Format and validate a JSON string",
            "parameters": {
                "type": "object",
                "properties": {
                    "json_string": {
                        "type": "string",
                        "description": "The JSON string to format"
                    },
                    "indent": {
                        "type": "integer",
                        "description": "The number of spaces for indentation"
                    }
                },
                "required": ["json_string"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "transform_data",
            "description": "Transform data between different formats (json, csv)",
            "parameters": {
                "type": "object",
                "properties": {
                    "data": {
                        "type": "string",
                        "description": "The data to transform"
                    },
                    "from_format": {
                        "type": "string",
                        "description": "The source format (json, csv)"
                    },
                    "to_format": {
                        "type": "string",
                        "description": "The target format (json, csv)"
                    }
                },
                "required": ["data", "from_format", "to_format"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "encode_decode",
            "description": "Encode or decode text using various algorithms (base64, url, hex)",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The text to encode or decode"
                    },
                    "operation": {
                        "type": "string",
                        "enum": ["encode", "decode"],
                        "description": "Whether to encode or decode"
                    },
                    "encoding": {
                        "type": "string",
                        "enum": ["base64", "url", "hex"],
                        "description": "The encoding algorithm to use"
                    }
                },
                "required": ["text", "operation"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_hash",
            "description": "Calculate hash of text using various algorithms",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The text to hash"
                    },
                    "algorithm": {
                        "type": "string",
                        "enum": ["md5", "sha1", "sha256", "sha512"],
                        "description": "The hash algorithm to use"
                    }
                },
                "required": ["text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "format_datetime",
            "description": "Format current datetime or from timestamp",
            "parameters": {
                "type": "object",
                "properties": {
                    "format_string": {
                        "type": "string",
                        "description": "The format string (e.g., '%Y-%m-%d %H:%M:%S')"
                    },
                    "timestamp": {
                        "type": "number",
                        "description": "Optional timestamp to format (current time if not provided)"
                    }
                },
                "required": []
            }
        }
    },
    # New File Reader Tool
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of any file",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The path to the file to read"
                    }
                },
                "required": ["file_path"]
            }
        }
    }
]

# Function to handle tool calls
def handle_tool_call(tool_call: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute the requested tool based on the tool call
    """
    function_name = tool_call["function"]["name"]
    arguments = json.loads(tool_call["function"]["arguments"])
    
    # File reader tools
    if function_name == "read_text_file":
        return read_text_file(**arguments)
    elif function_name == "read_csv_file":
        return read_csv_file(**arguments)
    elif function_name == "read_json_file":
        return read_json_file(**arguments)
    elif function_name == "file_info":
        return file_info(**arguments)
    elif function_name == "list_directory":
        return list_directory(**arguments)
    
    # Web scraper tools
    elif function_name == "fetch_webpage":
        return fetch_webpage(**arguments)
    elif function_name == "extract_links":
        return extract_links(**arguments)
    elif function_name == "extract_text":
        return extract_text(**arguments)
    elif function_name == "extract_metadata":
        return extract_metadata(**arguments)
    elif function_name == "search_in_page":
        return search_in_page(**arguments)
    
    # Data processor tools
    elif function_name == "format_json":
        return format_json(**arguments)
    elif function_name == "transform_data":
        return transform_data(**arguments)
    elif function_name == "encode_decode":
        return encode_decode(**arguments)
    elif function_name == "calculate_hash":
        return calculate_hash(**arguments)
    elif function_name == "format_datetime":
        return format_datetime(**arguments)
    
    # New File Reader Tool
    elif function_name == "read_file":
        return read_file(**arguments)
    
    else:
        return {"error": f"Unknown function: {function_name}"}

def chat_with_model(messages: List[Dict[str, Any]], model: str = "qwq-32b") -> Dict[str, Any]:
    """
    Send messages to the LM Studio API and get a response
    """
    payload = {
        "messages": messages,
        "model": model,
        "tools": tools,
        "tool_choice": "auto",
        "temperature": 0.7,
        "max_tokens": 1024
    }
    
    try:
        response = requests.post(API_URL, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"API request failed: {e}")
        return {"error": str(e)}

def create_sample_files():
    """Create sample files for testing"""
    # Text file
    text_content = """
    This is a sample text file for testing our file reading tools.
    It contains several lines of text that we can read and analyze.
    
    We can use the read_text_file tool to read this file,
    and we can also use other tools like list_directory to explore the filesystem.
    """
    
    text_file_path = "sample_text.txt"
    with open(text_file_path, "w", encoding="utf-8") as f:
        f.write(text_content.strip())
    
    # JSON file
    json_content = {
        "name": "Sample JSON",
        "description": "A sample JSON file for testing",
        "items": [
            {"id": 1, "value": "item1"},
            {"id": 2, "value": "item2"},
            {"id": 3, "value": "item3"}
        ],
        "metadata": {
            "created": "2023-01-01",
            "version": "1.0"
        }
    }
    
    json_file_path = "sample_data.json"
    with open(json_file_path, "w", encoding="utf-8") as f:
        json.dump(json_content, f, indent=2)
    
    # CSV file
    csv_content = """name,age,city
Alice,28,New York
Bob,35,San Francisco
Charlie,42,London
Diana,31,Paris
"""
    
    csv_file_path = "sample_data.csv"
    with open(csv_file_path, "w", encoding="utf-8") as f:
        f.write(csv_content)
    
    # HTML file (for testing web scraping tools locally)
    html_content = """<!DOCTYPE html>
<html>
<head>
    <title>Sample HTML Page</title>
    <meta name="description" content="A sample HTML page for testing">
    <meta name="keywords" content="sample, test, html">
</head>
<body>
    <h1>Sample HTML Page</h1>
    <p>This is a paragraph for testing text extraction.</p>
    <p>We can also test <b>bold text</b> and <i>italic text</i>.</p>
    <a href="https://example.com">Example Link</a>
    <a href="https://google.com">Google</a>
    <a href="https://github.com">GitHub</a>
</body>
</html>
"""
    
    html_file_path = "sample_page.html"
    with open(html_file_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    
    print(f"Created sample files:")
    print(f"  - {text_file_path}")
    print(f"  - {json_file_path}")
    print(f"  - {csv_file_path}")
    print(f"  - {html_file_path}")
    
    return {
        "text_file": text_file_path,
        "json_file": json_file_path,
        "csv_file": csv_file_path,
        "html_file": html_file_path
    }

def main():
    """
    Main function to demonstrate tool calling
    """
    # Check if LM Studio is running
    try:
        requests.get(API_URL.replace("/chat/completions", ""))
        print("LM Studio API is accessible")
    except requests.RequestException:
        print("WARNING: LM Studio API is not accessible at", API_URL)
        print("Make sure LM Studio is running with the API server enabled")
        print("Please ensure QWQ-32B is loaded in LM Studio")
    
    # Create sample files for testing
    sample_files = create_sample_files()
    
    # Initial conversation
    messages = [
        {"role": "system", "content": "You are a helpful assistant that can use tools to answer user questions."},
        {"role": "user", "content": f"""I have several sample files available:
1. Text file: {sample_files['text_file']}
2. JSON file: {sample_files['json_file']}
3. CSV file: {sample_files['csv_file']}
4. HTML file: {sample_files['html_file']}

Can you help me read the content of the JSON file, extract links from the HTML file, and encode the first line of the text file in base64?"""}
    ]
    
    # Get initial response from the model
    print("\nSending request to the model...")
    response = chat_with_model(messages)
    
    if "error" in response:
        print(f"Error: {response['error']}")
        return
    
    # Extract the assistant's message from the response
    assistant_message = response["choices"][0]["message"]
    messages.append(assistant_message)
    
    print("\nAssistant response:")
    print(assistant_message.get("content", ""))
    
    # Handle tool calls if present
    if "tool_calls" in assistant_message:
        print("\nTool calls detected!")
        
        for tool_call in assistant_message["tool_calls"]:
            tool_call_id = tool_call["id"]
            function_name = tool_call["function"]["name"]
            
            print(f"\nExecuting tool: {function_name}")
            tool_result = handle_tool_call(tool_call)
            
            # For brevity, limit content display for large responses
            if function_name == "read_text_file" and "content" in tool_result:
                content_preview = tool_result["content"][:100] + "..." if len(tool_result["content"]) > 100 else tool_result["content"]
                print(f"Tool result: {json.dumps({**tool_result, 'content': content_preview}, indent=2)}")
            elif function_name == "fetch_webpage" and "content" in tool_result:
                content_preview = tool_result["content"][:100] + "..." if len(tool_result["content"]) > 100 else tool_result["content"]
                print(f"Tool result: {json.dumps({**tool_result, 'content': content_preview}, indent=2)}")
            else:
                print(f"Tool result: {json.dumps(tool_result, indent=2)}")
            
            # Add the tool result to the messages
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "name": function_name,
                "content": json.dumps(tool_result)
            })
        
        # Get final response from the model with tool results
        print("\nSending tool results back to the model...")
        response = chat_with_model(messages)
        
        if "error" in response:
            print(f"Error: {response['error']}")
            return
        
        # Extract the final assistant message
        final_message = response["choices"][0]["message"]
        print("\nFinal response:")
        print(final_message.get("content", ""))

if __name__ == "__main__":
    main() 