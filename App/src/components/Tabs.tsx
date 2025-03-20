import React, { useState } from 'react';
import { FileSystemItem } from '../types';
import { getIconForFile } from './FileIcons';
import ContextMenu from './ContextMenu';
import { AIFileService } from '../services/AIFileService';
import { ToastManager } from './Toast';
import { FileSystemService } from '../services/FileSystemService';
import Modal from './Modal';

// Interface no longer needed as we're using the generic Modal component

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
    isStreaming: boolean;
  }>({
    isOpen: false,
    fileName: '',
    summary: '',
    isStreaming: false,
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
      
      // Open the dialog first but mark it as streaming
      setSummaryDialog({
        isOpen: true,
        fileName: file.name,
        summary: '',
        isStreaming: true
      });
      
      // Initialize accumulated summary
      let accumulatedSummary = '';
      
      // Now that we have content, call the summary function with streaming
      console.log("Requesting streaming summary for file:", file.path);
      
      const summary = await AIFileService.getFileSummary(
        file.path, 
        fileContent,
        (chunk) => {
          // Update with each new chunk
          accumulatedSummary += chunk;
          setSummaryDialog(prev => ({
            ...prev,
            summary: accumulatedSummary
          }));
        }
      );

      // After streaming is complete, update the final state
      setSummaryDialog(prev => ({
        ...prev,
        summary: summary || accumulatedSummary,
        isStreaming: false
      }));
      
      // Show toast notification
      ToastManager.show(`Summary ready for ${file.name}`, 'success');
      
    } catch (error) {
      console.error('Error summarizing file:', error);
      ToastManager.show('Error generating file summary', 'error');
      
      // Make sure to update state to indicate streaming is done, even on error
      setSummaryDialog(prev => ({
        ...prev,
        isStreaming: false
      }));
    }
  };

  // Filter out files that don't exist in the items record
  // Special case for 'welcome' file which might be restored later
  const validOpenFiles = openFiles.filter(fileId => 
    fileId === 'welcome' || items[fileId]
  );

  // Render the content for the summary dialog
  const renderSummaryContent = () => {
    if (summaryDialog.isStreaming && summaryDialog.summary === '') {
      return <span className="blinking-cursor">|</span>;
    }
    
    return (
      <>
        {summaryDialog.summary || 'No summary available.'}
        {summaryDialog.isStreaming && <span className="blinking-cursor">|</span>}
      </>
    );
  };

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
      
      {/* Use the generic Modal component instead of the SummaryDialog */}
      <Modal
        isOpen={summaryDialog.isOpen}
        onClose={() => {
          console.log("Closing summary dialog");
          setSummaryDialog(prev => ({ ...prev, isOpen: false }));
        }}
        title={`File Summary: ${summaryDialog.fileName}`}
        content={renderSummaryContent()}
        isStreaming={summaryDialog.isStreaming}
      />
    </>
  );
};

export default Tabs; 