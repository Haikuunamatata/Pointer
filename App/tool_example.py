#!/usr/bin/env python3
"""
Tool Calling Example Script

This script demonstrates using the ToolCaller class to interact with LLMs
that support tool calling, such as LM Studio running locally.
"""

import os
import json
import argparse
from typing import Dict, Any, List
from tools.tool_caller import ToolCaller

def create_sample_files() -> Dict[str, str]:
    """
    Create sample files for testing the file reading tool.
    
    Returns:
        Dict[str, str]: Dictionary of file paths created
    """
    # Text file
    text_content = "This is a sample text file for testing our file reading tools."
    
    text_file_path = "sample_text.txt"
    with open(text_file_path, "w", encoding="utf-8") as f:
        f.write(text_content)
    
    # JSON file
    json_content = {
        "name": "Sample JSON",
        "description": "A sample JSON file for testing",
        "items": [
            {"id": 1, "value": "item1"},
            {"id": 2, "value": "item2"},
            {"id": 3, "value": "item3"}
        ]
    }
    
    json_file_path = "sample_data.json"
    with open(json_file_path, "w", encoding="utf-8") as f:
        json.dump(json_content, f, indent=2)
    
    # Python code file
    python_content = """
def hello_world():
    \"\"\"Print hello world message\"\"\"
    print("Hello, World!")
    
if __name__ == "__main__":
    hello_world()
"""
    
    python_file_path = "sample_code.py"
    with open(python_file_path, "w", encoding="utf-8") as f:
        f.write(python_content)
    
    print(f"Created sample files:")
    print(f"  - {text_file_path}")
    print(f"  - {json_file_path}")
    print(f"  - {python_file_path}")
    
    return {
        "text_file": text_file_path,
        "json_file": json_file_path,
        "python_file": python_file_path
    }

def check_api_availability(api_url: str) -> bool:
    """
    Check if the API is available.
    
    Args:
        api_url (str): URL to check
        
    Returns:
        bool: True if API is available, False otherwise
    """
    import requests
    try:
        # Try to ping the API base endpoint
        base_url = "/".join(api_url.split("/")[:-2])
        if not base_url:
            base_url = api_url.split("/chat/completions")[0]
        
        requests.get(base_url, timeout=5)
        return True
    except requests.RequestException:
        return False

def main() -> None:
    """
    Main function to demonstrate tool calling
    """
    parser = argparse.ArgumentParser(description="Tool Calling Example")
    parser.add_argument(
        "--api-url", 
        default="http://192.168.178.169:1234/v1/chat/completions",
        help="API URL for LLM (default: http://192.168.178.169:1234/v1/chat/completions)"
    )
    parser.add_argument(
        "--model", 
        default="mistral-nemo-instruct-2407",
        help="Model name to use (default: mistral-nemo-instruct-2407)"
    )
    parser.add_argument(
        "--api-key", 
        default=None,
        help="API key for authentication (if required)"
    )
    args = parser.parse_args()
    
    # Check if API is available
    if check_api_availability(args.api_url):
        print(f"API is accessible at {args.api_url}")
    else:
        print(f"WARNING: API is not accessible at {args.api_url}")
        print("Make sure the LLM API server is running with tool calling enabled")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            return
    
    # Create sample files
    sample_files = create_sample_files()
    
    # Initialize ToolCaller
    tool_caller = ToolCaller(api_url=args.api_url, model=args.model, api_key=args.api_key)
    
    # Initial conversation
    messages = [
        {"role": "system", "content": "You are a helpful assistant that can use tools to answer user questions."},
        {"role": "user", "content": f"""I have several sample files available:
1. Text file: {sample_files['text_file']}
2. JSON file: {sample_files['json_file']}
3. Python file: {sample_files['python_file']}

Can you read the contents of these files and tell me what each one contains?"""}
    ]
    
    # Process the conversation with tool calling
    print("\nStarting conversation with the model...")
    conversation = tool_caller.process_conversation(messages)
    
    # Print the final conversation
    print("\nFinal conversation:")
    for i, message in enumerate(conversation):
        role = message["role"]
        
        if role == "system":
            print(f"\nSystem: {message['content']}")
        elif role == "user":
            print(f"\nUser: {message['content']}")
        elif role == "assistant":
            print(f"\nAssistant: {message.get('content', '')}")
            
            if "tool_calls" in message:
                print("  Tool calls:")
                for tool_call in message["tool_calls"]:
                    function_name = tool_call["function"]["name"]
                    arguments = tool_call["function"]["arguments"]
                    print(f"  - {function_name}({arguments})")
        elif role == "tool":
            # For tool responses, show a summary
            content = json.loads(message["content"])
            tool_name = message["name"]
            
            success = content.get("success", None)
            if success is False:
                error = content.get("error", "Unknown error")
                print(f"\nTool ({tool_name}) error: {error}")
            else:
                print(f"\nTool ({tool_name}) succeeded")
                
                # For read_file, show a preview of the content
                if tool_name == "read_file" and "content" in content:
                    file_content = content["content"]
                    if isinstance(file_content, str):
                        preview = file_content[:100] + "..." if len(file_content) > 100 else file_content
                        print(f"  Content preview: {preview}")
                    else:
                        preview = str(file_content)[:100] + "..." if len(str(file_content)) > 100 else str(file_content)
                        print(f"  Content preview (JSON): {preview}")

if __name__ == "__main__":
    main() 