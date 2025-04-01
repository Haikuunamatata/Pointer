export interface FileSystemItem {
  id: string;
  name: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileSystemItem[];
  parentId: string | null;
  path: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  autoAcceptGhostText: boolean;
}

export interface ThemeSettings {
  name: string;
  customColors: {
    // App UI Colors
    bgPrimary?: string;
    bgSecondary?: string;
    bgTertiary?: string;
    bgSelected?: string;
    bgHover?: string;
    bgAccent?: string;
    textPrimary?: string;
    textSecondary?: string;
    borderColor?: string;
    borderPrimary?: string;
    accentColor?: string;
    accentHover?: string;
    errorColor?: string;
    titlebarBg?: string;
    statusbarBg?: string;
    statusbarFg?: string;
    activityBarBg?: string;
    activityBarFg?: string;
    inlineCodeColor?: string;
    
    // Explorer Colors
    explorerFolderFg?: string;
    explorerFolderExpandedFg?: string;
    explorerFileFg?: string;
    /**
     * @deprecated Use customFileExtensions instead
     */
    explorerFileJavaScriptFg?: string;
    /**
     * @deprecated Use customFileExtensions instead
     */
    explorerFileTypeScriptFg?: string;
    /**
     * @deprecated Use customFileExtensions instead
     */
    explorerFileJsonFg?: string;
    /**
     * @deprecated Use customFileExtensions instead
     */
    explorerFileHtmlFg?: string;
    /**
     * @deprecated Use customFileExtensions instead
     */
    explorerFileCssFg?: string;
    /**
     * @deprecated Use customFileExtensions instead
     */
    explorerFileMarkdownFg?: string;
    /**
     * @deprecated Use customFileExtensions instead
     */
    explorerFileYamlFg?: string;
    /**
     * @deprecated Use customFileExtensions instead
     */
    explorerFileImageFg?: string;
    
    // Custom file extension colors - key is the extension, value is the color
    customFileExtensions?: Record<string, string>;
  };
  // Monaco Editor Colors
  editorColors: {
    // Basic colors
    "editor.background"?: string;
    "editor.foreground"?: string;
    "editorLineNumber.foreground"?: string;
    "editorLineNumber.activeForeground"?: string;
    "editorCursor.background"?: string;
    "editorCursor.foreground"?: string;
    
    // Selection colors
    "editor.selectionBackground"?: string;
    "editor.selectionForeground"?: string;
    "editor.inactiveSelectionBackground"?: string;
    "editor.selectionHighlightBackground"?: string;
    "editor.selectionHighlightBorder"?: string;
    
    // Word highlight
    "editor.wordHighlightBackground"?: string;
    "editor.wordHighlightStrongBackground"?: string;
    "editor.wordHighlightBorder"?: string;
    "editor.wordHighlightStrongBorder"?: string;
    
    // Find matches
    "editor.findMatchBackground"?: string;
    "editor.findMatchHighlightBackground"?: string;
    "editor.findRangeHighlightBackground"?: string;
    "editor.findMatchBorder"?: string;
    "editor.findMatchHighlightBorder"?: string;
    
    // Line highlight
    "editor.lineHighlightBackground"?: string;
    "editor.lineHighlightBorder"?: string;
    
    // Gutter
    "editorGutter.background"?: string;
    "editorGutter.modifiedBackground"?: string;
    "editorGutter.addedBackground"?: string;
    "editorGutter.deletedBackground"?: string;
    
    // Bracket matching
    "editorBracketMatch.background"?: string;
    "editorBracketMatch.border"?: string;
    
    // Overview ruler
    "editorOverviewRuler.border"?: string;
    "editorOverviewRuler.findMatchForeground"?: string;
    "editorOverviewRuler.rangeHighlightForeground"?: string;
    "editorOverviewRuler.selectionHighlightForeground"?: string;
    "editorOverviewRuler.wordHighlightForeground"?: string;
    "editorOverviewRuler.wordHighlightStrongForeground"?: string;
    "editorOverviewRuler.modifiedForeground"?: string;
    "editorOverviewRuler.addedForeground"?: string;
    "editorOverviewRuler.deletedForeground"?: string;
    "editorOverviewRuler.errorForeground"?: string;
    "editorOverviewRuler.warningForeground"?: string;
    "editorOverviewRuler.infoForeground"?: string;
    
    // Errors and warnings
    "editorError.foreground"?: string;
    "editorError.border"?: string;
    "editorWarning.foreground"?: string;
    "editorWarning.border"?: string;
    
    // Widget colors
    "editorWidget.background"?: string;
    "editorWidget.border"?: string;
    "editorSuggestWidget.background"?: string;
    "editorSuggestWidget.border"?: string;
    "editorSuggestWidget.foreground"?: string;
    "editorSuggestWidget.highlightForeground"?: string;
    "editorSuggestWidget.selectedBackground"?: string;
    "editorHoverWidget.background"?: string;
    "editorHoverWidget.border"?: string;
  };
  // Token syntax highlighting rules
  tokenColors?: Array<{
    token: string;
    foreground?: string;
    background?: string;
    fontStyle?: string;
  }>;
}

export interface DiscordRpcSettings {
  enabled: boolean;
  details: string;
  state: string;
  largeImageKey: string;
  largeImageText: string;
  smallImageKey: string;
  smallImageText: string;
  button1Label: string;
  button1Url: string;
  button2Label: string;
  button2Url: string;
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
  discordRpc?: DiscordRpcSettings;
  advanced?: {
    titleFormat?: string;
    [key: string]: any;
  };
} 