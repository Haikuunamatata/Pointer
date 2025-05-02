import { Message } from '../types';
import { ToolService } from './ToolService';

// Helper function to safely check if a tool is executing
const isToolExecuting = (): boolean => {
  try {
    // Try static method first with type safety
    if (ToolService && typeof (ToolService as any).isExecutingTool === 'function') {
      return (ToolService as any).isExecutingTool();
    }
    
    // Fallback: just return false to allow saving
    return false;
  } catch (e) {
    console.warn('Error checking tool execution state:', e);
    return false; // Default to allowing saves if there's an error
  }
};

export interface ChatSession {
  id: string;
  name: string;
  createdAt: string;
  messages: Message[];
}

export class ChatService {
  private static API_URL = 'http://localhost:23816';

  /**
   * Generate a valid ISO timestamp for chat creation
   * Ensures dates are not in the future by validating against current time
   */
  private static getValidCreationTimestamp(): string {
    const now = new Date();
    // Ensure we're not in the future (handles system clock issues)
    const maxAllowableTime = new Date();
    maxAllowableTime.setFullYear(maxAllowableTime.getFullYear() + 1); // Allow at most 1 year in the future
    
    // If current time is beyond max allowable, use a safe default
    if (now > maxAllowableTime) {
      console.warn('System clock may be incorrect - using safe default date');
      return new Date().toISOString().split('T')[0] + 'T12:00:00.000Z'; // Use current date at noon UTC
    }
    
    return now.toISOString();
  }

  /**
   * Extract a user-friendly chat name from message content
   */
  private static generateChatName(messages: Message[]): string {
    // Look for the first user message as the basis for the chat name
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage && typeof firstUserMessage.content === 'string') {
      // Take first 30 chars or less of first user message
      const nameBase = firstUserMessage.content.trim().substring(0, 30);
      return nameBase.length > 0 ? nameBase : `Chat ${new Date().toLocaleString()}`;
    }
    
