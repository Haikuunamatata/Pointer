import json
from typing import Dict, Any, List, Optional

class ToolCaller:
    """
    This class has been disabled. Tool calling functionality has been removed.
    """
    
    def __init__(self, api_url: str, model: str = "mistral-nemo-instruct-2407", api_key: Optional[str] = None):
        """
        Initialize the ToolCaller (disabled).
        """
        print("ToolCaller has been disabled - tool calling functionality has been removed.")
        self.api_url = api_url
        self.model = model
        self.api_key = api_key
        self.tools = []
        self.tool_functions = {}
    
    def _register_default_tools(self) -> List[Dict[str, Any]]:
        """
        Register the default available tools (disabled).
        """
        print("Tool registration is disabled - tool calling functionality has been removed.")
        return []
    
    def register_tool(self, name: str, description: str, parameters: Dict[str, Any], 
                      func: Any) -> None:
        """
        Register a new tool (disabled).
        """
        print(f"Cannot register tool '{name}' - tool calling functionality has been removed.")
    
    def handle_tool_call(self, tool_call: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the requested tool (disabled).
        """
        print("Tool call handling is disabled.")
        return {"success": False, "error": "Tool calling functionality has been removed"}
    
    def chat_with_model(self, messages: List[Dict[str, Any]], 
                       temperature: float = 0.7, 
                       max_tokens: int = 1024) -> Dict[str, Any]:
        """
        Send messages to the LLM API without tools.
        """
        payload = {
            "messages": messages,
            "model": self.model,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        return {"error": "Tool calling functionality has been removed"}
    
    def process_conversation(self, messages: List[Dict[str, Any]], 
                            max_turns: int = 5) -> List[Dict[str, Any]]:
        """
        Process a conversation without tool calling.
        """
        print("Tool execution chain is disabled - tool calling functionality has been removed.")
        return messages 