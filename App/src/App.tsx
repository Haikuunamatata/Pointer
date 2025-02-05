import React, { useEffect, useRef, useState, useCallback } from 'react';
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
    getCurrentFile: () => { path: string } | null;
    editor?: monaco.editor.IStandaloneCodeEditor;
    reloadFileContent?: (fileId: string) => Promise<void>;
    fileSystem?: Record<string, FileSystemItem>;
  }
}

const App: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editor = useRef<IEditor | null>(null);
  const [fileSystem, setFileSystem] = useState<FileSystemState>(() => {
    const rootId = 'root';
    const welcomeFileId = 'welcome';
    return {
      items: {
        [rootId]: {
          id: rootId,
          name: 'workspace',
          type: 'directory',
          parentId: null,
          path: '',
        },
        [welcomeFileId]: {
          id: welcomeFileId,
          name: 'notes.js',
          type: 'file',
          content: "// Welcome to your new code editor!\n// Start typing here...\n\n// By the way you can't delete or save this file. (future updates (maybe (if i have motivation)))",
          parentId: rootId,
          path: 'notes.js',
        },
      },
      currentFileId: welcomeFileId,
      rootId,
      terminalOpen: false,
    };
  });

  const [openFiles, setOpenFiles] = useState<string[]>([fileSystem.currentFileId!]);
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

  // Add this inside the App component
  const loadChats = async () => {
    const loadedChats = await ChatService.listChats();
    setChats(loadedChats);
  };

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
        theme: 'vs-dark',
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
        },
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
      monaco.editor.setTheme('vscode-dark');

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
          }
        }
      } catch (error) {
        console.error('Error loading file content:', error);
      }
    }
  };

  const handleTabSelect = async (tabId: string) => {
    console.log('handleTabSelect called with:', tabId);
    try {
      // Don't try to load content for welcome screen
      if (tabId === 'welcome') {
        setFileSystem(prev => ({ ...prev, currentFileId: 'welcome' }));
        if (editor.current) {
          editor.current.setValue('');
        }
        return;
      }

      // First update the UI to show the selected tab
      setFileSystem(prev => ({ ...prev, currentFileId: tabId }));
      
      // Then load the file content
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

        // Update editor content
        if (editor.current) {
          const model = editor.current.getModel();
          if (model) {
            model.setValue(content);
          } else {
            editor.current.setValue(content);
          }
        } else {
          console.warn('Editor ref is null');
        }
      }
    } catch (error) {
      console.error('Error in handleTabSelect:', error);
    }
  };

  const handleTabClose = (tabId: string) => {
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
          if (editor.current) {
            editor.current.setValue('');
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
      // Get the root item from the new items if it exists
      const rootItem = Object.values(newItems).find(item => item.parentId === null);
      
      return {
        ...prev,
        items: {
          ...prev.items,
          ...newItems,
          // Update root item name if we found one
          [prev.rootId]: rootItem ? {
            ...prev.items[prev.rootId],
            name: rootItem.name
          } : prev.items[prev.rootId]
        }
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
            path: result.newPath,
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

    return () => {
      window.fileSystem = undefined;
      window.getCurrentFile = undefined;
      window.reloadFileContent = undefined;
    };
  }, [fileSystem, reloadFileContent]);

  // Add to the App component state declarations
  const [currentChatId, setCurrentChatId] = useState<string>(uuidv4());

  useEffect(() => {
    let mounted = true;  // Add mounted flag to prevent multiple calls

    const initializeApp = async () => {
      try {
        // Only try to open directory if we're mounted
        if (!mounted) return;

        // Try to open directory only if we have a saved path
        const lastDir = localStorage.getItem('lastDirectory');
        if (lastDir) {
          const result = await FileSystemService.openSpecificDirectory(lastDir);
          if (result) {
            setFileSystem({
              items: result.items,
              rootId: result.rootId,
              currentFileId: null,
            });
          } else {
            // If failed to open last directory, show welcome state
            setFileSystem(prev => ({
              ...prev,
              currentFileId: 'welcome',
            }));
          }
        } else {
          // No saved directory, show welcome state
          setFileSystem(prev => ({
            ...prev,
            currentFileId: 'welcome',
          }));
        }
      } catch (error) {
        console.error('Error initializing app:', error);
        setLoadingError('Failed to initialize app');
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

  return (
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
                d="M4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20H4L8 16"
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
            onResize={(width) => {
              window.dispatchEvent(new Event('resize'));
              setWidth(width);
            }}
            currentChatId={currentChatId}
            onSelectChat={(chatId) => setCurrentChatId(chatId)}
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
    </div>
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