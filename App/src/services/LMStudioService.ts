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
  private async getApiEndpoint(purpose: 'chat' | 'insert' | 'autocompletion' | 'summary'): Promise<string> {
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
      onUpdate
    } = options;
    
    try {
      // Get the endpoint based on chat purpose
      const modelConfig = await AIFileService.getModelConfigForPurpose('chat');
      console.log(`Attempting to connect to API at: ${modelConfig.apiEndpoint}`);

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
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
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
            }),
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

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

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
                const content = data.choices[0]?.delta?.content || '';
                if (content) {
                  accumulatedContent += content;  // Accumulate content
                  onUpdate(accumulatedContent);   // Send accumulated content
                }
              } catch (error) {
                console.error('Error parsing SSE message:', error);
              }
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
}

const lmStudio = new LMStudioService();
export default lmStudio; 