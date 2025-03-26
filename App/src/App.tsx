import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import FileExplorer from './components/FileExplorer';
import Tabs from './components/Tabs';
import Resizable from './components/Resizable';
import { FileSystemItem, FileSystemState } from './types';
import { FileSystemService } from './services/FileSystemService';
import { RecentProjectsMenu } from './components/RecentProjectsMenu';
import EditorGrid from './components/EditorGrid';
import { initializeLanguageSupport, getLanguageFromFileName } from './utils/languageUtils';
import { LLMChat } from './components/LLMChat';
import './styles/App.css';
import { ChatService, ChatSession } from './services/ChatService';
import { v4 as uuidv4 } from 'uuid';
import Terminal from './components/Terminal';
import { DiffViewer } from './components/DiffViewer';
import LoadingScreen from './components/LoadingScreen';
import { Settings } from './components/Settings';
import ToastContainer from './components/ToastContainer';

// Initialize language support
initializeLanguageSupport();

interface IEditor extends monaco.editor.IStandaloneCodeEditor {}

// Update the top bar styles
const topBarStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '2px 4px',
  borderBottom: '1px solid var(--border-color)',
  background: 'var(--titlebar-bg)',
  gap: '4px',
  height: '28px',
  transition: 'height 0.2s ease',
  overflow: 'hidden',
} as const;

const topBarCollapsedStyle = {
  ...topBarStyle,
  height: '0px',
  padding: '0px 4px',
  border: 'none',
} as const;

const topBarButtonStyle = {
  padding: '2px 6px',
  fontSize: '12px',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  height: '22px',
  borderRadius: '3px',
} as const;

// Add this near the top of App.tsx, after the imports
declare global {
  interface Window {
    getCurrentFile: () => { path: string; } | null;
    editor?: monaco.editor.IStandaloneCodeEditor;
    reloadFileContent?: (fileId: string) => Promise<void>;
    fileSystem?: Record<string, FileSystemItem>;
    applyCustomTheme?: () => void;
    loadSettings?: () => Promise<void>;
    appSettings?: Record<string, any>;
  }
}

