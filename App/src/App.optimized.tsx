import React, { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import * as monaco from 'monaco-editor';
import FileExplorer from './components/FileExplorer';
import Tabs from './components/Tabs';
import Resizable from './components/Resizable';
import { FileSystemItem, FileSystemState, TabInfo } from './types';
import { FileSystemService } from './services/FileSystemService';
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
import Titlebar from './components/Titlebar';
import GitView from './components/Git/GitView';
import { GitService } from './services/gitService';
import CloneRepositoryModal from './components/CloneRepositoryModal';
import { PathConfig } from './config/paths';
import { isPreviewableFile, getPreviewType } from './utils/previewUtils';
import PreviewPane from './components/PreviewPane';
import { useThrottle, useDebounce, useStableCallback, usePerformanceMonitor } from './hooks/usePerformanceOptimizations';

// Initialize language support
initializeLanguageSupport();

// Simple debounce implementation
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: number | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait) as any;
  };
};

// Memoized style objects to prevent re-creation
const styles = {
  topBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '2px 4px',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--titlebar-bg)',
    gap: '4px',
    height: '28px',
    transition: 'height 0.2s ease',
    overflow: 'hidden',
  } as const,
  
  topBarCollapsed: {
    display: 'flex',
    alignItems: 'center',
    padding: '0px 4px',
    borderBottom: 'none',
    background: 'var(--titlebar-bg)',
    gap: '4px',
    height: '0px',
    transition: 'height 0.2s ease',
    overflow: 'hidden',
  } as const,
  
  appContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  } as const,
  
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  } as const,
  
  statusBar: {
    height: '22px',
    background: 'var(--statusbar-bg)',
    borderTop: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    gap: '16px',
  } as const,
};

// Memoized Status Bar Component
const StatusBar = memo(({ 
  currentFileName, 
  cursorPosition, 
  saveStatus 
}: {
  currentFileName: string;
  cursorPosition: { line: number; column: number };
  saveStatus: 'saved' | 'saving' | 'error' | null;
}) => (
  <div style={styles.statusBar}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>{currentFileName}</span>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>{getLanguageFromFileName(currentFileName)}</span>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>UTF-8</span>
      <span>LF</span>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>Spaces: 2</span>
    </div>
    
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {saveStatus === 'saving' && <span>Saving...</span>}
      {saveStatus === 'saved' && <span>Saved</span>}
      {saveStatus === 'error' && (
        <span style={{ color: 'var(--error-color)' }}>Error saving file</span>
      )}
    </div>
  </div>
));

StatusBar.displayName = 'StatusBar';

// Memoized Editor Area Component
const EditorArea = memo(({ 
  openFiles,
  currentFileId,
  items,
  isGridLayout,
  previewTabs,
  currentPreviewTabId,
  isLLMChatVisible,
  width,
  onTabSelect,
  onTabClose,
  onToggleGrid,
  onPreviewToggle,
  onPreviewTabSelect,
  onPreviewTabClose,
  onEditorChange,
  setSaveStatus 
}: {
  openFiles: string[];
  currentFileId: string | null;
  items: Record<string, FileSystemItem>;
  isGridLayout: boolean;
  previewTabs: TabInfo[];
  currentPreviewTabId: string | null;
  isLLMChatVisible: boolean;
  width: number;
  onTabSelect: (tabId: string) => Promise<void>;
  onTabClose: (tabId: string) => Promise<void>;
  onToggleGrid: () => void;
  onPreviewToggle: (fileId: string) => void;
  onPreviewTabSelect: (tabId: string) => void;
  onPreviewTabClose: (tabId: string) => void;
  onEditorChange: (editor: any) => void;
  setSaveStatus: (status: 'saved' | 'saving' | 'error' | null) => void;
}) => (
  <div 
    className="editor-area"
    style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column',
      marginRight: isLLMChatVisible ? `${width}px` : '0',
      transition: 'margin-right 0.2s ease-in-out'
    }}
  >
    <Tabs
      openFiles={openFiles}
      currentFileId={currentFileId}
      items={items}
      onTabSelect={onTabSelect}
      onTabClose={onTabClose}
      onToggleGrid={onToggleGrid}
      isGridLayout={isGridLayout}
      previewTabs={previewTabs}
      onPreviewToggle={onPreviewToggle}
      onPreviewTabSelect={onPreviewTabSelect}
      onPreviewTabClose={onPreviewTabClose}
      currentPreviewTabId={currentPreviewTabId}
    />
    <EditorGrid
      openFiles={openFiles}
      currentFileId={currentFileId}
      items={items}
      onEditorChange={onEditorChange}
      onTabClose={onTabClose}
      isGridLayout={isGridLayout}
      onToggleGrid={onToggleGrid}
      setSaveStatus={setSaveStatus}
      previewTabs={previewTabs}
      currentPreviewTabId={currentPreviewTabId}
    />
  </div>
));

