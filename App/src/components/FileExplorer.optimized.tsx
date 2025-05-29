import React, { useState, useCallback, useEffect, memo, useMemo } from 'react';
import { FileSystemItem } from '../types';
import { FileSystemService } from '../services/FileSystemService';
import { getIconForFile, FolderIcon, ChevronIcon } from './FileIcons';
import { isDatabaseFile } from './FileViewer';
import { shallowEqual } from '../hooks/usePerformanceOptimizations';

declare global {
  interface Window {
    applyCustomTheme?: () => void;
    loadSettings?: () => Promise<void>;
    appSettings?: {
      theme?: {
        customColors?: {
          customFileExtensions?: Record<string, string>;
        };
      };
    };
  }
}

interface FileExplorerProps {
  items: Record<string, FileSystemItem>;
  rootId: string;
  currentFileId: string | null;
  onFileSelect: (fileId: string) => void;
  onCreateFile: (parentId: string) => void;
  onCreateFolder: (parentId: string) => void;
  onFolderContentsLoaded: (newItems: Record<string, FileSystemItem>) => void;
  onDeleteItem: (item: FileSystemItem) => void;
  onRenameItem: (item: FileSystemItem, newName: string) => void;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  targetItem: FileSystemItem | null;
}

// Memoized file explorer item component
const FileExplorerItem = memo<{
  item: FileSystemItem;
  items: Record<string, FileSystemItem>;
  level: number;
  currentFileId: string | null;
  onFileSelect: (fileId: string) => void;
  onCreateFile: (parentId: string) => void;
  onCreateFolder: (parentId: string) => void;
  onDeleteItem: (item: FileSystemItem) => void;
}>(({ item, items, level, currentFileId, onFileSelect, onCreateFile, onCreateFolder, onDeleteItem }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetItem: null,
  });

  // Memoize child IDs calculation
  const childIds = useMemo(() => 
    Object.values(items).filter(i => i.parentId === item.id).map(i => i.id),
    [items, item.id]
  );

  const handleFolderClick = useCallback(async () => {
    if (item.type === 'directory') {
      setIsExpanded(prev => !prev);
      if (!isExpanded) {
        await loadFolderContents(item.path);
      }
    }
  }, [item.type, item.path, isExpanded]);

  const handleFolderHover = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleFolderLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const loadFolderContents = useCallback(async (path: string) => {
    if (FileSystemService.isFolderLoaded(path)) return;

    setIsLoading(true);
    try {
      const result = await FileSystemService.fetchFolderContents(path);
      if (result) {
        // This would need to be handled by parent component
        console.log('Folder contents loaded:', result);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      targetItem: item,
    });
  }, [item]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({
      isOpen: false,
      x: 0,
      y: 0,
      targetItem: null,
    });
  }, []);

  const handleItemClick = useCallback(() => {
    if (item.type === 'file') {
      onFileSelect(item.id);
      // Ensure theme is applied after file selection
      setTimeout(() => window.applyCustomTheme?.(), 100);
    } else {
      handleFolderClick();
    }
  }, [item.type, item.id, onFileSelect, handleFolderClick]);

  // Memoize styles to prevent recreation on each render
  const itemStyle = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    height: '22px',
    cursor: 'pointer',
    backgroundColor: item.id === currentFileId ? 'var(--bg-selected)' : 
                   isHovered ? 'var(--bg-hover)' : 'transparent',
    color: 'var(--text-primary)',
    fontSize: '13px',
    paddingRight: '8px',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
  }), [item.id, currentFileId, isHovered]);

  const iconContainerStyle = useMemo(() => ({
    width: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: level === 0 ? '12px' : '4px',
    flexShrink: 0,
  }), [level]);

  useEffect(() => {
    if (contextMenu.isOpen) {
      const handleClickOutside = () => handleCloseContextMenu();
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.isOpen, handleCloseContextMenu]);

  return (
    <div style={{ marginLeft: level === 0 ? 0 : '8px' }}>
      <div
        style={itemStyle}
        onClick={handleItemClick}
        onMouseEnter={handleFolderHover}
        onMouseLeave={handleFolderLeave}
        onContextMenu={handleContextMenu}
      >
        <div style={iconContainerStyle}>
          {item.type === 'directory' && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                handleFolderClick();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.8,
              }}
            >
              <ChevronIcon isExpanded={isExpanded} />
            </span>
          )}
        </div>
        
        <div style={{ marginLeft: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {item.type === 'directory' ? (
            <FolderIcon isOpen={isExpanded} />
          ) : (
            getIconForFile(item.name)
          )}
          <span style={{ 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            color: item.type === 'file' ? getFileColor(item.name) : 'inherit'
          }}>
            {item.name}
          </span>
          {isLoading && (
            <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>
              ...
            </span>
          )}
        </div>
      </div>
      
      {/* Render children if expanded */}
      {item.type === 'directory' && isExpanded && (
        <div>
          {childIds.map(childId => (
            <FileExplorerItem
              key={childId}
              item={items[childId]}
              items={items}
              level={level + 1}
              currentFileId={currentFileId}
              onFileSelect={onFileSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onDeleteItem={onDeleteItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}, shallowEqual);

FileExplorerItem.displayName = 'FileExplorerItem';

// Utility functions (memoized outside component to prevent recreation)
const getAllChildIds = (items: Record<string, FileSystemItem>, parentId: string): string[] => {
  const result: string[] = [];
  const children = Object.values(items).filter(item => item.parentId === parentId);
  
  for (const child of children) {
    result.push(child.id);
    if (child.type === 'directory') {
      result.push(...getAllChildIds(items, child.id));
    }
  }
  
  return result;
};

const getFileColor = (filename: string): string => {
  try {
    const customColors = window.appSettings?.theme?.customColors?.customFileExtensions;
    if (customColors) {
      const extension = filename.split('.').pop()?.toLowerCase();
      if (extension && customColors[extension]) {
        return customColors[extension];
      }
    }
  } catch (error) {
    console.warn('Error getting file color:', error);
  }
  return 'var(--text-primary)';
};

// Main FileExplorer component with optimizations
const FileExplorer = memo<FileExplorerProps>(({
  items,
  rootId,
  currentFileId,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onFolderContentsLoaded,
  onDeleteItem,
  onRenameItem,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetItem: null,
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renameState, setRenameState] = useState<{
    itemId: string | null;
    newName: string;
  }>({
    itemId: null,
    newName: '',
  });

  // Memoize root children to prevent unnecessary recalculations
  const rootChildren = useMemo(() => 
    Object.values(items).filter(item => item.parentId === rootId),
    [items, rootId]
  );

  // Stable callback handlers
  const handleFolderClick = useCallback(async (folderId: string) => {
    const item = items[folderId];
    if (!item || item.type !== 'directory') return;

    setExpandedFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId);
      } else {
        newExpanded.add(folderId);
        // Load folder contents if not already loaded
        loadFolderContents(item.path, folderId);
      }
      return newExpanded;
    });
  }, [items]);

  const loadFolderContents = useCallback(async (path: string, folderId: string) => {
    if (FileSystemService.isFolderLoaded(path)) return;

    try {
      const result = await FileSystemService.fetchFolderContents(path);
      if (result) {
        const newItems = { ...items };
        Object.entries(result.items).forEach(([id, item]) => {
          if (id !== result.rootId) {
            newItems[id] = item;
          }
        });
        onFolderContentsLoaded(newItems);
      }
    } catch (error) {
      console.error('Error loading folder contents:', error);
    }
  }, [items, onFolderContentsLoaded]);

  const closeContextMenu = useCallback(() => {
    setContextMenu({
      isOpen: false,
      x: 0,
      y: 0,
      targetItem: null,
    });
  }, []);

  const handleRename = useCallback((item: FileSystemItem) => {
    setRenameState({
      itemId: item.id,
      newName: item.name,
    });
    closeContextMenu();
  }, [closeContextMenu]);

  // Effect for handling clicks outside context menu
  useEffect(() => {
    if (contextMenu.isOpen) {
      const handleClickOutside = () => closeContextMenu();
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.isOpen, closeContextMenu]);

  // Effect for theme changes
  useEffect(() => {
    const handleThemeChange = () => {
      // Force re-render when theme changes
      // This could be optimized further by using a theme context
    };

    window.addEventListener('theme-changed', handleThemeChange);
    return () => window.removeEventListener('theme-changed', handleThemeChange);
  }, []);

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-color)',
      fontSize: '13px',
    }}>
      <div style={{
        padding: '8px 0',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-primary)',
      }}>
        <div style={{
          padding: '0 12px',
          fontWeight: 'bold',
          color: 'var(--text-primary)',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          Explorer
        </div>
      </div>
      
      <div style={{ padding: '4px 0' }}>
        {rootChildren.map(item => (
          <FileExplorerItem
            key={item.id}
            item={item}
            items={items}
            level={0}
            currentFileId={currentFileId}
            onFileSelect={onFileSelect}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onDeleteItem={onDeleteItem}
          />
        ))}
      </div>
    </div>
  );
}, shallowEqual);

FileExplorer.displayName = 'FileExplorer';

export default FileExplorer; 