import React, { useEffect, useState, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { FileChangeEventService } from '../services/FileChangeEventService';
import { FileSystemService } from '../services/FileSystemService';
import { getIconForFile } from './FileIcons';

interface DiffChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  timestamp: number;
}

const styles = {
  indicator: {
    position: 'fixed' as const,
    bottom: '1rem',
    right: '1rem',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '12px',
    border: '1px solid #404040',
    transition: 'background-color 0.2s',
    zIndex: 50,
  },
  indicatorHover: {
    backgroundColor: '#2d2d2d',
  },
  modal: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#1e1e1e',
    borderRadius: '0.5rem',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    width: '90vw',
    maxWidth: '1200px',
    height: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '1rem',
    backgroundColor: '#2d2d2d',
    borderBottom: '1px solid #404040',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#d4d4d4',
    fontSize: '14px',
    fontWeight: 500,
  },
  modalSubtitle: {
    color: '#808080',
    fontSize: '12px',
    marginTop: '0.25rem',
  },
  buttonGroup: {
    display: 'flex',
    gap: '0.5rem',
  },
  buttonBase: {
    padding: '0.375rem 0.75rem',
    fontSize: '12px',
    borderRadius: '0.25rem',
    transition: 'all 0.2s',
    cursor: 'pointer',
    border: 'none',
    color: '#d4d4d4',
  },
  declineButton: {
    backgroundColor: 'transparent',
    border: '1px solid #dc2626',
    color: '#ef4444',
  },
  declineButtonHover: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
  acceptButton: {
    backgroundColor: '#059669',
    border: '1px solid transparent',
  },
  acceptButtonHover: {
    backgroundColor: '#047857',
  },
  closeButton: {
    backgroundColor: 'transparent',
    marginLeft: '0.5rem',
  },
  closeButtonHover: {
    backgroundColor: 'rgba(75, 85, 99, 0.2)',
  },
  editorContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  fileList: {
    width: '200px',
    borderRight: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
  },
  fileItem: {
    padding: '8px 12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    transition: 'background-color 0.2s ease',
  },
  fileItemActive: {
    backgroundColor: 'var(--bg-selected)',
    borderLeft: '2px solid var(--accent-color)',
  },
  fileItemIcon: {
    display: 'flex',
    alignItems: 'center',
    opacity: 0.7,
  },
  diffContainer: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
};

const ANIMATION_STYLES = `
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.85;
      transform: scale(1.03);
    }
  }

  @keyframes glow {
    0%, 100% {
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    50% {
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
    }
  }

  .diff-indicator {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .diff-indicator:hover {
    animation: none;
  }

  .diff-indicator-icon {
    color: #10b981;
    transition: transform 0.2s;
  }

  .diff-indicator-text {
    color: #10b981;
    font-weight: 500;
  }
`;

