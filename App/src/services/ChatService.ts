import { Message } from '../types';

export interface ChatSession {
  id: string;
  name: string;
  createdAt: string;
  messages: Message[];
}

export class ChatService {
  private static API_URL = 'http://localhost:23816';

  static async saveChat(chatId: string, messages: Message[]) {
    try {
      const chatSession: ChatSession = {
        id: chatId,
        name: `Chat ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        messages,
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
} 