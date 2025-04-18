import { cleanAIResponse } from '../utils/textUtils';
import { Message } from '../types';
import { AIFileService } from './AIFileService';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  onStream?: (content: string) => void;
}

interface ChatCompletionResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

interface StreamingChatCompletionOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  tools?: any[]; // Tool definitions array
  tool_choice?: string | object; // Tool choice parameter
  purpose?: 'chat' | 'insert' | 'autocompletion' | 'summary' | 'agent'; // Add purpose parameter
  onUpdate: (content: string) => void;
}

interface CompletionOptions {
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  suffix?: string;
  purpose?: 'chat' | 'insert' | 'autocompletion' | 'summary';
}

interface CompletionResponse {
  choices: {
    text: string;
    index: number;
    finish_reason: string;
  }[];
}

class LMStudioService {
  // Gets the full API endpoint for a specific purpose
  private async getApiEndpoint(purpose: 'chat' | 'insert' | 'autocompletion' | 'summary' | 'agent'): Promise<string> {
    try {
      const modelConfig = await AIFileService.getModelConfigForPurpose(purpose);
      if (!modelConfig.apiEndpoint) {
        throw new Error(`No API endpoint configured for purpose: ${purpose}`);
      }
      
      let apiEndpoint = modelConfig.apiEndpoint;
      
      // Format the endpoint URL correctly
      if (!apiEndpoint.endsWith('/v1')) {
        apiEndpoint = apiEndpoint.endsWith('/') 
          ? `${apiEndpoint}v1` 
          : `${apiEndpoint}/v1`;
      }
      
      console.log(`Using API endpoint for ${purpose}: ${apiEndpoint}`);
      return apiEndpoint;
    } catch (error) {
      console.error(`Error getting API endpoint for ${purpose}:`, error);
      throw new Error(`Failed to get API endpoint for ${purpose}: ${error}`);
    }
  }

  async createChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const { onStream, ...requestOptions } = options;
    const purpose = 'chat';
    
    try {
      // Get full model configuration including fallbacks
      const modelConfig = await AIFileService.getModelConfigForPurpose(purpose);
      console.log(`Attempting to connect to API at: ${modelConfig.apiEndpoint}`);

      // Use fallback endpoints if available
      const endpointsToTry = modelConfig.fallbackEndpoints || [modelConfig.apiEndpoint];
      let lastError: Error | null = null;
      
      for (const baseEndpoint of endpointsToTry) {
        try {
          // Format the endpoint URL correctly
          let baseUrl = baseEndpoint;
          if (!baseUrl.endsWith('/v1')) {
            baseUrl = baseUrl.endsWith('/') 
              ? `${baseUrl}v1` 
              : `${baseUrl}/v1`;
          }

          console.log(`Trying endpoint: ${baseUrl}`);
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...requestOptions,
              temperature: options.temperature ?? 0.7,
              max_tokens: options.max_tokens ?? -1,
              stream: true
            })
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(`LM Studio API error (${response.status}): ${text}`);
          }

          if (!response.body) {
            throw new Error('No response body');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(line.slice(6));
                    const newContent = data.choices[0]?.delta?.content || '';
                    fullContent += newContent;
                    onStream?.(fullContent);
                  } catch (e) {
                    console.warn('Failed to parse streaming response:', e);
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }

          // Clean up any markdown code blocks in the response before returning
          const cleanedContent = cleanAIResponse(fullContent);

