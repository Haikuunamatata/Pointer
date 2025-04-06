import requests
import json
import os
from typing import Dict, Any, List, Optional, Union
from tools.file_reader import read_file

# LM Studio API configuration
API_URL = "http://192.168.178.169:1234/v1/chat/completions"  # Network IP instead of localhost

# Tool definitions - these are tools our agent can use
tools = [
    # File Reader Tool
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
    
    if function_name == "read_file":
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
    
    print(f"Created sample files:")
    print(f"  - {text_file_path}")
    print(f"  - {json_file_path}")
    
    return {
        "text_file": text_file_path,
        "json_file": json_file_path
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
    
    # Create sample files for testing
    sample_files = create_sample_files()
    
    # Initial conversation
    messages = [
        {"role": "system", "content": "You are a helpful assistant that can use tools to answer user questions."},
        {"role": "user", "content": f"""I have several sample files available:
1. Text file: {sample_files['text_file']}
2. JSON file: {sample_files['json_file']}

Can you read the contents of these files for me?"""}
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
            if "content" in tool_result and len(tool_result["content"]) > 100:
                content_preview = tool_result["content"][:100] + "..."
                display_result = {**tool_result, "content": content_preview}
                print(f"Tool result: {json.dumps(display_result, indent=2)}")
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