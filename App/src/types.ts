export interface FileSystemItem {
  id: string;
  name: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileSystemItem[];
  parentId: string | null;
  path: string;
}

export interface FileSystemState {
  items: Record<string, FileSystemItem>;
  currentFileId: string | null;
  rootId: string;
  terminalOpen: boolean;
}

export interface ModelConfig {
  id?: string;
  name: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  systemPrompt?: string;
  contextLength?: number;
  stopSequences?: string[];
  modelProvider?: string;
  apiEndpoint?: string;
  apiKey?: string;
  purpose?: 'chat' | 'insert' | 'autocompletion' | 'summary' | 'general';
}

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  rulers: number[];
  formatOnSave: boolean;
  formatOnPaste: boolean;
  autoSave: boolean;
}

export interface ThemeSettings {
  name: string;
  customColors: Record<string, string>;
}

export interface ModelAssignments {
  chat: string;
  insert: string;
  autocompletion: string;
  summary: string;
}

export interface AppSettings {
  models: Record<string, ModelConfig>;
  modelAssignments: ModelAssignments;
  editor: EditorSettings;
  theme: ThemeSettings;
  keybindings?: Record<string, string>;
  terminal?: Record<string, any>;
  advanced?: Record<string, any>;
} 