const App: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editor = useRef<IEditor | null>(null);
  const currentThemeRef = useRef<{
    name: string;
    editorColors: Record<string, string>;
    tokenColors: Array<any>;
  }>({
    name: 'vs-dark',
    editorColors: {},
    tokenColors: []
  });
  const [fileSystem, setFileSystem] = useState<FileSystemState>(() => {
    const rootId = 'root';
    return {
      items: {
        [rootId]: {
          id: rootId,
          name: 'workspace',
          type: 'directory',
          parentId: null,
          path: '',
        },
        'welcome': {
          id: 'welcome',
          name: 'notes.js',
          type: 'file',
          content: "// Welcome to your new code editor!\n// Start typing here...\n\n// By the way you can't delete or save this file. (future updates (maybe (if i have motivation)))",
          parentId: rootId,
          path: 'notes.js',
        },
      },
      currentFileId: null,
      rootId,
      terminalOpen: false,
    };
  });

  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: 'file' | 'folder' | null;
    parentId: string | null;
    name: string;
  }>({
    isOpen: false,
    type: null,
    parentId: null,
    name: '',
  });

  // Add loading state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  // Add connection loading state
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionMessage, setConnectionMessage] = useState('');

  // Add save status state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);

  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState(false);

  // Add state for cursor position
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });

  // Add state for grid layout
  const [isGridLayout, setIsGridLayout] = useState(false);

  // Add state for chat visibility
  const [isLLMChatVisible, setIsLLMChatVisible] = useState(true);

  // Add state for chat width
  const [width, setWidth] = useState(300);

  // Add this inside the App component, near other state declarations
  const [isChatListVisible, setIsChatListVisible] = useState(false);
  const [chats, setChats] = useState<ChatSession[]>([]);

  // Add this for settings modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsData, setSettingsData] = useState<Record<string, any>>({});

  // Add this inside the App component
  const loadChats = async () => {
    const loadedChats = await ChatService.listChats();
    setChats(loadedChats);
  };

  // Add this for Discord RPC settings
  const [discordRpcSettings, setDiscordRpcSettings] = useState({
    enabled: true,
    details: "Editing {file} | Line {line}:{column}",
    state: "Workspace: {workspace}",
    largeImageKey: "pointer_logo",
    largeImageText: "Pointer - Code Editor",
    smallImageKey: "code",
    smallImageText: "{languageId} | Line {line}:{column}",
    button1Label: "Please Contribute \ud83d\ude4f",
    button1Url: "https://pointer.f1shy312.com",
    button2Label: "im depressive cuz ts pmo",
    button2Url: "https://github.com/f1shyondrugs/Pointer"
  });

  // Load settings, including Discord settings
  const loadSettings = async () => {
    try {
      const result = await FileSystemService.readSettingsFiles('C:/ProgramData/Pointer/data/settings');
      if (result && result.success) {
        setSettingsData(result.settings);
        
        // Apply editor settings if they exist
        if (result.settings.editor && editor.current) {
          const editorSettings = result.settings.editor;
          
          // Apply editor settings to Monaco
          editor.current.updateOptions({
            fontFamily: editorSettings.fontFamily,
            fontSize: editorSettings.fontSize,
            lineHeight: editorSettings.lineHeight,
            tabSize: editorSettings.tabSize,
            insertSpaces: editorSettings.insertSpaces,
            wordWrap: editorSettings.wordWrap ? 'on' : 'off',
            formatOnPaste: editorSettings.formatOnPaste,
            formatOnType: editorSettings.formatOnSave,
          });
        }
        
        // Apply theme settings if they exist
        if (result.settings.theme) {
          const themeSettings = result.settings.theme;
          
          // Validate the base theme
          const validBaseThemes = ['vs', 'vs-dark', 'hc-black', 'hc-light'];
          const baseTheme = validBaseThemes.includes(themeSettings.name) 
            ? themeSettings.name as monaco.editor.BuiltinTheme
            : 'vs-dark';
          
          // Process colors to ensure they're in a valid format
          const processedEditorColors: Record<string, string> = {};
          Object.entries(themeSettings.editorColors || {}).forEach(([key, value]) => {
            if (value) {
              // Remove alpha component if present (e.g., #rrggbbaa → #rrggbb)
              const processedValue = value.length > 7 ? value.substring(0, 7) : value;
              processedEditorColors[key] = processedValue;
            }
          });

          // Store the current theme in the ref for persistence
          currentThemeRef.current = {
            name: baseTheme,
            editorColors: processedEditorColors,
            tokenColors: themeSettings.tokenColors || []
          };
          
          // Create and apply custom Monaco theme
          applyCustomTheme();

          // Apply custom UI colors
          Object.entries(themeSettings.customColors).forEach(([key, value]) => {
            if (value && typeof value === 'string') {
              const cssVarName = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
              document.documentElement.style.setProperty(cssVarName, value);
            }
          });
          
          // Store customFileExtensions for file explorer to access
          if (themeSettings.customColors.customFileExtensions) {
            window.appSettings = window.appSettings || {};
            window.appSettings.theme = window.appSettings.theme || {};
            window.appSettings.theme.customColors = window.appSettings.theme.customColors || {};
            window.appSettings.theme.customColors.customFileExtensions = 
              { ...themeSettings.customColors.customFileExtensions };
          }
        }

        // Process Discord RPC settings
        if (result.settings.discordRpc) {
          setDiscordRpcSettings(prev => ({
            ...prev,
            ...result.settings.discordRpc
          }));
          
          // Send settings to main process
          if (window.electron && window.electron.discord) {
            window.electron.discord.updateSettings(result.settings.discordRpc);
          }
        }
      } else {
        console.error('Failed to load settings');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  // Create a function to apply the custom theme
  const applyCustomTheme = () => {
    const { name, editorColors, tokenColors } = currentThemeRef.current;
    
    monaco.editor.defineTheme('custom-theme', {
      base: name as monaco.editor.BuiltinTheme,
      inherit: true,
      rules: tokenColors.map(item => ({
        token: item.token,
        foreground: item.foreground?.replace('#', ''),
        background: item.background?.replace('#', ''),
        fontStyle: item.fontStyle
      })),
      colors: editorColors
    });
    
    // Apply the custom theme
    monaco.editor.setTheme('custom-theme');
    
    // Apply custom UI colors from the current settings
    const themeSettings = window.appSettings?.theme;
    if (themeSettings?.customColors) {
      // Make custom extension colors available to the FileExplorer component
      window.appSettings = window.appSettings || {};
      window.appSettings.theme = window.appSettings.theme || {};
      window.appSettings.theme.customColors = window.appSettings.theme.customColors || {};
      
      // Make a copy of the custom file extensions for the FileExplorer to access
      if (themeSettings.customColors.customFileExtensions) {
        window.appSettings.theme.customColors.customFileExtensions = 
          { ...themeSettings.customColors.customFileExtensions };
      }
      
      // Notify components that the theme has changed
      window.dispatchEvent(new Event('theme-changed'));
    }
  };

  // Expose the custom theme function to the window object for use by other components
  useEffect(() => {
    window.applyCustomTheme = applyCustomTheme;
    
    return () => {
      // Clean up when the component unmounts
      delete window.applyCustomTheme;
    };
  }, []);

  // Load settings on app start
  useEffect(() => {
    loadSettings();
  }, []);

  // Add a dedicated effect to ensure theme is applied on app start and whenever editor changes
  useEffect(() => {
    // Only apply if editor exists
    if (editor.current) {
      // Use a small timeout to ensure Monaco editor is fully initialized
      const timeoutId = setTimeout(() => {
        applyCustomTheme();
        console.log('Applied theme on startup/editor change');
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [editor.current]);

  // Add this effect to load chats
  useEffect(() => {
    loadChats();
  }, []);

  // Add effect to track cursor position
  useEffect(() => {
    if (editor.current) {
      const disposable = editor.current.onDidChangeCursorPosition((e) => {
        const position = e.position;
        setCursorPosition({
          line: position.lineNumber,
          column: position.column,
        });
      });
      return () => disposable.dispose();
    }
  }, [editor.current]);

  useEffect(() => {
    if (editorRef.current) {
      // Ensure the container is properly sized before creating the editor
      const container = editorRef.current;
      if (container.offsetHeight === 0 || container.offsetWidth === 0) {
        console.warn('Editor container has zero dimensions');
        return;
      }

      // Create editor with explicit dimensions
      editor.current = monaco.editor.create(container, {
        value: fileSystem.currentFileId 
          ? fileSystem.items[fileSystem.currentFileId].content || ''
          : '',
        language: 'javascript',
        theme: 'vs-dark', // Initial theme, will be replaced
        automaticLayout: false, // We'll handle layout updates manually
        dimension: {
          width: container.offsetWidth,
          height: container.offsetHeight
        },
        minimap: {
          enabled: true,
          scale: 0.8,
          renderCharacters: false,
          maxColumn: 60,
          showSlider: 'mouseover',
        },
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        lineHeight: 20,
        letterSpacing: 0.5,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        cursorStyle: 'line',
        cursorWidth: 2,
        wordWrap: 'on',
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        renderLineHighlight: 'line',
        renderWhitespace: 'selection',
        padding: { top: 4, bottom: 4 },
        suggest: {
          showWords: true,
          preview: true,
          showIcons: true,
          snippetsPreventQuickSuggestions: false, // Allow quick suggestions even when snippets are active
          localityBonus: true, // Favor nearby words in suggestions
          shareSuggestSelections: true, // Remember selections across widgets
        },
        // Add more robust trigger suggestion settings
        quickSuggestions: {
          other: true,
          comments: false, 
          strings: false
        },
        acceptSuggestionOnCommitCharacter: true,
        acceptSuggestionOnEnter: 'on',
        suggestOnTriggerCharacters: true,
        tabCompletion: 'on',
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
          vertical: 'visible',
          horizontal: 'visible',
          verticalHasArrows: false,
          horizontalHasArrows: false,
          useShadows: false,
        }
      });

      // Set up a proper resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && editor.current) {
          // Debounce layout updates
          window.requestAnimationFrame(() => {
            try {
              editor.current?.layout({
                width: entry.contentRect.width,
                height: entry.contentRect.height
              });
            } catch (error) {
              console.error('Error updating editor layout:', error);
            }
          });
        }
      });

      resizeObserver.observe(container);

      // Set VSCode's exact theme colors
      monaco.editor.defineTheme('vscode-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#1e1e1e',
          'editor.foreground': '#d4d4d4',
          'editor.lineHighlightBackground': '#2d2d2d50',
          'editorCursor.foreground': '#d4d4d4',
          'editorLineNumber.foreground': '#858585',
          'editorLineNumber.activeForeground': '#c6c6c6',
        }
      });

      // Apply our custom theme if it exists, otherwise use the default
      if (currentThemeRef.current.name !== 'vs-dark' || 
          Object.keys(currentThemeRef.current.editorColors).length > 0 || 
          currentThemeRef.current.tokenColors.length > 0) {
        applyCustomTheme();
      } else {
        monaco.editor.setTheme('vscode-dark');
      }

      const updateContent = () => {
        if (fileSystem.currentFileId && editor.current) {
          setFileSystem(prev => ({
            ...prev,
            items: {
              ...prev.items,
              [prev.currentFileId!]: {
                ...prev.items[prev.currentFileId!],
                content: editor.current?.getValue() || '',
              },
            },
          }));
        }
      };

      editor.current.onDidChangeModelContent(() => {
        updateContent();
      });

      // Set up editor global settings for suggestions to be automatic
      try {
        // Configure Monaco's global settings to ensure suggestions are shown automatically 
        monaco.languages.registerCompletionItemProvider('*', {
          provideCompletionItems: () => {
            return { suggestions: [] };
          },
          // Remove trigger characters since we're using timeout-based autocompletion instead
          triggerCharacters: [],
        });
        
        // Remove the onKeyUp handler that was triggering on specific characters
        // We'll rely solely on the timeout-based triggering in EditorGrid.tsx
      } catch (err) {
        console.error("Error setting up auto-suggestions:", err);
      }

      // Make editor globally available
      window.editor = editor.current;

      return () => {
        resizeObserver.disconnect();
        window.editor = undefined;
        editor.current?.dispose();
      };
    }
  }, [fileSystem.currentFileId]);

  const handleFileSelect = async (fileId: string) => {
    // Apply custom theme at the beginning to ensure it's set
    applyCustomTheme();
    
    // Check if file exists in the current file system state
    if (!fileSystem.items[fileId]) {
      console.error(`Attempted to select non-existent file with id: ${fileId}`);
      return;
    }

    const file = fileSystem.items[fileId];
    if (file.type === 'file') {
      if (!openFiles.includes(fileId)) {
        setOpenFiles(prev => [...prev, fileId]);
      }
      
      try {
        // Refresh structure before loading file
        await FileSystemService.refreshStructure();
        
        // Then load the file
        const content = await FileSystemService.readFile(fileId);
        if (content !== null) {
          setFileSystem(prev => ({
            ...prev,
            currentFileId: fileId,
            items: {
              ...prev.items,
              [fileId]: {
                ...prev.items[fileId],
                content: content,
              },
            },
          }));
          if (editor.current) {
            editor.current.setValue(content);
            // Reapply the custom theme after setting editor content
            applyCustomTheme();
          }
        }
      } catch (error) {
        console.error('Error loading file content:', error);
      }
    }
  };

  const handleTabSelect = async (tabId: string) => {
    console.log('handleTabSelect called with:', tabId);
    
    // Apply custom theme at the beginning of tab select to ensure it's set
    applyCustomTheme();
    
    // Special handling for welcome tab
    if (tabId === 'welcome') {
      // Make sure welcome file exists in the state
      if (!fileSystem.items['welcome']) {
        // If welcome file doesn't exist, recreate it
        setFileSystem(prev => ({
          ...prev,
          currentFileId: 'welcome',
          items: {
            ...prev.items,
            'welcome': {
              id: 'welcome',
              name: 'notes.js',
              type: 'file',
              content: "// Welcome to your new code editor!\n// Start typing here...\n\n// By the way you can't delete or save this file. (future updates (maybe (if i have motivation)))",
              parentId: prev.rootId,
              path: 'notes.js',
            }
          }
        }));
        
        if (editor.current) {
          editor.current.setValue(fileSystem.items['welcome']?.content || '');
          // Reapply the custom theme after setting editor content
          applyCustomTheme();
        }
        return;
      }
      
      setFileSystem(prev => ({ ...prev, currentFileId: 'welcome' }));
      if (editor.current) {
        editor.current.setValue(fileSystem.items['welcome']?.content || '');
        // Reapply the custom theme after setting editor content
        applyCustomTheme();
      }
      return;
    }

    // Check if regular file exists
    if (!fileSystem.items[tabId]) {
      console.error(`Attempted to select non-existent tab with id: ${tabId}`);
      // Fall back to welcome file
      handleTabSelect('welcome');
      return;
    }

    // First update the UI to show the selected tab
    setFileSystem(prev => ({ ...prev, currentFileId: tabId }));
    
    // Then load the file content
    try {
      const content = await FileSystemService.readFile(tabId);
      console.log('File content loaded:', content ? 'success' : 'null');
      
      if (content !== null) {
        // Update file system with new content
        setFileSystem(prev => ({
          ...prev,
          items: {
            ...prev.items,
            [tabId]: {
              ...prev.items[tabId],
              content: content,
            },
          },
        }));
        
        if (editor.current) {
          editor.current.setValue(content);
          // Reapply the custom theme after setting editor content
          applyCustomTheme();
        }
      }
    } catch (error) {
      console.error('Error loading file content:', error);
    }
  };

  const handleTabClose = async (tabId: string) => {
    // First save the file if it exists and is not the welcome file
    if (tabId !== 'welcome' && tabId && fileSystem.items[tabId]) {
      try {
        // Get the file content from the editor if it's the current file,
        // otherwise use the content from fileSystem state
        const content = tabId === fileSystem.currentFileId && editor.current 
          ? editor.current.getValue() 
          : fileSystem.items[tabId].content || '';

        // Only save if there's actual content and a valid path
        if (content && fileSystem.items[tabId].path) {
          await FileSystemService.saveFile(tabId, content);
        }
      } catch (error) {
        console.error(`Error saving file before closing tab: ${tabId}`, error);
      }
    }

    setOpenFiles(prev => {
      const newOpenFiles = prev.filter(id => id !== tabId);
      
      // If we're closing the current file, switch to the last open file
      if (tabId === fileSystem.currentFileId) {
        const lastFileId = newOpenFiles[newOpenFiles.length - 1];
        if (lastFileId) {
          // Use setTimeout to ensure state updates don't conflict
          setTimeout(() => handleTabSelect(lastFileId), 0);
        } else {
          // No files left open, show welcome screen
          setFileSystem(prev => ({ 
            ...prev, 
            currentFileId: 'welcome'  // Set to welcome instead of null
          }));
          
          // Don't clear the editor if we still have the content in fileSystem
          if (editor.current && fileSystem.items['welcome']) {
            // Set to welcome message instead of empty string
            const welcomeContent = fileSystem.items['welcome'].content ||
              "// Welcome to your new code editor!\n// Start typing here...\n\n// By the way you can't delete or save this file.";
            editor.current.setValue(welcomeContent);
            
            // Apply theme when switching to welcome screen
            applyCustomTheme();
          }
        }
      }
      
      return newOpenFiles;
    });
  };

  const handleOpenFolder = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadingError(null);

      // Clear loaded folders when opening a new directory
      FileSystemService.clearLoadedFolders();

      const result = await FileSystemService.openDirectory();
      
      if (result) {
        // Update editor content
        if (editor.current) {
          editor.current.setValue('');
        }

        // Update file system state
        setFileSystem({
          items: result.items,
          rootId: result.rootId,
          currentFileId: null,
          terminalOpen: false,
        });

        // Clear open files
        setOpenFiles([]);
        
        // Show sidebar
        setIsSidebarCollapsed(false);

        // Save the directory path
        localStorage.setItem('lastDirectory', result.path);

        if (result.errors?.length > 0) {
          console.warn('Some files could not be accessed:', result.errors);
          setLoadingError('Some files could not be accessed');
        }
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
      setLoadingError(error instanceof Error ? error.message : 'Failed to open folder');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOpenFile = async () => {
    // Apply custom theme at the beginning to ensure it's set
    applyCustomTheme();
    
    try {
      const result = await FileSystemService.openFile();
      if (!result) {
        console.error('Failed to open file: No result returned');
        return;
      }

      // Update the file system state
      setFileSystem(prev => {
        const newItems = { ...prev.items };
        
        // Create a special "Opened Files" directory if it doesn't exist
        const openedFilesDirId = 'opened_files_dir';
        if (!newItems[openedFilesDirId]) {
          newItems[openedFilesDirId] = {
            id: openedFilesDirId,
            name: 'Opened Files',
            type: 'directory',
            parentId: prev.rootId,
            path: 'opened_files',
          };
        }
        
        // Add the file under the "Opened Files" directory
        newItems[result.id] = {
          id: result.id,
          name: result.filename,
          type: 'file',
          content: result.content,
          parentId: openedFilesDirId,
          path: result.fullPath, // Store the full path for saving
        };

        // Update the content in the file system state
        const updatedItems = {
          ...newItems,
          [result.id]: {
            ...newItems[result.id],
            content: result.content,
          },
        };

        return {
          ...prev,
          items: updatedItems,
          currentFileId: result.id,
        };
      });

      // Add to open files
      setOpenFiles(prev => [...prev, result.id]);

      // Set the editor content
      if (editor.current) {
        editor.current.setValue(result.content);
        // Apply custom theme after setting content
        applyCustomTheme();
      } else {
        console.error('Editor not initialized');
      }
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };

  const handleModalSubmit = async () => {
    if (!modalState.parentId || !modalState.type || !modalState.name) return;

    if (modalState.type === 'file') {
      const result = await FileSystemService.createFile(modalState.parentId, modalState.name);
      if (result) {
        setFileSystem(prev => ({
          ...prev,
          items: {
            ...prev.items,
            [result.id]: result.file,
          },
        }));
      }
    } else {
      const result = await FileSystemService.createDirectory(modalState.parentId, modalState.name);
      if (result) {
        setFileSystem(prev => ({
          ...prev,
          items: {
            ...prev.items,
            [result.id]: result.directory,
          },
        }));
      }
    }
    setModalState({ isOpen: false, type: null, parentId: null, name: '' });
  };

  const createFile = async (parentId: string) => {
    setModalState({
      isOpen: true,
      type: 'file',
      parentId,
      name: '',
    });
  };

  const createFolder = async (parentId: string) => {
    setModalState({
      isOpen: true,
      type: 'folder',
      parentId,
      name: '',
    });
  };

  const getCurrentFileName = () => {
    if (!fileSystem.currentFileId) return 'No file open';
    if (fileSystem.currentFileId === 'welcome') return 'Welcome';
    
    const currentFile = fileSystem.items[fileSystem.currentFileId];
    return currentFile?.name || 'No file open';
  };

  // Add save handler
  const handleSave = useCallback(async () => {
    if (!fileSystem.currentFileId || !editor.current) return;

    setSaveStatus('saving');
    const content = editor.current.getValue();
    
    try {
      const result = await FileSystemService.saveFile(fileSystem.currentFileId, content);
      
      if (result.success) {
        // Update the file system state with the saved content
        setFileSystem(prev => ({
          ...prev,
          items: {
            ...prev.items,
            [prev.currentFileId!]: {
              ...prev.items[prev.currentFileId!],
              content: result.content,
            },
          },
        }));

        // Update editor content if needed
        if (editor.current && editor.current.getValue() !== result.content) {
          editor.current.setValue(result.content);
        }

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
    }
  }, [fileSystem.currentFileId]);

  // Find the keyboard shortcut handler and add the LLMChat toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsTopBarCollapsed(!isTopBarCollapsed);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (fileSystem.currentFileId) {
          handleTabClose(fileSystem.currentFileId);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setIsLLMChatVisible(!isLLMChatVisible);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, isTopBarCollapsed, fileSystem.currentFileId, handleTabClose, isLLMChatVisible]);

  // Modify the auto-save functionality
  useEffect(() => {
    let saveTimeout: number;

    const handleContentChange = () => {
      if (fileSystem.currentFileId && editor.current) {
        const content = editor.current.getValue();
        
        // Clear previous timeout
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }

        // Set new timeout for auto-save
        saveTimeout = window.setTimeout(async () => {
          setSaveStatus('saving');
          try {
            const result = await FileSystemService.saveFile(fileSystem.currentFileId!, content);
            if (result.success) {
              // Update the file system state with the saved content
              setFileSystem(prev => ({
                ...prev,
                items: {
                  ...prev.items,
                  [prev.currentFileId!]: {
                    ...prev.items[prev.currentFileId!],
                    content: result.content,
                  },
                },
              }));

              setSaveStatus('saved');
              setTimeout(() => setSaveStatus(null), 2000);
            } else {
              setSaveStatus('error');
            }
          } catch (error) {
            console.error('Auto-save error:', error);
            setSaveStatus('error');
          }
        }, 1000); // Auto-save after 1 second of no changes
      }
    };

    if (editor.current) {
      editor.current.onDidChangeModelContent(() => {
        handleContentChange();
      });
    }

    return () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
    };
  }, [fileSystem.currentFileId]);

  const handleProjectSelected = () => {
    // Refresh the file tree or handle any other necessary updates
    // This will depend on your existing code structure
  };

  // Add a function to update file system items
  const handleFolderContentsLoaded = (newItems: Record<string, FileSystemItem>) => {
    setFileSystem(prev => {
      // Don't update file system if it would affect currently open files
      const currentlyOpenFile = prev.currentFileId ? prev.items[prev.currentFileId] : null;
      
      // Get the root item from the new items if it exists
      const rootItem = Object.values(newItems).find(item => item.parentId === null);
      
      // Make sure we're preserving all existing open files without modifications
      const updatedItems = { ...prev.items };
      
      // Only add new items that don't replace existing items with the same ID
      Object.entries(newItems).forEach(([id, item]) => {
        if (!updatedItems[id]) {
          updatedItems[id] = item;
        }
      });
      
      // Always ensure the 'welcome' file is preserved
      if (!updatedItems['welcome'] && prev.items['welcome']) {
        updatedItems['welcome'] = prev.items['welcome'];
      }
      
      // Make sure currentFileId is pointing to an existing file
      let currentFileId = prev.currentFileId;
      if (currentFileId && !updatedItems[currentFileId]) {
        // If current file no longer exists, default to welcome file
        currentFileId = 'welcome';
      }
      
      return {
        ...prev,
        items: updatedItems,
        currentFileId,
        // Update root item name if we found one
        rootId: prev.rootId
      };
    });
  };

  const handleDeleteItem = async (item: FileSystemItem) => {
    const success = await FileSystemService.deleteItem(item.path);
    if (success) {
      // If the deleted item was a file and it was open, close its tab
      if (item.type === 'file' && openFiles.includes(item.id)) {
        handleTabClose(item.id);
      }

      // Remove the item and its children from the file system
      const newItems = { ...fileSystem.items };
      const itemsToDelete = new Set<string>();

      // Helper function to collect all child items
      const collectChildren = (parentId: string) => {
        Object.entries(newItems).forEach(([id, item]) => {
          if (item.parentId === parentId) {
            itemsToDelete.add(id);
            if (item.type === 'directory') {
              collectChildren(id);
            }
          }
        });
      };

      // Add the item itself and collect all its children if it's a directory
      itemsToDelete.add(item.id);
      if (item.type === 'directory') {
        collectChildren(item.id);
      }

      // Remove all collected items
      itemsToDelete.forEach(id => {
        delete newItems[id];
      });

      setFileSystem(prev => ({
        ...prev,
        items: newItems,
      }));
    }
  };

  const handleRenameItem = async (item: FileSystemItem, newName: string) => {
    try {
      const result = await FileSystemService.renameItem(item.path, newName);
      if (result.success && result.newPath) {
        // Update the item in the file system state
        setFileSystem(prev => {
          const updatedItems = { ...prev.items };
          updatedItems[item.id] = {
            ...item,
            name: newName,
            path: result.newPath as string, // Use type assertion to fix TypeScript error
          };
          return {
            ...prev,
            items: updatedItems,
          };
        });
      }
    } catch (error) {
      console.error('Error renaming item:', error);
    }
  };

  // Move reloadFileContent before the useEffect
  const reloadFileContent = async (fileId: string) => {
    try {
      const file = fileSystem.items[fileId];
      if (!file || file.type !== 'file') return;

      // Re-fetch the file content
      const content = await FileSystemService.readFile(fileId);
      if (content !== null) {
        // Update file system state
        setFileSystem(prev => ({
          ...prev,
          items: {
            ...prev.items,
            [fileId]: {
              ...prev.items[fileId],
              content: content,
            },
          },
        }));

        // Update editor content if this is the current file
        if (fileId === fileSystem.currentFileId && editor.current) {
          editor.current.setValue(content);
        }
      }
    } catch (err) {
      console.error('Failed to reload file content:', err);
    }
  };

  // Combine both useEffects into one
  useEffect(() => {
    // Expose the current file information and file system globally
    window.getCurrentFile = () => {
      if (fileSystem.currentFileId) {
        const currentFile = fileSystem.items[fileSystem.currentFileId];
        return currentFile ? { path: currentFile.path } : null;
      }
      return null;
    };
    
    // Expose the file system
    window.fileSystem = {
      items: fileSystem.items
    };

    // Expose reloadFileContent
    window.reloadFileContent = reloadFileContent;

    // Expose applyCustomTheme
    window.applyCustomTheme = applyCustomTheme;

    // Expose loadSettings
    window.loadSettings = loadSettings;

    return () => {
      window.fileSystem = undefined;
      window.getCurrentFile = undefined;
      window.reloadFileContent = undefined;
      window.applyCustomTheme = undefined;
      window.loadSettings = undefined;
    };
  }, [fileSystem, reloadFileContent, applyCustomTheme, loadSettings]);

  // Add to the App component state declarations
  const [currentChatId, setCurrentChatId] = useState<string>(uuidv4());

  useEffect(() => {
    let mounted = true;
    
    const initializeApp = async () => {
      try {
        // Set connecting state
        setIsConnecting(true);
        setConnectionMessage('');
        
        // Only try to open directory if we're mounted
        if (!mounted) return;

        // Try to open directory only if we have a saved path
        const lastDir = localStorage.getItem('lastDirectory');
        if (lastDir) {
          setConnectionMessage('');
          const result = await FileSystemService.openSpecificDirectory(lastDir);
          if (result) {
            setFileSystem(prevState => ({
              ...prevState,
              items: result.items,
              rootId: result.rootId,
              currentFileId: null, // Don't open the welcome tab
              terminalOpen: false,
            }));
          }
          // Don't set welcome tab even if directory open fails
        }
        // Don't set welcome tab when no saved directory exists
        
        // Connection is established
        setTimeout(() => {
          setIsConnecting(false);
        }, 1000); // Small delay to ensure UI is ready
      } catch (error) {
        console.error('Error initializing app:', error);
        setLoadingError('Failed to initialize app');
        setConnectionMessage('Failed to initialize application. Please try again.');
        setTimeout(() => {
          setIsConnecting(false);
        }, 3000);
      }
    };

    initializeApp();

    // Cleanup function to prevent state updates after unmount
    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array

  // Add a function to handle terminal toggle
  const toggleTerminal = () => {
    setFileSystem(prev => ({
      ...prev,
      terminalOpen: !prev.terminalOpen
    }));
  };

  // Update Discord RPC when editor state changes
  useEffect(() => {
    if (!editor.current || !discordRpcSettings.enabled) return;
    
    const updateDiscordRPC = () => {
      if (!window.electron || !window.electron.discord) return;
      
      const position = editor.current?.getPosition();
      const model = editor.current?.getModel();
      const fileName = getCurrentFileName();
      const workspaceName = fileSystem.items[fileSystem.rootId]?.name || 'Pointer';
      const languageId = model?.getLanguageId() || 'plaintext';
      const content = model?.getValue() || '';
      const fileSize = `${Math.round(content.length / 1024)} KB`;
      
      window.electron.discord.updateEditorInfo({
        file: fileName || 'Untitled',
        workspace: workspaceName,
        line: position?.lineNumber || 1,
        column: position?.column || 1,
        languageId,
        fileSize,
      });
    };
    
    // Update initially
    updateDiscordRPC();
    
    // Set up event listeners for cursor position changes
    const disposable = editor.current.onDidChangeCursorPosition(() => {
      updateDiscordRPC();
    });
    
    // Set up event listener for model changes (file changes)
    const modelDisposable = editor.current.onDidChangeModel(() => {
      updateDiscordRPC();
    });
    
    return () => {
      disposable.dispose();
      modelDisposable.dispose();
    };
  }, [editor.current, discordRpcSettings.enabled, fileSystem.currentFileId]);
  
  // Update Discord settings in main process when they change
  useEffect(() => {
    if (!window.electron || !window.electron.discord) return;
    window.electron.discord.updateSettings(discordRpcSettings);
  }, [discordRpcSettings]);

  // Ensure theme is applied whenever file system state changes
  useEffect(() => {
    if (fileSystem.currentFileId && editor.current) {
      setTimeout(() => {
        applyCustomTheme();
      }, 50);
    }
  }, [fileSystem.currentFileId]);

  return (
    <>
      {/* Show loading screen while connecting */}
      {isConnecting && <LoadingScreen message={connectionMessage} />}
      
      {/* Main app content */}
      <div className="app-container">
        <div style={{ 
          height: '100vh', 
          display: 'flex', 
          flexDirection: 'column',
          background: 'var(--bg-primary)',
        }}>
          <div style={isTopBarCollapsed ? topBarCollapsedStyle : topBarStyle}>
            <button
              onClick={handleOpenFolder}
              style={topBarButtonStyle}
            >
              Open Folder
            </button>
            <button
              onClick={handleOpenFile}
              style={topBarButtonStyle}
            >
              Open File
            </button>
            <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 4px' }} />
            <div style={{ position: 'relative' }}>
              
              
              {isChatListVisible && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    minWidth: '200px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      padding: '8px',
                      borderBottom: '1px solid var(--border-primary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Recent Chats</span>
                    <button
                      onClick={() => {
                        setCurrentChatId(uuidv4());
                        setIsChatListVisible(false);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '4px 8px',
                      }}
                    >
                      New Chat
                    </button>
                  </div>
                  {chats.map(chat => (
                    <button
                      key={chat.id}
                      onClick={() => {
                        setCurrentChatId(chat.id);
                        setIsChatListVisible(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'none',
                        border: 'none',
                        borderBottom: '1px solid var(--border-primary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '12px',
                        ':hover': {
                          background: 'var(--bg-hover)',
                        },
                      }}
                    >
                      <div style={{ fontSize: '13px' }}>{chat.name}</div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: 'var(--text-secondary)',
                        marginTop: '2px' 
                      }}>
                        {new Date(chat.createdAt).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
            {/* Activity Bar */}
            <div style={{ width: '48px', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
              <button
                style={{
                  ...activityBarButtonStyle,
                  opacity: !isSidebarCollapsed ? 1 : 0.7,
                }}
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                title="Toggle Sidebar"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M17.5 3H6.5C5.67157 3 5 3.67157 5 4.5V19.5C5 20.3284 5.67157 21 6.5 21H17.5C18.3284 21 19 20.3284 19 19.5V4.5C19 3.67157 18.3284 3 17.5 3Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path d="M9 3V21" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
              <button
                style={{
                  ...activityBarButtonStyle,
                  opacity: isLLMChatVisible ? 1 : 0.7,
                }}
                onClick={() => setIsLLMChatVisible(!isLLMChatVisible)}
                title="Toggle LLM Chat"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12 20H4L8 16"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              
              {/* Settings button at the bottom */}
              <div style={{ flexGrow: 1 }}></div>
              <button
                style={{
                  ...activityBarButtonStyle,
                  opacity: isSettingsModalOpen ? 1 : 0.7,
                }}
                onClick={() => {
                  setIsSettingsModalOpen(true);
                  loadSettings(); // Load settings when opening the modal
                }}
                title="Open Settings"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48572 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {/* Sidebar */}
            <div style={{ display: 'flex' }}>
              {!isSidebarCollapsed && (
                <Resizable
                  defaultWidth={300}
                  minWidth={170}
                  maxWidth={850}
                  isCollapsed={isSidebarCollapsed}
                  onCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  shortcutKey="sidebar"
                >
                  {isLoading ? (
                    <div style={{
                      padding: '16px',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div>Loading folder contents...</div>
                      {loadingError && (
                        <div style={{ color: 'var(--error-color)' }}>
                          {loadingError}
                        </div>
                      )}
                    </div>
                  ) : (
                    <FileExplorer
                      items={fileSystem.items}
                      rootId={fileSystem.rootId}
                      currentFileId={fileSystem.currentFileId}
                      onFileSelect={handleFileSelect}
                      onCreateFile={createFile}
                      onCreateFolder={createFolder}
                      onFolderContentsLoaded={handleFolderContentsLoaded}
                      onDeleteItem={handleDeleteItem}
                      onRenameItem={handleRenameItem}
                    />
                  )}
                </Resizable>
              )}
            </div>

            {/* Main Editor Area */}
            <div 
              className="editor-area"
              style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column',
                marginRight: isLLMChatVisible ? `${width}px` : '0',
                transition: 'margin-right 0.2s ease-in-out'
              }}>
              <Tabs
                openFiles={openFiles}
                currentFileId={fileSystem.currentFileId}
                items={fileSystem.items}
                onTabSelect={handleTabSelect}
                onTabClose={handleTabClose}
                onToggleGrid={() => setIsGridLayout(!isGridLayout)}
                isGridLayout={isGridLayout}
                onToggleTerminal={toggleTerminal}
                terminalOpen={fileSystem.terminalOpen}
              />
              <EditorGrid
                openFiles={openFiles}
                currentFileId={fileSystem.currentFileId}
                items={fileSystem.items}
                onEditorChange={(newEditor) => {
                  editor.current = newEditor;
                  // Set up a resize observer for the editor container
                  if (editorRef.current) {
                    const resizeObserver = new ResizeObserver((entries) => {
                      const entry = entries[0];
                      if (entry && editor.current) {
                        // Use requestAnimationFrame to ensure smooth updates
                        requestAnimationFrame(() => {
                          try {
                            editor.current?.layout({
                              width: entry.contentRect.width,
                              height: entry.contentRect.height
                            });
                          } catch (error) {
                            console.error('Error updating editor layout:', error);
                          }
                        });
                      }
                    });
                    resizeObserver.observe(editorRef.current);
                  }
                }}
                onTabClose={handleTabClose}
                isGridLayout={isGridLayout}
                onToggleGrid={() => setIsGridLayout(prev => !prev)}
              />
            </div>

            {/* LLMChat */}
            {isLLMChatVisible && (
              <LLMChat
                isVisible={isLLMChatVisible}
                onClose={() => setIsLLMChatVisible(false)}
                onResize={(newWidth) => {
                  setWidth(newWidth);
                  // Force editor layout update with proper timing
                  if (editor.current) {
                    // Use a small delay to ensure the DOM has updated
                    setTimeout(() => {
                      requestAnimationFrame(() => {
                        try {
                          editor.current?.layout();
                          // Dispatch a resize event after the layout update
                          window.dispatchEvent(new Event('resize'));
                        } catch (error) {
                          console.error('Error updating editor layout:', error);
                        }
                      });
                    }, 0);
                  }
                }}
                currentChatId={currentChatId}
                onSelectChat={setCurrentChatId}
              />
            )}
          </div>

          {/* Status Bar */}
          <div style={{
            height: '22px',
            background: 'var(--statusbar-bg)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            gap: '16px',
          }}>
            {/* File name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>{getCurrentFileName()}</span>
            </div>

            {/* Syntax - Only show if we have a valid file */}
            {fileSystem.currentFileId && 
             fileSystem.items[fileSystem.currentFileId] && 
             fileSystem.items[fileSystem.currentFileId].type === 'file' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>
                  {getLanguageFromFileName(fileSystem.items[fileSystem.currentFileId].name)}
                </span>
              </div>
            )}

            {/* Line and Column */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
            </div>

            {/* Encoding and Line Ending */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>UTF-8</span>
              <span>LF</span>
            </div>

            {/* Indentation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>Spaces: 2</span>
            </div>

            {/* Save status */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {saveStatus === 'saving' && (
                <span>Saving...</span>
              )}
              {saveStatus === 'saved' && (
                <span>Saved</span>
              )}
              {saveStatus === 'error' && (
                <span style={{ color: 'var(--error-color)' }}>Error saving file</span>
              )}
            </div>
          </div>

          {modalState.isOpen && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}>
              <div style={{
                background: 'var(--bg-primary)',
                padding: '20px',
                borderRadius: '4px',
                minWidth: '300px',
              }}>
                <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
                  Create New {modalState.type === 'file' ? 'File' : 'Folder'}
                </h3>
                <input
                  type="text"
                  value={modalState.name}
                  onChange={(e) => setModalState(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={`Enter ${modalState.type} name`}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginBottom: '16px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setModalState({ isOpen: false, type: null, parentId: null, name: '' })}
                    style={{
                      padding: '6px 12px',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleModalSubmit}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--accent-color)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Terminal */}
          {fileSystem.terminalOpen && (
            <Terminal isVisible={fileSystem.terminalOpen} />
          )}

          <DiffViewer />

          {/* Toast notifications */}
          <ToastContainer />

          {/* Settings Modal */}
          <Settings 
            isVisible={isSettingsModalOpen} 
            onClose={() => setIsSettingsModalOpen(false)} 
            initialSettings={{
              discordRpc: discordRpcSettings,
              onDiscordSettingsChange: (settings) => {
                setDiscordRpcSettings(prev => ({
                  ...prev,
                  ...settings
                }));
              }
            }}
          />
        </div>
      </div>
    </>
  );
};

const activityBarButtonStyle = {
  width: '48px',
  height: '48px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--activity-bar-fg)',
  cursor: 'pointer',
  opacity: 0.7,
  transition: 'opacity 0.1s ease',
  ':hover': {
    opacity: 1,
  }
};

const titleBarButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '12px',
  ':hover': {
    background: 'var(--bg-hover)',
  },
  // @ts-ignore
  WebkitAppRegion: 'no-drag',
};

// Add this near the other button styles
const chatSwitcherButtonStyle = {
  ...activityBarButtonStyle,
  position: 'relative' as const,
};

export default App; 