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

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
}

interface CompletionResponse {
  choices: {
    text: string;
    index: number;
    finish_reason: string;
  }[];
}

class LMStudioService {
  private baseUrl = '/v1';

  async createChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const { onStream, ...requestOptions } = options;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
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

      return {
        choices: [{
          message: {
            content: fullContent
          }
        }]
      };
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
      if (!messages || messages.length === 0) {
        throw new Error('Messages array is required and cannot be empty');
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
    } catch (error) {
      console.error('Error in createStreamingChatCompletion:', error);
      throw error;
    }
  }

  async createCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    try {
      console.log(`LM Studio: Sending completion request to ${this.baseUrl}/completions`);
      console.log('Request options:', {
        model: options.model,
        prompt: options.prompt.substring(0, 100) + '...', // Log the first 100 chars for debugging
        temperature: options.temperature ?? 0.2,
        max_tokens: options.max_tokens ?? 100,
        stop: options.stop
      });

      const response = await fetch(`${this.baseUrl}/completions`, {
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

export const lmStudio = new LMStudioService(); 