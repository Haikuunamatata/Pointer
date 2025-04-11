# Tool Calling Framework

This module provides a production-quality framework for implementing tool calling with LLM APIs that follow the OpenAI function calling format.

## Features

- Support for multiple tools (file reading, web search, etc.)
- Easily extensible to add new tools
- Handles API communication, tool execution, and conversation state
- Works with LM Studio, Ollama, and any other APIs that follow the OpenAI function calling format

## Getting Started

### Installation

```bash
pip install requests
```

### Basic Usage

```python
from tools.tool_caller import ToolCaller

# Initialize the tool caller
tool_caller = ToolCaller(
    api_url="http://localhost:1234/v1/chat/completions", 
    model="mistral-nemo-instruct-2407"
)

# Set up your conversation
messages = [
    {"role": "system", "content": "You are a helpful assistant that uses tools to answer questions."},
    {"role": "user", "content": "Can you read the file data.json and tell me what it contains?"}
]

# Process the conversation with tool calling
conversation = tool_caller.process_conversation(messages)

# Print the final response
final_message = conversation[-1]
if final_message["role"] == "assistant":
    print(final_message["content"])
```

## Available Tools

### 1. File Reader

Reads the contents of any file and returns them in an appropriate format.

```python
result = read_file(file_path="path/to/file.txt")
```

### 2. Web Search

Simulates a web search (in a production environment, you would connect this to a real search API).

```python
result = web_search(query="python tool calling", num_results=3)
```

### 3. Web Page Fetcher

Fetches the content of a web page.

```python
result = fetch_webpage(url="https://example.com")
```

## Adding Custom Tools

To add a new tool:

1. Create your tool function in an appropriate module
2. Register it in the ToolCaller class:

```python
# Add the function to the tool_functions dictionary
self.tool_functions["my_tool"] = my_tool_function

# Add the tool definition to the tools list
self.tools.append({
    "type": "function",
    "function": {
        "name": "my_tool",
        "description": "Description of what the tool does",
        "parameters": {
            "type": "object",
            "properties": {
                "param1": {
                    "type": "string",
                    "description": "Description of parameter 1"
                }
            },
            "required": ["param1"]
        }
    }
})
```

## Example

See `tool_example.py` for a complete usage example.

```bash
python tool_example.py --api-url "http://localhost:1234/v1/chat/completions"
``` 