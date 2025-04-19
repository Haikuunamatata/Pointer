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
   * @returns Tool execution result wrapped in a system message
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
      
      // Check for empty content or invalid response
      if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
        throw new Error('AI response completed but no content was returned');
      }
      
      // Check for specific error conditions from LM Studio
      if (result.error || result.message?.includes('no end strings defined') || result.message?.includes('eval time = 0')) {
        throw new Error('Model configuration error - please check LM Studio settings');
      }
      
      // Add special tokens to force regeneration
      const forceGenerateString = `<force_generate>\n${Date.now()}\n</force_generate>`;
      
      // Add context-carrying instructions
      const contextInstructions = `
<context>
The information below is from a tool call result. Use it to answer the user's original question.
You MUST generate a new, complete response that directly answers the user's question.
Do not just acknowledge the tool result - use it to provide a comprehensive answer.
</context>`;
      
      // Wrap the result in a system message with continuation prompt
      return {
        role: 'system',
        content: contextInstructions + JSON.stringify({
          ...result,
          _uniqueTimestamp: Date.now(), // Add a unique timestamp to force model to see this as new
          _forceGenerate: true, // Add a flag to indicate forced generation
          _toolName: toolName, // Include the tool name for context
          _toolParams: params // Include the parameters for context
        }) + `\n${forceGenerateString}`,
        continuation: 'Based on this tool result, continue your response. You must generate additional content to complete your answer.'
      };
    } catch (error) {
      console.error(`Tool call failed: ${(error as Error).message}`);
      
      // Determine the specific error message based on the error type
      let errorMessage = "Sorry, I was unable to generate a response. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes('AI response completed but no content was returned')) {
          errorMessage = "The AI model completed its response but returned no content. This may be due to a configuration issue or an empty response. Please try again.";
        } else if (error.message.includes('Model configuration error')) {
          errorMessage = "The AI model is not properly configured. Please check the LM Studio settings and try again.";
        } else if (error.message.includes('Failed to call tool')) {
          errorMessage = "The tool call failed. Please check if the tool is properly configured and try again.";
        } else if (error.message.includes('no end strings defined')) {
          errorMessage = "The AI model needs configuration updates. Please check the tool calling settings.";
        }
      }
      
      // Add special tokens to force regeneration even on error
      const forceGenerateString = `<force_generate>\n${Date.now()}\n</force_generate>`;
      
      // Add context instructions for errors
      const contextInstructions = `
<context>
There was an error with the tool call, but you should still try to help the user.
You MUST generate a new, complete response that acknowledges the error but still tries to address the user's question.
</context>`;
      
      // Return a user-friendly error message with specific details
      return { 
        role: 'system',
        content: contextInstructions + JSON.stringify({
          success: false,
          error: errorMessage,
          message: (error as Error).message,
          details: "This error may be due to LM Studio configuration issues or an empty response. Please check the model settings and try again.",
          _uniqueTimestamp: Date.now(), // Add a unique timestamp to force model to see this as new
          _forceGenerate: true, // Add a flag to indicate forced generation
          _toolName: toolName, // Include the tool name for context
          _toolParams: params // Include the parameters for context
        }) + `\n${forceGenerateString}`,
        continuation: 'Despite this error, you must continue generating a helpful response. Acknowledge the error and try to help the user with what information you already have.'
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