          return {
            choices: [{
              message: {
                content: cleanedContent
              }
            }]
          };
        } catch (error) {
          console.error(`Error with endpoint ${baseEndpoint}:`, error);
          lastError = error as Error;
          // Continue to next endpoint
        }
      }
      
      // If we've tried all endpoints and none worked, throw the last error
      if (lastError) {
        throw lastError;
      } else {
        throw new Error('All endpoints failed but no error was captured');
      }
    } catch (error) {
      console.error('Error in createChatCompletion:', error);
      throw error;
    }
  }

  async createStreamingChatCompletion(options: StreamingChatCompletionOptions): Promise<void> {
    const {
      model,
      messages,
      temperature = 0.7,
      max_tokens = -1,
      top_p = 1,
      frequency_penalty = 0,
      presence_penalty = 0,
      tools,
      tool_choice,
      purpose = 'chat', // Default to 'chat' if not provided
      onUpdate
    } = options;
    
    try {
      // Get the endpoint based on provided purpose
      const modelConfig = await AIFileService.getModelConfigForPurpose(purpose);
      console.log(`Attempting to connect to API at: ${modelConfig.apiEndpoint} for purpose: ${purpose}`);

      if (!messages || messages.length === 0) {
        throw new Error('Messages array is required and cannot be empty');
      }

      // Use fallback endpoints if available
      const endpointsToTry = modelConfig.fallbackEndpoints || [modelConfig.apiEndpoint];
      let lastError: Error | null = null;
      
      for (const baseEndpoint of endpointsToTry) {
        try {
          // Format the endpoint URL correctly
          let baseUrl = baseEndpoint;
          if (!baseUrl.endsWith('/v1')) {
            baseUrl = baseUrl.endsWith('/') 
              ? `${baseUrl}v1` 
              : `${baseUrl}/v1`;
          }

          console.log(`Trying endpoint: ${baseUrl}`);
          const requestBody: any = {
            model,
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            temperature,
            max_tokens,
            top_p,
            frequency_penalty,
            presence_penalty,
            stream: true,
          };

          // Add tools and tool_choice if provided
          if (tools && tools.length > 0) {
            requestBody.tools = tools;
            if (tool_choice) {
              requestBody.tool_choice = tool_choice;
            }
          }

          // Enhanced debug logging
          console.log('Final API request payload:', JSON.stringify({
            ...requestBody,
            messages: requestBody.messages.length > 0 ? '[Messages included]' : '[]',
            tools: requestBody.tools ? `[${requestBody.tools.length} tools included]` : 'undefined',
            tool_choice: requestBody.tool_choice || 'undefined',
            model: requestBody.model,
            endpoint: `${baseUrl}/chat/completions`,
            temperature: requestBody.temperature,
            stream: requestBody.stream
          }, null, 2));

          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Response body is null');
          }

          let buffer = '';
          let accumulatedContent = '';  // Keep track of all content
          let toolCallDetected = false;
          let toolCallData = '';
          let toolCallBuffer = ''; // Buffer for collecting tool call fragments
          let completeFunctionCalls: Record<string, any> = {}; // Track complete function calls
          let lastToolCallUpdateTime = Date.now();
          let partialToolCall: any = null; // To accumulate partial tool calls
          
          // Restore the flushToolCall function to format tool calls for the client
          const flushToolCall = (toolCall: any) => {
            if (!toolCall || !toolCall.id || !toolCall.function) return;
            
            // Format the tool call data for the client
            const formattedToolCall = `function_call: ${JSON.stringify({
              id: toolCall.id,
              name: toolCall.function.name || '',
              arguments: toolCall.function.arguments || '{}'
            })}`;
            
            // Add to accumulated content and notify client
            accumulatedContent += formattedToolCall;
            console.log("Flushing tool call to client:", formattedToolCall);
            onUpdate(accumulatedContent);
            
            // Reset the partial tool call
            partialToolCall = null;
          };
          
          // Set up a periodic check for tool calls that may be stuck
          const toolCallInterval = setInterval(() => {
            const now = Date.now();
            // If we have a partial tool call and it hasn't been updated in 2 seconds, flush it
            if (partialToolCall && (now - lastToolCallUpdateTime > 2000)) {
              console.log("Timeout - flushing incomplete tool call:", partialToolCall);
              flushToolCall(partialToolCall);
              partialToolCall = null;
            }
          }, 500);
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // When done, flush any remaining partial tool call
                if (partialToolCall) {
                  console.log("End of stream - flushing incomplete tool call:", partialToolCall);
                  flushToolCall(partialToolCall);
                }
                break;
              }

              const chunk = new TextDecoder().decode(value);
              buffer += chunk;

              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;

                try {
                  if (!line.startsWith('data: ')) continue;
                  const jsonData = line.replace(/^data: /, '');
                  const data = JSON.parse(jsonData);
                  
                  // Log the data structure to debug the response format
                  console.debug('Parsed data from streaming response:', data);
                  
                  // Check if data and choices exist
                  if (!data || !data.choices || !data.choices.length) {
                    console.debug('Response has no choices:', data);
                    continue;
                  }
                  
                  // Check for tool call in the response
                  const content = data.choices[0]?.delta?.content || '';
                  if (content) {
                    // Regular content (not a tool call via choices.delta.tool_calls)
                    accumulatedContent += content;
                    onUpdate(accumulatedContent);
                  }
                  
                  // Check if there's a tool_call in the choices object directly
                  // Add additional safety checks
                  const deltaObj = data.choices[0]?.delta;
                  if (!deltaObj) {
                    console.debug('No delta object in response');
                    continue;
                  }
                  
                  const toolCalls = deltaObj.tool_calls;
                  if (!toolCalls || !toolCalls.length) {
                    // No tool calls in this delta, continue
                    continue;
                  }
                  
                  const toolCallDelta = toolCalls[0];
                  if (toolCallDelta) {
                    lastToolCallUpdateTime = Date.now();
                    
                    // Initialize partial tool call if needed
                    if (!partialToolCall) {
                      partialToolCall = {
                        id: toolCallDelta.id || `tool-call-${Date.now()}`,
                        type: toolCallDelta.type || 'function',
                        function: {
                          name: '',
                          arguments: ''
                        }
                      };
                    }
                    
                    // Make sure the function property exists
                    if (!toolCallDelta.function) {
                      console.debug('Tool call delta has no function property:', toolCallDelta);
                      continue;
                    }
                    
                    // Update the ID if it's now available
                    if (toolCallDelta.id && !partialToolCall.id) {
                      partialToolCall.id = toolCallDelta.id;
                    }
                    
                    // Update function name if present in this delta
                    if (toolCallDelta.function?.name) {
                      partialToolCall.function.name = 
                        (partialToolCall.function.name || '') + toolCallDelta.function.name;
                    }
                    
                    // Update function arguments if present in this delta
                    if (toolCallDelta.function?.arguments) {
                      partialToolCall.function.arguments = 
                        (partialToolCall.function.arguments || '') + toolCallDelta.function.arguments;
                    }
                    
                    // Check if we have a complete function call
                    const isComplete = partialToolCall.id && 
                                      partialToolCall.function.name && 
                                      partialToolCall.function.arguments;
                    
                    if (isComplete) {
                      // Try to parse the arguments to verify they're valid JSON
                      try {
                        JSON.parse(partialToolCall.function.arguments);
                        flushToolCall(partialToolCall);
                      } catch (e) {
                        // If arguments are not valid JSON, wait for more data
                        console.log("Waiting for complete tool call arguments");
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error processing line:', error);
                  // If we have a partial tool call and hit an error, flush it
                  if (partialToolCall) {
                    console.log("Error encountered - flushing incomplete tool call:", partialToolCall);
                    flushToolCall(partialToolCall);
                  }
                }
              }
            }
          } finally {
            clearInterval(toolCallInterval);
            // Ensure any remaining partial tool call is flushed
            if (partialToolCall) {
              console.log("Stream ended - flushing final tool call:", partialToolCall);
              flushToolCall(partialToolCall);
            }
          }
          
          // If we get here, the request succeeded, so we can return
          return;
        } catch (error) {
          console.error(`Error with endpoint ${baseEndpoint}:`, error);
          lastError = error as Error;
          // Continue to next endpoint
        }
      }
      
      // If we've tried all endpoints and none worked, throw the last error
      if (lastError) {
        throw lastError;
      } else {
        throw new Error('All endpoints failed but no error was captured');
      }
    } catch (error) {
      console.error('Error in createStreamingChatCompletion:', error);
      throw error;
    }
  }

  async createCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    try {
      // Determine purpose for the API endpoint
      const purpose = options.purpose || 'insert';
      const baseUrl = await this.getApiEndpoint(purpose);
      
      console.log(`LM Studio: Sending completion request to ${baseUrl}/completions`);
      console.log('Request options:', {
        model: options.model,
        prompt: options.prompt.substring(0, 100) + '...', // Log the first 100 chars for debugging
        temperature: options.temperature ?? 0.2,
        max_tokens: options.max_tokens ?? 100,
        stop: options.stop
      });

      const response = await fetch(`${baseUrl}/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          prompt: options.prompt,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.max_tokens ?? 100,
          stop: options.stop,
          suffix: options.suffix
        })
      }).catch(error => {
        console.error(`Network error connecting to ${baseUrl}: ${error.message}`);
        throw new Error(`Could not connect to AI service at ${baseUrl}. Please check your settings and ensure the service is running.`);
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`LM Studio API error (${response.status}):`, text);
        throw new Error(`LM Studio API error (${response.status}): ${text}`);
      }

      const data = await response.json();
      console.log('LM Studio: Completion response received:', data);
      return data;
    } catch (error) {
      console.error('Error in createCompletion:', error);
      throw error;
    }
  }

  private hasCompleteToolCall(buffer: string): boolean {
    // Check if the buffer contains a complete function call
    try {
      // Look for a pattern that indicates a complete function call
      const match = buffer.match(/function_call:\s*({[\s\S]*?})\s*(?=function_call:|$)/);
      if (!match) return false;
      
      // Extract the JSON part
      const jsonStr = match[1];
      if (!jsonStr) return false;
      
      // Try to parse the JSON to verify it's complete
      const parsedCall = JSON.parse(jsonStr);
      return !!(parsedCall && parsedCall.id && parsedCall.name);
    } catch (error) {
      // If parsing fails, it's not a complete call
      return false;
    }
  }
}

const lmStudio = new LMStudioService();
export default lmStudio; 