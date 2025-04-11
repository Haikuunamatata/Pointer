/**
 * Service for interacting with AI tools via the backend
 */

class ToolService {
  // Use the main backend URL
  private baseUrl: string = 'http://localhost:23816/api/tools';

  /**
   * Call a tool with parameters
   * @param toolName Name of the tool to call
   * @param params Tool parameters
   * @returns Tool execution result
   */
  async callTool(toolName: string, params: any): Promise<any> {
    try {
      console.log(`Calling tool ${toolName} with params:`, params);
      
      const response = await fetch(`${this.baseUrl}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool_name: toolName,
          params: params
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to call tool: ${toolName}`);
      }

      const result = await response.json();
      console.log(`Tool ${toolName} result:`, result);
      return result;
    } catch (error) {
      console.error(`Tool call failed: ${(error as Error).message}`);
      // Return a structured error object that the agent can use
      return { 
        success: false,
        error: `Failed to call tool: ${toolName}`, 
        message: (error as Error).message 
      };
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get tool list');
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to get tools: ${(error as Error).message}`);
      throw error;
    }
  }
}

export default new ToolService(); 