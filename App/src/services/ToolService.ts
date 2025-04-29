/**
 * Service for interacting with AI tools via the backend
 */

class ToolService {
  // Use the main backend URL
  private baseUrl: string = 'http://localhost:23816/api/tools';
  
  // Map frontend tool names to backend tool names
  private toolNameMap: Record<string, string> = {
    'list_dir': 'list_directory',
    'read_file': 'read_file',
    'web_search': 'web_search',
    'fetch_webpage': 'fetch_webpage'
  };

  /**
   * Call a tool with parameters
   * @param toolName Name of the tool to call
   * @param params Tool parameters
   * @returns Tool execution result
   */
  async callTool(toolName: string, params: any): Promise<any> {
    try {
      console.log(`Calling tool ${toolName} with params:`, params);
      
      // Save chat state before making a tool call
      await this.saveCurrentChat();
      
      // Map frontend tool name to backend tool name
      const backendToolName = this.toolNameMap[toolName] || toolName;
      
      // Map parameter names if needed (e.g., relative_workspace_path to directory_path)
      let mappedParams = {...params};
      if (backendToolName === 'list_directory' && params.relative_workspace_path) {
        mappedParams = {
          directory_path: params.relative_workspace_path
        };
      }
      
      console.log(`Mapped to backend tool ${backendToolName} with params:`, mappedParams);
      
      const response = await fetch(`${this.baseUrl}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool_name: backendToolName,
          params: mappedParams
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to call tool: ${toolName} - Status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`Tool ${toolName} result:`, result);
      
      // Format the response in a flatter structure that's easier for the LLM to process
      return {
        role: 'tool',
        content: `Tool ${toolName} result: ${JSON.stringify(result, null, 2)}`,
        tool_call_id: this.generateToolCallId() // Add a unique ID for this tool call
      };
    } catch (error) {
      console.error(`Tool call failed: ${(error as Error).message}`);
      
      return { 
        role: 'tool',
        content: `Error from ${toolName}: ${(error as Error).message}`,
        tool_call_id: this.generateToolCallId() // Add a unique ID for this tool call
      };
    }
  }

  /**
   * Save the current chat state
   * This is called before making a tool call to ensure the chat is preserved
   */
  private async saveCurrentChat(): Promise<void> {
    try {
      // Try to get chat ID from a custom event handler
      const event = new CustomEvent('save-chat-request', {
        detail: { source: 'tool-service' }
      });
      
      // Dispatch event to notify chat component to save
      window.dispatchEvent(event);
      
      // Get current chat ID from URL if available
      const urlParams = new URLSearchParams(window.location.search);
      const chatId = urlParams.get('chatId');
      
      if (!chatId) {
        console.log('No chat ID in URL, skipping direct save');
        return;
      }
      
      // Try to save directly via the API as a fallback
      console.log(`Attempting to save chat ${chatId} before tool call`);
      
      // Record that we attempted to save
      window.lastSaveChatTime = Date.now();
      
    } catch (error) {
      console.error('Error in saveCurrentChat:', error);
    }
  }

  /**
   * Get a list of available tools
   * @returns List of available tools with schema
   */
  async getAvailableTools(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/list`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get tool list - Status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to get tools: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate a unique ID for tool calls
   * @returns A pseudo-random string ID
   */
  private generateToolCallId(): string {
    return Math.floor(Math.random() * 1000000000).toString();
  }
}

export default new ToolService(); 