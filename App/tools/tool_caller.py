import requests
import json
import os
from typing import Dict, Any, List, Optional, Union, Callable
from tools.file_reader import read_file
from tools.web_tools import web_search, fetch_webpage

class ToolCaller:
    """
    A class for handling tool calling functionality with LLM APIs.
    """
    
    def __init__(self, api_url: str, model: str = "mistral-nemo-instruct-2407", api_key: Optional[str] = None):
        """
        Initialize the ToolCaller with API settings.
        
        Args:
            api_url (str): The URL of the API endpoint
            model (str): The model to use for tool calling
            api_key (Optional[str]): API key for authentication, if required
        """
        self.api_url = api_url
        self.model = model
        self.api_key = api_key
        self.tools = self._register_default_tools()
        self.tool_functions = {
            "read_file": read_file,
            "web_search": web_search,
            "fetch_webpage": fetch_webpage
        }
    
    def _register_default_tools(self) -> List[Dict[str, Any]]:
        """
        Register the default available tools.
        
        Returns:
            List[Dict[str, Any]]: List of tool definitions
        """
        return [
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
            },
            {
                "type": "function",
                "function": {
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
                }
            },
            {
                "type": "function",
                "function": {
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
            }
        ]
    
    def register_tool(self, name: str, description: str, parameters: Dict[str, Any], 
                      func: Callable) -> None:
        """
        Register a new tool for use with the model.
        
        Args:
            name (str): Name of the tool function
            description (str): Description of what the tool does
            parameters (Dict[str, Any]): JSON Schema of the function parameters
            func (Callable): The actual function to call when tool is invoked
        """
        self.tools.append({
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters
            }
        })
        self.tool_functions[name] = func
    
    def handle_tool_call(self, tool_call: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the requested tool based on the tool call
        
        Args:
            tool_call (Dict[str, Any]): Tool call information from the model
            
        Returns:
            Dict[str, Any]: Result of the tool execution
        """
        function_name = tool_call["function"]["name"]
        arguments = json.loads(tool_call["function"]["arguments"])
        
        if function_name in self.tool_functions:
            return self.tool_functions[function_name](**arguments)
        else:
            return {"success": False, "error": f"Unknown function: {function_name}"}
    
    def chat_with_model(self, messages: List[Dict[str, Any]], 
                       temperature: float = 0.7, 
                       max_tokens: int = 1024) -> Dict[str, Any]:
        """
        Send messages to the LLM API and get a response
        
        Args:
            messages (List[Dict[str, Any]]): Conversation messages
            temperature (float): Model temperature
            max_tokens (int): Maximum tokens to generate
            
        Returns:
            Dict[str, Any]: Model response
        """
        payload = {
            "messages": messages,
            "model": self.model,
            "tools": self.tools,
            "tool_choice": "auto",
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        try:
            response = requests.post(self.api_url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            return {"error": str(e)}
    
    def process_conversation(self, messages: List[Dict[str, Any]], 
                            max_turns: int = 5) -> List[Dict[str, Any]]:
        """
        Process a full conversation with tool calling.
        
        This method will continue the conversation until no more tool calls are made
        or max_turns is reached.
        
        Args:
            messages (List[Dict[str, Any]]): Initial conversation messages
            max_turns (int): Maximum number of tool calling turns
            
        Returns:
            List[Dict[str, Any]]: Complete conversation history
        """
        turns = 0
        conversation = messages.copy()
        
        while turns < max_turns:
            # Get model response
            response = self.chat_with_model(conversation)
            
            if "error" in response:
                conversation.append({
                    "role": "assistant",
                    "content": f"Error: {response['error']}"
                })
                break
            
            # Extract the assistant's message
            assistant_message = response["choices"][0]["message"]
            conversation.append(assistant_message)
            
            # If there are no tool calls, we're done
            if "tool_calls" not in assistant_message:
                break
            
            # Process each tool call
            for tool_call in assistant_message["tool_calls"]:
                tool_call_id = tool_call["id"]
                function_name = tool_call["function"]["name"]
                
                # Execute the tool
                tool_result = self.handle_tool_call(tool_call)
                
                # Add the tool result to the conversation
                conversation.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "name": function_name,
                    "content": json.dumps(tool_result)
                })
            
            turns += 1
        
        return conversation 