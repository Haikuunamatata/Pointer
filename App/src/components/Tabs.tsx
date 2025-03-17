import React, { useState } from 'react';
import { FileSystemItem } from '../types';
import { getIconForFile } from './FileIcons';
import ContextMenu from './ContextMenu';
import { AIFileService } from '../services/AIFileService';
import { ToastManager } from './Toast';
import { FileSystemService } from '../services/FileSystemService';

// Add new dialog component for displaying summaries
interface SummaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  summary: string;
}

const SummaryDialog: React.FC<SummaryDialogProps> = ({ isOpen, onClose, fileName, summary }) => {
  console.log("SummaryDialog rendering with:", { isOpen, fileName, summaryLength: summary?.length });
  
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)', // Darker background for more contrast
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999, // Very high z-index to ensure it's on top of everything
        backdropFilter: 'blur(3px)', // Add blur effect to background
      }}
      onClick={(e) => {
        // Close when clicking the backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        style={{
          background: 'var(--bg-primary)',
          borderRadius: '8px', // Slightly larger radius
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)', // More pronounced shadow
          width: '600px', // Larger width
          maxWidth: '90%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--accent-color)', // Highlighted border
        }}
      >
        <div 
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-secondary)',
          }}
        >
          <h3 style={{ 
            margin: 0, 
            fontSize: '18px',
            color: 'var(--accent-color)',
            fontWeight: 'bold',
          }}>File Summary: {fileName}</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ×
          </button>
        </div>
        <div 
          style={{
            padding: '20px',
            overflow: 'auto',
            color: 'var(--text-primary)',
            fontSize: '15px',
            lineHeight: 1.6,
            flexGrow: 1,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap', // Preserve whitespace
          }}
        >
          {summary || 'No summary available.'}
        </div>
        <div 
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--bg-secondary)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-hover, #0078d7)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'var(--accent-color)'; }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string;
  } | null>(null);
  
  // Add state for summary dialog
  const [summaryDialog, setSummaryDialog] = useState<{
    isOpen: boolean;
    fileName: string;
    summary: string;
  }>({
    isOpen: false,
    fileName: '',
    summary: '',
  });

  const handleTabClick = (fileId: string) => {
    console.log('Tab clicked:', fileId);
    
    // Apply theme when switching tabs if available on window
    if (window.applyCustomTheme) {
      window.applyCustomTheme();
    }
    
    if (onTabSelect && fileId !== currentFileId) {
      onTabSelect(fileId);
    }
  };

  const handleTabClose = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (onTabClose) {
      onTabClose(fileId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      fileId,
    });
  };

  const handleSummarizeFile = async (fileId: string) => {
    const file = items[fileId];
    if (!file || !file.path) {
      console.error('Cannot summarize: File data incomplete');
      ToastManager.show('Cannot summarize file: File data incomplete', 'error');
      return;
    }

    try {
      // Show feedback that we're starting the summarization
      ToastManager.show(`Summarizing ${file.name}...`, 'info');
      
      // If content is not available, try to load it first
      let fileContent = file.content;
      if (!fileContent) {
        try {
          // Assuming FileSystemService has a readFile method
          const loadedContent = await FileSystemService.readFile(fileId);
          if (loadedContent) {
            fileContent = loadedContent;
          } else {
            ToastManager.show(`Could not read content of ${file.name}`, 'error');
            return;
          }
        } catch (error) {
          console.error('Error loading file content for summarization:', error);
          ToastManager.show(`Error reading file: ${file.name}`, 'error');
          return;
        }
      }
      
      // Now that we have content, call the summary function
      console.log("Requesting summary for file:", file.path);
      const summary = await AIFileService.getFileSummary(file.path, fileContent);
      console.log("Received summary:", summary); // Debug log

      if (summary) {
        console.log(`Summary generated for ${file.name}:`, summary);
        
        // Show toast notification
        ToastManager.show(`Summary ready for ${file.name}`, 'success');
        
        // Force state update to ensure dialog shows up
        setSummaryDialog(prevState => {
          console.log("Updating dialog state, previous:", prevState);
          const newState = {
            isOpen: true,
            fileName: file.name,
            summary: summary
          };
          console.log("New dialog state:", newState);
          return newState;
        });
        
        // Just to be super sure the state update worked, log after
        setTimeout(() => {
          console.log("SummaryDialog state after update:", summaryDialog);
        }, 100);
      } else {
        console.log("No summary returned");
        ToastManager.show('Could not generate summary', 'error');
      }
    } catch (error) {
      console.error('Error summarizing file:', error);
      ToastManager.show('Error generating file summary', 'error');
    }
  };

  // Filter out files that don't exist in the items record
  // Special case for 'welcome' file which might be restored later
  const validOpenFiles = openFiles.filter(fileId => 
    fileId === 'welcome' || items[fileId]
  );

  return (
    <>
      <div style={tabsContainerStyle}>
        {validOpenFiles.map((fileId) => {
          const file = items[fileId];
          const isActive = fileId === currentFileId;
          
          // Handle special case for welcome file
          const fileName = fileId === 'welcome' && !file 
            ? 'Welcome' 
            : file?.name || 'Unknown File';
          
          return (
            <div
              key={fileId}
              onClick={() => handleTabClick(fileId)}
              onContextMenu={(e) => handleContextMenu(e, fileId)}
              style={{
                padding: '0 10px',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                borderRight: '1px solid var(--border-color)',
                background: isActive ? 'var(--bg-selected)' : 'transparent',
                color: isActive ? 'var(--text-active)' : 'var(--text-primary)',
                fontWeight: isActive ? 500 : 'normal',
                fontSize: '13px',
                position: 'relative',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                minWidth: 0,
              }}
            >
              <div style={{ 
                marginRight: '8px', 
                display: 'flex', 
                alignItems: 'center',
                flexShrink: 0,
              }}>
                {file ? getIconForFile(file.name) : null}
              </div>
              <div style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '150px',
              }}>
                {fileName}
              </div>
              {fileId !== 'welcome' && onTabClose && (
                <div
                  onClick={(e) => handleTabClose(e, fileId)}
                  style={{
                    marginLeft: '8px',
                    opacity: 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    flexShrink: 0,
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent'; }}
                >
                  ✕
                </div>
              )}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'var(--accent-color)',
                }} />
              )}
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
        
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            options={[
              {
                label: 'Summarize',
                onClick: () => handleSummarizeFile(contextMenu.fileId),
                // Disable for welcome file as it's not a real file
                disabled: contextMenu.fileId === 'welcome',
              },
              {
                label: 'Close',
                onClick: () => {
                  if (onTabClose) {
                    onTabClose(contextMenu.fileId);
                  }
                },
                disabled: contextMenu.fileId === 'welcome', // Can't close welcome file
              },
            ]}
          />
        )}
      </div>
      
      {/* Always render the SummaryDialog component, regardless of isOpen state */}
      <SummaryDialog
        isOpen={summaryDialog.isOpen}
        onClose={() => {
          console.log("Closing summary dialog");
          setSummaryDialog(prev => ({ ...prev, isOpen: false }));
        }}
        fileName={summaryDialog.fileName}
        summary={summaryDialog.summary}
      />
    </>
  );
};

export default Tabs; 