export const DiffViewer: React.FC = () => {
  const [diffs, setDiffs] = useState<DiffChange[]>([]);
  const [currentDiffIndex, setCurrentDiffIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHovering, setIsHovering] = useState<{[key: string]: boolean}>({});
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const unsubscribe = FileChangeEventService.subscribe(async (filePath, oldContent, newContent) => {
      // First try to get the actual current content of the file
      try {
        const response = await fetch(`http://localhost:23816/read-file?path=${encodeURIComponent(filePath)}`);
        if (response.ok) {
          oldContent = await response.text();
        }
      } catch (error) {
        console.error('Error reading current file content:', error);
      }

      // Update the current editor if it's the file being changed
      const currentFile = window.getCurrentFile?.();
      if (currentFile?.path === filePath && window.editor) {
        const currentModel = window.editor.getModel();
        if (currentModel) {
          // Create decorations for the diff
          const originalLines = oldContent.split('\n');
          const newLines = newContent.split('\n');
          const diffDecorations: monaco.editor.IModelDeltaDecoration[] = [];

          // First pass: find all changes
          const changes = [];
          for (let i = 0; i < Math.max(originalLines.length, newLines.length); i++) {
            if (originalLines[i] !== newLines[i]) {
              changes.push({
                lineNumber: i + 1,
                type: originalLines[i] === undefined ? 'add' : 
                       newLines[i] === undefined ? 'remove' : 'modify'
              });
            }
          }

          // Second pass: create decorations with proper ranges
          changes.forEach(change => {
            const options = {
              isWholeLine: true,
              className: `${change.type === 'add' ? 'diffLineAdditionContent' : 
                         change.type === 'remove' ? 'diffLineRemovalContent' : 
                         'diffLineModifiedContent'}`,
              linesDecorationsClassName: `${change.type === 'add' ? 'diffLineAddition' : 
                                         change.type === 'remove' ? 'diffLineRemoval' : 
                                         'diffLineModified'}`,
              marginClassName: `${change.type === 'add' ? 'diffLineAdditionMargin' : 
                               change.type === 'remove' ? 'diffLineRemovalMargin' : 
                               'diffLineModifiedMargin'}`
            };

            diffDecorations.push({
              range: new monaco.Range(
                change.lineNumber,
                1,
                change.lineNumber,
                1
              ),
              options
            });
          });

          // Add the decorations to the editor
          window.editor.deltaDecorations([], diffDecorations);

          // Add the CSS if not already added
          if (!document.getElementById('diff-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'diff-styles';
            styleSheet.textContent = `
              .diffLineAddition { background-color: rgba(40, 167, 69, 0.2) !important; }
              .diffLineAdditionContent { background-color: rgba(40, 167, 69, 0.1) !important; }
              .diffLineAdditionMargin { border-left: 3px solid #28a745 !important; }
              
              .diffLineRemoval { background-color: rgba(220, 38, 38, 0.2) !important; }
              .diffLineRemovalContent { background-color: rgba(220, 38, 38, 0.1) !important; }
              .diffLineRemovalMargin { border-left: 3px solid #dc2626 !important; }
              
              .diffLineModified { background-color: rgba(58, 130, 246, 0.2) !important; }
              .diffLineModifiedContent { background-color: rgba(58, 130, 246, 0.1) !important; }
              .diffLineModifiedMargin { border-left: 3px solid #3a82f6 !important; }
            `;
            document.head.appendChild(styleSheet);
          }
        }
      }

      setDiffs(prev => [
        {
          filePath,
          oldContent,
          newContent,
          timestamp: Date.now()
        },
        ...prev.filter(d => d.filePath !== filePath)
      ].slice(0, 10));
    });

    return () => {
      unsubscribe();
      cleanupEditor();
      // Remove the diff styles
      const styleSheet = document.getElementById('diff-styles');
      if (styleSheet) {
        styleSheet.remove();
      }
    };
  }, []);

  const cleanupEditor = () => {
    if (diffEditorRef.current) {
      const { original, modified } = diffEditorRef.current.getModel() || {};
      original?.dispose();
      modified?.dispose();
      diffEditorRef.current.dispose();
      diffEditorRef.current = null;
    }
  };

  useEffect(() => {
    if (!isModalOpen || !containerRef.current) return;

    cleanupEditor();

    if (diffs.length > 0) {
      const currentDiff = diffs[currentDiffIndex];
      
      diffEditorRef.current = monaco.editor.createDiffEditor(containerRef.current, {
        automaticLayout: true,
        readOnly: true,
        renderSideBySide: true,
        ignoreTrimWhitespace: false,
        theme: 'vs-dark',
        fontSize: 12,
        lineHeight: 1.5,
        minimap: { enabled: false },
        scrollbar: {
          vertical: 'visible',
          horizontal: 'visible',
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
        renderOverviewRuler: false,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        diffWordWrap: 'on',
        padding: { top: 8, bottom: 8 },
        originalEditable: false,
        renderIndicators: true,
        renderMarginRevertIcon: true,
      });

      const fileExtension = currentDiff.filePath.split('.').pop() || '';
      const language = getLanguageFromExtension(fileExtension);

      // Create models with the correct content
      const oldModel = monaco.editor.createModel(
        currentDiff.oldContent,
        language
      );
      const newModel = monaco.editor.createModel(
        currentDiff.newContent,
        language
      );
      
      diffEditorRef.current.setModel({
        original: oldModel,
        modified: newModel
      });

      // Set editor options for better diff visibility
      diffEditorRef.current.updateOptions({
        renderSideBySide: true,
        enableSplitViewResizing: false,
        originalEditable: false,
        lineNumbers: 'on',
        folding: false,
        renderIndicators: true,
        renderMarginRevertIcon: true,
      });

      setTimeout(() => {
        diffEditorRef.current?.layout();
        // Scroll both editors to top
        diffEditorRef.current?.getOriginalEditor().setScrollTop(0);
        diffEditorRef.current?.getModifiedEditor().setScrollTop(0);
      }, 50);
    }
  }, [isModalOpen, currentDiffIndex, diffs, refreshKey]);

  const refreshDiffView = (newDiffs: DiffChange[], newIndex: number) => {
    // Force cleanup of the editor
    cleanupEditor();
    
    // Update the diffs array first
    setDiffs(newDiffs);
    
    // If there are no more diffs, close the modal
    if (newDiffs.length === 0) {
      setIsModalOpen(false);
      return;
    }
    
    // Update the current index
    setCurrentDiffIndex(newIndex);
    
    // Force a re-render by updating the refresh key
    setRefreshKey(prev => prev + 1);
  };

  const handleAccept = async () => {
    if (diffs.length === 0 || isProcessing) return;
    
    const currentDiff = diffs[currentDiffIndex];
    setIsProcessing(true);
    
    try {
      const modifiedContent = diffEditorRef.current?.getModifiedEditor().getValue() || '';
      await FileSystemService.saveFile(currentDiff.filePath, modifiedContent);
      
      // Create a new array without the current diff
      const newDiffs = diffs.filter((_, i) => i !== currentDiffIndex);
      
      // Update the current open file if this is the file being changed
      const currentFile = window.getCurrentFile?.();
      if (currentFile?.path === currentDiff.filePath && window.editor) {
        window.editor.setValue(modifiedContent);
      }

      // Reload the file in the file system
      const fileId = Object.entries(window.fileSystem?.items || {})
        .find(([_, item]) => item.path === currentDiff.filePath)?.[0];
      if (fileId && window.reloadFileContent) {
        await window.reloadFileContent(fileId);
      }

      // Calculate the new index for the diffs array after removing the current item
      const newIndex = currentDiffIndex >= newDiffs.length ? 0 : currentDiffIndex;
      
      // Refresh the diff view with the new state
      refreshDiffView(newDiffs, newIndex);
    } catch (error) {
      console.error('Error accepting changes:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = () => {
    if (isProcessing) return;
    
    // Create a new array without the current diff
    const newDiffs = diffs.filter((_, i) => i !== currentDiffIndex);
    
    // Calculate the new index for the diffs array after removing the current item
    const newIndex = currentDiffIndex >= newDiffs.length ? 0 : currentDiffIndex;
    
    // Refresh the diff view with the new state
    refreshDiffView(newDiffs, newIndex);
  };

  const getLanguageFromExtension = (ext: string): string => {
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'md': 'markdown',
    };
    return languageMap[ext] || 'plaintext';
  };

  // Add styles when component mounts
  useEffect(() => {
    if (!document.getElementById('diff-viewer-animations')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'diff-viewer-animations';
      styleSheet.textContent = ANIMATION_STYLES;
      document.head.appendChild(styleSheet);

      return () => {
        styleSheet.remove();
      };
    }
  }, []);

  if (diffs.length === 0) {
    return null;
  }

  const currentDiff = diffs[currentDiffIndex];
  const fileName = currentDiff.filePath.split('/').pop() || currentDiff.filePath;

  return (
    <>
      <div 
        onClick={() => setIsModalOpen(true)}
        onMouseEnter={() => setIsHovering({ ...isHovering, indicator: true })}
        onMouseLeave={() => setIsHovering({ ...isHovering, indicator: false })}
        className={diffs.length > 0 ? 'diff-indicator' : undefined}
        style={{
          ...styles.indicator,
          ...(isHovering.indicator ? styles.indicatorHover : {}),
          ...(diffs.length > 0 ? {
            backgroundColor: '#1a2634',
            border: '1px solid #234876',
          } : {})
        }}
      >
        <svg 
          width="14" 
          height="14" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor"
          className={diffs.length > 0 ? 'diff-indicator-icon' : undefined}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <span className={diffs.length > 0 ? 'diff-indicator-text' : undefined}>
          {diffs.length} pending {diffs.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      {isModalOpen && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.modalTitle}>Review Changes</div>
                <div style={styles.modalSubtitle}>
                  {fileName} {diffs.length > 1 && `(${currentDiffIndex + 1}/${diffs.length} files)`}
                </div>
              </div>
              <div style={styles.buttonGroup}>
                <button
                  onClick={handleReject}
                  disabled={isProcessing}
                  onMouseEnter={() => setIsHovering({ ...isHovering, decline: true })}
                  onMouseLeave={() => setIsHovering({ ...isHovering, decline: false })}
                  style={{
                    ...styles.buttonBase,
                    ...styles.declineButton,
                    ...(isHovering.decline ? styles.declineButtonHover : {}),
                    ...(isProcessing ? styles.disabledButton : {})
                  }}
                >
                  Decline
                </button>
                <button
                  onClick={handleAccept}
                  disabled={isProcessing}
                  onMouseEnter={() => setIsHovering({ ...isHovering, accept: true })}
                  onMouseLeave={() => setIsHovering({ ...isHovering, accept: false })}
                  style={{
                    ...styles.buttonBase,
                    ...styles.acceptButton,
                    ...(isHovering.accept ? styles.acceptButtonHover : {}),
                    ...(isProcessing ? styles.disabledButton : {})
                  }}
                >
                  {isProcessing ? 'Accepting...' : 'Accept Changes'}
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  onMouseEnter={() => setIsHovering({ ...isHovering, close: true })}
                  onMouseLeave={() => setIsHovering({ ...isHovering, close: false })}
                  style={{
                    ...styles.buttonBase,
                    ...styles.closeButton,
                    ...(isHovering.close ? styles.closeButtonHover : {})
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={styles.diffContainer}>
              <div style={styles.fileList}>
                {diffs.map((diff, index) => {
                  const fileName = diff.filePath.split('/').pop() || diff.filePath;
                  const isActive = index === currentDiffIndex;
                  
                  return (
                    <div
                      key={diff.filePath}
                      onClick={() => setCurrentDiffIndex(index)}
                      style={{
                        ...styles.fileItem,
                        ...(isActive ? styles.fileItemActive : {}),
                        marginLeft: isActive ? '-2px' : '0',
                      }}
                    >
                      <span style={styles.fileItemIcon}>
                        {getIconForFile(fileName)}
                      </span>
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {fileName}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div ref={containerRef} style={styles.editorContainer} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}; 