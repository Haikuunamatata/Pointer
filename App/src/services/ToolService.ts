/**
 * Service for interacting with AI tools via the backend
 */

export class ToolService {
  // Use the main backend URL
  private baseUrl: string = 'http://localhost:23816/api/tools';
  
  // Static property to track tool execution state
  private static isExecutingTool = false;
  
  // Tool name mapping between frontend and backend
  private static toolNameMap: Record<string, string> = {
    // Frontend to backend mappings
    'list_dir': 'list_directory',
    'read_file': 'read_file',
    'write_file': 'write_file',
    'run_command': 'run_command',
    
    // Backend to frontend mappings
    'list_directory': 'list_dir',
  };
  
  /**
   * Map tool names between frontend and backend
   * @param name The tool name to map
   * @param direction Whether to map frontend->backend or backend->frontend
   */
  public static mapToolName(name: string, direction: 'to_backend' | 'to_frontend'): string {
    if (!name) return name;
    
    if (direction === 'to_backend') {
      return this.toolNameMap[name] || name;
    } else {
      // Find the key with the matching value
      for (const [frontendName, backendName] of Object.entries(this.toolNameMap)) {
        if (backendName === name) return frontendName;
      }
      return name; // If no mapping found, return original
    }
  }
  
  /**
   * Check if a tool execution is currently in progress
   */
  public static isToolExecutionInProgress(): boolean {
    return this.isExecutingTool;
  }
  
  /**
   * Set the tool execution state
   */
  public static setToolExecutionState(isExecuting: boolean): void {
    this.isExecutingTool = isExecuting;
    console.log(`Tool execution state set to: ${isExecuting}`);
  }

  /**
   * Get the consistent tool name for the given context
   * @param toolName Raw tool name from any source
   * @param context 'frontend', 'backend', or 'storage'
   * @returns Consistently mapped tool name
   */
  public getConsistentToolName(toolName: string, context: 'frontend' | 'backend' | 'storage'): string {
    // Use the static mapToolName method for consistent mapping
    if (context === 'backend') {
      return ToolService.mapToolName(toolName, 'to_backend');
    } else {
      return ToolService.mapToolName(toolName, 'to_frontend');
    }
  }

  /**
   * Call a tool with parameters
   * @param toolName Name of the tool to call
   * @param params Tool parameters
   * @returns Tool execution result
   */
  async callTool(toolName: string, params: any): Promise<any> {
    try {
      // Use the setToolExecutionState static method for tracking
      ToolService.setToolExecutionState(true);
      
      console.log(`Calling tool ${toolName} with params:`, params);
      
      // Determine if the tool name is already in backend format
      let backendToolName = toolName;
      
      // Only map the tool name if it's in frontend format
      if (toolName === 'list_dir') {
        backendToolName = 'list_directory';
        console.log(`Mapped frontend tool name ${toolName} to backend tool name ${backendToolName}`);
      } else {
        console.log(`Using tool name as-is: ${backendToolName}`);
      }
      
      // Map parameter names if needed (e.g., relative_workspace_path to directory_path)
      let mappedParams = {...params};
      if (backendToolName === 'list_directory' && params.relative_workspace_path) {
        mappedParams = {
          directory_path: params.relative_workspace_path
        };
        console.log(`Mapped relative_workspace_path to directory_path for list_directory`);
      }
      
      console.log(`Making API call to backend tool ${backendToolName} with params:`, mappedParams);
      
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
      
      // Format the response with consistent tool name for storage
      const storageToolName = toolName; // Keep original name for consistent display
      
      // Format the response in a flatter structure that's easier for the LLM to process
      return {
        role: 'tool',
        content: `Tool ${storageToolName} result: ${JSON.stringify(result, null, 2)}`,
        tool_call_id: this.generateToolCallId() // Add a unique ID for this tool call
      };
    } catch (error) {
      console.error(`Tool call failed: ${(error as Error).message}`);
      
      return { 
        role: 'tool',
        content: `Error from ${toolName}: ${(error as Error).message}`,
        tool_call_id: this.generateToolCallId() // Add a unique ID for this tool call
      };
    } finally {
      // Reset executing flag after tool call completes using the static method
      ToolService.setToolExecutionState(false);
    }
  }

  /**
   * Save the current chat state (DISABLED to prevent file toggling)
   * This is called before making a tool call to ensure the chat is preserved
   */
  private async saveCurrentChat(): Promise<void> {
    // REMOVED automatic chat saving to prevent file toggling
    // Chat saving is now handled only after tool execution is complete
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

// Create a singleton instance
const toolServiceInstance = new ToolService();

// Add static methods to the instance to make them accessible
(toolServiceInstance as any).isExecutingTool = () => {
  return ToolService.isToolExecutionInProgress();
};

// Add getConsistentToolName as a static method on the instance
(toolServiceInstance as any).getConsistentToolName = (toolName: string, context: 'frontend' | 'backend' | 'storage'): string => {
  if (context === 'backend') {
    return ToolService.mapToolName(toolName, 'to_backend');
  } else {
    return ToolService.mapToolName(toolName, 'to_frontend');
  }
};

// Export the instance with added static methods
export default toolServiceInstance; 