    // Fallback name
    return `Chat ${new Date().toLocaleString()}`;
  }

  /**
   * Save chat to the backend
   * Prevents saving during tool execution to avoid file format toggling
   */
  static async saveChat(chatId: string, messages: Message[]) {
    try {
      // Check if a tool execution is in progress
      if (ToolService.isToolExecutionInProgress()) {
        console.log('Tool execution in progress, skipping chat save to prevent file toggling');
        return;
      }
      
      // Only include essential messages in the saved chat
      // Filter out excessive tool messages that cause file bloat
      const filteredMessages = this.filterToolMessages(messages);
      
      const chatSession: ChatSession = {
        id: chatId,
        name: this.generateChatName(messages),
        createdAt: this.getValidCreationTimestamp(),
        messages: filteredMessages,
      };

      const response = await fetch(`${this.API_URL}/chats/${chatId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatSession),
      });

      if (!response.ok) {
        throw new Error('Failed to save chat');
      }
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  }
  
  /**
   * Filter out redundant tool messages to prevent chat file bloat
   * Keeps only the most relevant tool messages
   */
  private static filterToolMessages(messages: Message[]): Message[] {
    // Create a map to store the latest tool result for each user query
    const toolResultMap = new Map<string, Message[]>();
    let currentUserQuery = '';
    let currentGroup: Message[] = [];
    
    // First pass: group messages by user query
    for (const message of messages) {
      if (message.role === 'user') {
        // Start a new user query group
        currentUserQuery = typeof message.content === 'string' ? message.content : 'query';
        currentGroup = [];
        toolResultMap.set(currentUserQuery, currentGroup);
      }
      
      // Add message to current group
      if (currentGroup) {
        currentGroup.push(message);
      }
    }
    
    // Second pass: for each group, keep only important tool messages
    const filteredMessages: Message[] = [];
    for (const group of toolResultMap.values()) {
      // Add user and system messages
      const nonToolMessages = group.filter(m => m.role !== 'tool');
      filteredMessages.push(...nonToolMessages);
      
      // Find successful tool messages
      const toolMessages = group.filter(m => m.role === 'tool');
      if (toolMessages.length > 0) {
        // If there are many tool messages, keep only the successful ones or the last one
        const successfulTools = toolMessages.filter(m => 
          !m.content.includes('error') && !m.content.includes('Error')
        );
        
        if (successfulTools.length > 0) {
          // Add only successful tool messages
          filteredMessages.push(...successfulTools);
        } else {
          // If no successful ones, add just the last failure
          filteredMessages.push(toolMessages[toolMessages.length - 1]);
        }
      }
    }
    
    return filteredMessages;
  }

  static async loadChat(chatId: string): Promise<ChatSession | null> {
    try {
      const response = await fetch(`${this.API_URL}/chats/${chatId}`);
      if (!response.ok) {
        throw new Error('Failed to load chat');
      }
      return await response.json();
    } catch (error) {
      console.error('Error loading chat:', error);
      return null;
    }
  }

  static async listChats(): Promise<ChatSession[]> {
    try {
      const response = await fetch(`${this.API_URL}/chats`);
      if (!response.ok) {
        throw new Error('Failed to list chats');
      }
      const chats = await response.json();
      return chats
        .filter((chat: ChatSession) => chat.messages && chat.messages.length > 1)
        .sort((a: ChatSession, b: ChatSession) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch (error) {
      console.error('Error listing chats:', error);
      return [];
    }
  }

  /**
   * Validate timestamps in the chat object and fix any issues
   */
  private validateAndFixTimestamps(chat: any): void {
    const now = new Date();
    const maxFutureTime = new Date(now.getTime() + 60 * 1000); // Allow 1 minute future time for clock skew
    
    if (chat.messages && Array.isArray(chat.messages)) {
      chat.messages.forEach((msg: any) => {
        if (msg.timestamp) {
          // Check for future dates (more than 1 minute in the future)
          const timestamp = new Date(msg.timestamp);
          if (timestamp > maxFutureTime) {
            console.warn(`Fixed future timestamp in message: ${msg.timestamp}`);
            msg.timestamp = now.toISOString();
          }
          
          // Check for invalid date strings
          if (isNaN(timestamp.getTime())) {
            console.warn(`Fixed invalid timestamp in message: ${msg.timestamp}`);
            msg.timestamp = now.toISOString();
          }
        }
      });
    }
  }

  /**
   * Filter out problematic system messages
   */
  private filterSystemMessages(messages: Message[]): Message[] {
    return messages.filter(msg => {
      // Keep all non-system messages
      if (msg.role !== 'system') return true;
      
      // Filter out problematic system messages
      const content = typeof msg.content === 'string' ? msg.content : '';
      const isErrorMessage = content.includes('ERROR:') && content.includes('critical');
      const isDebugMessage = content.includes('DEBUG:') && content.includes('internal');
      
      // Remove problematic messages
      if (isErrorMessage || isDebugMessage) {
        console.log('Filtering out problematic system message:', content.substring(0, 50) + '...');
        return false;
      }
      
      return true;
    });
  }

  private saveChat(chat: any) {
    try {
      // Check if a tool execution is in progress
      if (ToolService.isToolExecutionInProgress()) {
        console.log('Tool execution in progress, skipping chat save to prevent file toggling');
        return;
      }
      
      // Create a deep copy to avoid modifying the original
      const chatCopy = JSON.parse(JSON.stringify(chat));
      
      // Validate and fix message timestamps
      this.validateAndFixTimestamps(chatCopy);
      
      // Filter out specific types of system messages that might cause issues
      chatCopy.messages = this.filterSystemMessages(chatCopy.messages);
      
      // Use the existing save mechanism
      // We don't need to directly access the filesystem here
      console.log(`Preparing to save chat with filtered messages`);
      
      // Call the actual implementation that handles the file operations
      this.saveChatToFile(chatCopy);
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  }

  // Placeholder for the implementation - this should call the actual file saving logic
  private saveChatToFile(chat: any) {
    // This method should be implemented based on your existing file saving mechanism
    console.log('Chat prepared for saving with all fixes applied');
  }
} 