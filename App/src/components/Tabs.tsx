import React from 'react';
import { FileSystemItem } from '../types';
import { getIconForFile } from './FileIcons';

interface TabsProps {
  openFiles: string[];
  currentFileId: string | null;
  items: Record<string, FileSystemItem>;
  onTabSelect?: (fileId: string) => void;
  onTabClose?: (fileId: string) => void;
  onToggleGrid?: () => void;
  isGridLayout?: boolean;
  onToggleTerminal?: () => void;
  terminalOpen?: boolean;
}

const tabsContainerStyle = {
  display: 'flex',
  overflowX: 'auto' as const,
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border-color)',
  height: '35px',
  WebkitScrollbarHeight: '8px',
  WebkitScrollbarTrack: {
    background: 'var(--bg-secondary)',
  },
  WebkitScrollbarThumb: {
    background: 'var(--border-color)',
    borderRadius: '4px',
  },
} as const;

const Tabs: React.FC<TabsProps> = ({
  openFiles,
  currentFileId,
  items,
  onTabSelect,
  onTabClose,
  onToggleGrid,
  isGridLayout,
  onToggleTerminal,
  terminalOpen,
}) => {
  const handleTabClick = (fileId: string) => {
    console.log('Tab clicked:', fileId);
    if (onTabSelect && fileId !== currentFileId) {
      onTabSelect(fileId);
    }
  };

  const handleTabClose = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Tab close clicked:', fileId);
    if (onTabClose) {
      onTabClose(fileId);
    }
  };

  return (
    <div style={tabsContainerStyle}>
      {openFiles.map(fileId => {
        const file = items[fileId];
        if (!file) {
          console.log('Missing file for id:', fileId);
          return null;
        }

        const tabStyle = {
          padding: '0 12px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          borderRight: '1px solid var(--border-color)',
          background: currentFileId === fileId ? 'var(--bg-primary)' : 'transparent',
          color: 'var(--text-primary)',
          userSelect: 'none' as const,
          minWidth: 0,
          position: 'relative' as const,
          transition: 'background-color 0.1s ease',
        };

        const closeButtonStyle = {
          padding: '4px',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          opacity: 0.7,
          transition: 'opacity 0.1s ease, background-color 0.1s ease',
        };

        return (
          <div
            key={fileId}
            onClick={() => handleTabClick(fileId)}
            style={tabStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = currentFileId === fileId 
                ? 'var(--bg-primary)' 
                : 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = currentFileId === fileId 
                ? 'var(--bg-primary)' 
                : 'transparent';
            }}
          >
            {getIconForFile(file.name)}
            <span style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '150px',
              fontSize: '13px',
            }}>
              {file.name}
            </span>
            <button
              onClick={(e) => handleTabClose(e, fileId)}
              style={closeButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7';
                e.currentTarget.style.background = 'none';
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <div
        onClick={onToggleTerminal}
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          background: terminalOpen ? 'var(--bg-selected)' : 'transparent',
          borderRight: '1px solid var(--border-color)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M1 1h14v14H1z" strokeWidth="1.5" fill="none"/>
          <path d="M3 3l4 4-4 4M8 11h5" strokeWidth="1.5"/>
        </svg>
        <span>Terminal</span>
      </div>
      {onToggleGrid && (
        <button
          onClick={onToggleGrid}
          style={{
            padding: '4px 8px',
            background: 'transparent',
            border: 'none',
            color: isGridLayout ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '3px',
            marginLeft: '8px',
          }}
          title={isGridLayout ? 'Single Editor' : 'Grid Layout'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            {isGridLayout ? (
              <path d="M2 2h12v12H2z" strokeWidth="1.5" fill="none"/>
            ) : (
              <>
                <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" strokeWidth="1.5" fill="none"/>
              </>
            )}
          </svg>
        </button>
      )}
    </div>
  );
};

export default Tabs; 