EditorArea.displayName = 'EditorArea';

interface IEditor extends monaco.editor.IStandaloneCodeEditor {}

declare global {
  interface Window {
    getCurrentFile: () => { path: string; } | null;
    editor?: monaco.editor.IStandaloneCodeEditor;
    reloadFileContent?: (fileId: string) => Promise<void>;
    fileSystem?: Record<string, FileSystemItem>;
    applyCustomTheme?: () => void;
    loadSettings?: () => Promise<void>;
    loadAllSettings?: () => Promise<void>;
    cursorUpdateTimeout?: number;
    appSettings?: {
      theme?: {
        customColors?: {
          customFileExtensions?: Record<string, string>;
        };
      };
    };
    editorSettings?: {
      autoAcceptGhostText: boolean;
    };
  }
}

const App: React.FC = () => {
  const { startRender, endRender } = usePerformanceMonitor('App');
  
  // Start performance monitoring
  useEffect(() => {
    startRender();
    return () => endRender();
  });

  // Refs
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

  // Core state
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

  // UI state
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [isGridLayout, setIsGridLayout] = useState(false);
  const [isLLMChatVisible, setIsLLMChatVisible] = useState(true);
  const [width, setWidth] = useState(() => {
    const savedWidth = localStorage.getItem('chatWidth');
    if (savedWidth) {
      const parsedWidth = parseInt(savedWidth, 10);
      if (parsedWidth >= 250 && parsedWidth <= 1200) {
        return parsedWidth;
      }
    }
    return 700;
  });

  // Modal and view states
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

  const [previewTabs, setPreviewTabs] = useState<TabInfo[]>([]);
  const [currentPreviewTabId, setCurrentPreviewTabId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>(() => {
    const saved = localStorage.getItem('currentChatId');
    return saved || 'default';
  });

  // Settings states
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsData, setSettingsData] = useState<any>({});
  const [discordRpcSettings, setDiscordRpcSettings] = useState<any>({});
  const [dynamicTitleFormat, setDynamicTitleFormat] = useState<string | undefined>();

  // View states
  const [isGitViewActive, setIsGitViewActive] = useState(false);
  const [isExplorerViewActive, setIsExplorerViewActive] = useState(true);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);

  // Optimized handlers using performance hooks
  const updateCursorPositionOnServer = useDebounce(
    useCallback(async (filePath: string, line: number, column: number) => {
      try {
        if (filePath) {
          const response = await fetch('http://localhost:23816/ide-state/update-cursor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_path: filePath, line, column })
          });
          
          if (!response.ok) {
            console.warn('Failed to update cursor position on server');
          }
        }
      } catch (error) {
        console.error('Error updating cursor position:', error);
      }
    }, []),
    500
  );

  // Memoized computed values
  const currentFileName = useMemo(() => {
    if (!fileSystem.currentFileId || !fileSystem.items[fileSystem.currentFileId]) {
      return '';
    }
    return fileSystem.items[fileSystem.currentFileId].name;
  }, [fileSystem.currentFileId, fileSystem.items]);

  // Stable callbacks to prevent re-renders
  const handleFileSelect = useStableCallback(async (fileId: string) => {
    // Implementation will be moved from original App.tsx
    console.log('File selected:', fileId);
  });

  const handleTabSelect = useStableCallback(async (tabId: string) => {
    // Implementation will be moved from original App.tsx
    console.log('Tab selected:', tabId);
  });

  const handleTabClose = useStableCallback(async (tabId: string) => {
    // Implementation will be moved from original App.tsx
    console.log('Tab closed:', tabId);
  });

  const handleOpenFolder = useStableCallback(async () => {
    // Implementation will be moved from original App.tsx
    console.log('Open folder requested');
  });

  const handleOpenFile = useStableCallback(async () => {
    // Implementation will be moved from original App.tsx
    console.log('Open file requested');
  });

  const handleCloneRepository = useStableCallback(async () => {
    setIsCloneModalOpen(true);
  });

  const toggleTerminal = useStableCallback(() => {
    setFileSystem(prev => ({ ...prev, terminalOpen: !prev.terminalOpen }));
  });

  const handleToggleGitView = useStableCallback(() => {
    setIsGitViewActive(!isGitViewActive);
    setIsExplorerViewActive(false);
  });

  const handleToggleExplorerView = useStableCallback(() => {
    setIsExplorerViewActive(!isExplorerViewActive);
    setIsGitViewActive(false);
  });

  const handleToggleGrid = useStableCallback(() => {
    setIsGridLayout(!isGridLayout);
  });

  const handlePreviewToggle = useStableCallback((fileId: string) => {
    // Implementation for preview toggle
    console.log('Preview toggle:', fileId);
  });

  const handlePreviewTabSelect = useStableCallback((tabId: string) => {
    setCurrentPreviewTabId(tabId);
  });

  const handlePreviewTabClose = useStableCallback((tabId: string) => {
    const remainingPreviewTabs = previewTabs.filter(tab => tab.id !== tabId);
    setPreviewTabs(remainingPreviewTabs);
    
    if (remainingPreviewTabs.length > 0) {
      setCurrentPreviewTabId(remainingPreviewTabs[remainingPreviewTabs.length - 1].id);
    } else {
      setCurrentPreviewTabId(null);
      if (openFiles.length > 0) {
        const lastFileId = openFiles[openFiles.length - 1];
        setFileSystem(prev => ({ ...prev, currentFileId: lastFileId }));
      }
    }
  });

  const handleEditorChange = useStableCallback((newEditor: any) => {
    editor.current = newEditor;
    if (editorRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && editor.current) {
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
  });

  const handleChatResize = useStableCallback((newWidth: number) => {
    setWidth(newWidth);
    if (editor.current) {
      setTimeout(() => {
        requestAnimationFrame(() => {
          try {
            editor.current?.layout();
            window.dispatchEvent(new Event('resize'));
          } catch (error) {
            console.error('Error updating editor layout:', error);
          }
        });
      }, 0);
    }
  });

  // Initialization effect
  useEffect(() => {
    const initializeApp = async () => {
      setIsConnecting(true);
      setConnectionMessage('Connecting to backend...');
      
      try {
        // Check backend connection
        const response = await fetch('http://localhost:23816/health');
        if (response.ok) {
          setIsConnecting(false);
        }
      } catch (error) {
        console.error('Failed to connect to backend:', error);
        setConnectionMessage('Failed to connect to backend. Please ensure the server is running.');
      }
    };

    initializeApp();
  }, []);

  return (
    <div className="app-container">
      {isConnecting && (
        <LoadingScreen message={connectionMessage} />
      )}
      
      <div style={styles.appContainer}>
        <Titlebar
          onOpenFolder={handleOpenFolder} 
          onOpenFile={handleOpenFile} 
          onCloneRepository={handleCloneRepository}
          onToggleGitView={handleToggleGitView}
          onToggleExplorerView={handleToggleExplorerView}
          onToggleLLMChat={() => setIsLLMChatVisible(!isLLMChatVisible)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onToggleTerminal={toggleTerminal}
          isGitViewActive={isGitViewActive}
          isExplorerViewActive={isExplorerViewActive}
          isLLMChatVisible={isLLMChatVisible}
          terminalOpen={fileSystem.terminalOpen}
          currentFileName={currentFileName}
          workspaceName={fileSystem.items[fileSystem.rootId]?.name || ''}
          titleFormat={dynamicTitleFormat || settingsData.advanced?.titleFormat || '{filename} - {workspace} - Pointer'}
        />
        
        <div style={styles.mainContent}>
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
                  isGitViewActive ? (
                    <GitView onBack={handleToggleExplorerView} />
                  ) : isExplorerViewActive ? (
                    <FileExplorer
                      items={fileSystem.items}
                      rootId={fileSystem.rootId}
                      currentFileId={fileSystem.currentFileId}
                      onFileSelect={handleFileSelect}
                      onCreateFile={() => {}} // TODO: implement
                      onCreateFolder={() => {}} // TODO: implement
                      onFolderContentsLoaded={() => {}} // TODO: implement
                      onDeleteItem={() => {}} // TODO: implement
                      onRenameItem={() => {}} // TODO: implement
                    />
                  ) : (
                    <div style={{ padding: '16px', color: 'var(--text-primary)' }}>
                      Select a view from the titlebar
                    </div>
                  )
                )}
              </Resizable>
            )}
          </div>

          <EditorArea
            openFiles={openFiles}
            currentFileId={fileSystem.currentFileId}
            items={fileSystem.items}
            isGridLayout={isGridLayout}
            previewTabs={previewTabs}
            currentPreviewTabId={currentPreviewTabId}
            isLLMChatVisible={isLLMChatVisible}
            width={width}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
            onToggleGrid={handleToggleGrid}
            onPreviewToggle={handlePreviewToggle}
            onPreviewTabSelect={handlePreviewTabSelect}
            onPreviewTabClose={handlePreviewTabClose}
            onEditorChange={handleEditorChange}
            setSaveStatus={setSaveStatus}
          />

          {isLLMChatVisible && (
            <LLMChat
              isVisible={isLLMChatVisible}
              onClose={() => setIsLLMChatVisible(false)}
              onResize={handleChatResize}
              currentChatId={currentChatId}
              onSelectChat={setCurrentChatId}
            />
          )}
        </div>

        <StatusBar
          currentFileName={currentFileName}
          cursorPosition={cursorPosition}
          saveStatus={saveStatus}
        />

        {fileSystem.terminalOpen && (
          <Terminal isVisible={fileSystem.terminalOpen} />
        )}

        <DiffViewer />
        <ToastContainer />

        <Settings 
          isVisible={isSettingsModalOpen} 
          onClose={() => {
            setIsSettingsModalOpen(false);
            setDynamicTitleFormat(undefined);
          }}
          initialSettings={{
            discordRpc: discordRpcSettings,
            onDiscordSettingsChange: (settings) => {
              setDiscordRpcSettings(prev => ({...prev, ...settings}));
            }
          }}
        />

        <CloneRepositoryModal
          isOpen={isCloneModalOpen}
          onClose={() => setIsCloneModalOpen(false)}
          onClone={async (url, directory) => {
            setIsLoading(true);
            setLoadingError(null);
            
            try {
              const cloneResult = await GitService.cloneRepository(url, directory);
              
              if (!cloneResult.success) {
                throw new Error(cloneResult.error || 'Failed to clone repository');
              }
              
              await handleOpenFolder();
            } catch (error: any) {
              console.error('Error cloning repository:', error);
              setLoadingError(`Error cloning repository: ${error.message}`);
              throw error;
            } finally {
              setIsLoading(false);
            }
          }}
        />
      </div>
    </div>
  );
};

export default memo(App); 