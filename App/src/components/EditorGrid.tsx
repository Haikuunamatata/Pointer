import React, { useRef, useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import { FileSystemItem } from '../types';
import { getLanguageFromFileName } from '../utils/languageUtils';
import { AIFileService } from '../services/AIFileService';
import { lmStudio } from '../services/LMStudioService';

interface EditorPaneProps {
  fileId: string;
  file: FileSystemItem;
  onEditorReady: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

const EditorPane: React.FC<EditorPaneProps> = ({ fileId, file, onEditorReady }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const contentRef = useRef<string>('');  // Add this to track content changes
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [prompt, setPrompt] = useState('');

  // Normalize content once when file changes
  useEffect(() => {
    if (file?.content) {
      contentRef.current = file.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }
  }, [file?.content]);

  useEffect(() => {
    if (!editorRef.current || !file) return;

    if (!editor.current) {
      const language = getLanguageFromFileName(file.name);
      const uri = monaco.Uri.parse(file.path);

      // Check if a model already exists for this file
      let model = monaco.editor.getModel(uri);
      
      // If model exists, update its value
      if (model) {
        if (model.getValue() !== contentRef.current) {
          model.setValue(contentRef.current);
        }
      } else {
        // Create new model only if it doesn't exist
        model = monaco.editor.createModel(
          contentRef.current,
          language,
          uri
        );
        model.setEOL(monaco.editor.EndOfLineSequence.LF);
      }

      // Create editor with the model
      editor.current = monaco.editor.create(editorRef.current, {
        model: model,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: {
          enabled: true,
        },
        lineNumbers: 'on',
        wordWrap: 'off',
        renderWhitespace: 'selection',
        scrollBeyondLastLine: false,
        cursorStyle: 'line',
        lineHeight: 19,
        renderFinalNewline: true,
        detectIndentation: true,
        trimAutoWhitespace: true,
      });

      // Add keyboard event handler for Ctrl+I
      editor.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
        setShowPromptInput(true);
      });

      if (editor.current) {
        onEditorReady(editor.current);
      }
    } else {
      // If editor exists, just update the model's value if it's different
      const model = editor.current.getModel();
      if (model && model.getValue() !== contentRef.current) {
        model.setValue(contentRef.current);
      }
    }

    return () => {
      if (editor.current) {
        const model = editor.current.getModel();
        editor.current.dispose();
        editor.current = null;
        if (model && !model.isDisposed()) {
          model.dispose();
        }
      }
    };
  }, [fileId, file, onEditorReady]);

  const handlePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    // Get the current selection or cursor position
    const selection = editor.current?.getSelection();
    const position = selection?.getStartPosition();
    
    // Get the current file path
    const currentFile = window.getCurrentFile?.();
    if (!currentFile) return;

    // Create a context-aware prompt
    const contextPrompt = `In file ${currentFile.path}${position ? ` at line ${position.lineNumber}, column ${position.column}` : ''}, ${prompt}`;
    
    try {
      // Get response from LM Studio
      const response = await lmStudio.createChatCompletion({
        model: 'deepseek-coder-v2-lite-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a coding assistant. Return only code changes without explanations.'
          },
          {
            role: 'user',
            content: contextPrompt
          }
        ],
        temperature: 0.3,
      });

      const aiContent = response.choices[0]?.message?.content;
      if (aiContent) {
        // Process the AI response directly
        await AIFileService.processAIResponse(aiContent);
      }
    } catch (error) {
      console.error('Error processing AI request:', error);
    }

    // Reset the prompt input
    setPrompt('');
    setShowPromptInput(false);
  };

  if (!file) {
    return <div>No file loaded</div>;
  }

  return (
    <div 
      ref={editorRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'relative',
      }} 
    >
      {showPromptInput && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-secondary)',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
          zIndex: 1000,
          minWidth: '300px',
        }}>
          <form onSubmit={handlePromptSubmit}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask AI anything..."
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
              }}
              autoFocus
            />
            <div style={{ 
              marginTop: '10px', 
              display: 'flex', 
              justifyContent: 'flex-end',
              gap: '8px'
            }}>
              <button
                type="button"
                onClick={() => setShowPromptInput(false)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--accent-color)',
                  borderRadius: '4px',
                  background: 'var(--accent-color)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Ask AI
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface EditorGridProps {
  openFiles: string[];
  currentFileId: string | null;
  items: Record<string, FileSystemItem>;
  onEditorChange: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  onTabClose: (fileId: string) => void;
  isGridLayout?: boolean;
  onToggleGrid?: () => void;
}

interface EditorLayout {
  id: string;
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DragHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({ onMouseDown }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '24px',
      background: 'var(--bg-secondary)',
      cursor: 'move',
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      fontSize: '12px',
      color: 'var(--text-secondary)',
      userSelect: 'none',
    }}
    onMouseDown={onMouseDown}
  >
    ⋮⋮ Drag to move
  </div>
);

const EditorGrid: React.FC<EditorGridProps> = ({ 
  openFiles, 
  currentFileId, 
  items,
  onEditorChange,
  onTabClose,
  isGridLayout = false,
  onToggleGrid,
}) => {
  const [layouts, setLayouts] = useState<EditorLayout[]>([]);
  const [draggingLayout, setDraggingLayout] = useState<EditorLayout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Initialize layout when files change or grid layout changes
    setLayouts(prevLayouts => {
      const newLayouts: EditorLayout[] = [];
      openFiles.forEach((fileId, index) => {
        const existingLayout = prevLayouts.find(l => l.fileId === fileId);
        if (existingLayout && isGridLayout) {
          newLayouts.push(existingLayout);
        } else {
          // Calculate grid position for new files or when switching to grid
          if (isGridLayout) {
            const column = index % 2;
            const row = Math.floor(index / 2);
            newLayouts.push({
              id: `editor-${fileId}`,
              fileId,
              x: column * 50,
              y: row * 50,
              width: 50,
              height: 50,
            });
          } else {
            // Single editor mode - full width and height
            newLayouts.push({
              id: `editor-${fileId}`,
              fileId,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            });
          }
        }
      });
      return newLayouts;
    });
  }, [openFiles, isGridLayout]);

  const handleDragStart = (layout: EditorLayout, e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingLayout(layout);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current || !dragStartPos.current) return;

      const container = containerRef.current.getBoundingClientRect();
      const deltaX = moveEvent.clientX - dragStartPos.current.x;
      const deltaY = moveEvent.clientY - dragStartPos.current.y;
      
      const newX = ((deltaX / container.width) * 100) + layout.x;
      const newY = ((deltaY / container.height) * 100) + layout.y;

      // Snap to grid
      const snapX = Math.max(0, Math.min(50, Math.round(newX / 50) * 50));
      const snapY = Math.max(0, Math.min(50, Math.round(newY / 50) * 50));

      // Find if there's another layout at the target position
      const targetLayout = layouts.find(l => 
        l.id !== layout.id && 
        l.x === snapX && 
        l.y === snapY
      );

      setLayouts(prevLayouts => {
        if (targetLayout) {
          // Swap positions with the target layout
          return prevLayouts.map(l => {
            if (l.id === layout.id) {
              return { ...l, x: snapX, y: snapY };
            }
            if (l.id === targetLayout.id) {
              return { ...l, x: layout.x, y: layout.y };
            }
            return l;
          });
        } else {
          // Just move the current layout
          return prevLayouts.map(l => 
            l.id === layout.id 
              ? { ...l, x: snapX, y: snapY }
              : l
          );
        }
      });
    };

    const handleMouseUp = () => {
      setDraggingLayout(null);
      dragStartPos.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {layouts.map(layout => {
        const isVisible = isGridLayout || layout.fileId === currentFileId;
        return isVisible ? (
          <div
            key={layout.id}
            style={{
              position: 'absolute',
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              width: `${layout.width}%`,
              height: `${layout.height}%`,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              transition: draggingLayout?.id === layout.id ? 'none' : 'all 0.2s ease',
              display: isVisible ? 'block' : 'none',
            }}
          >
            {isGridLayout && (
              <DragHandle onMouseDown={(e) => handleDragStart(layout, e)} />
            )}
            <div style={{ 
              height: isGridLayout ? 'calc(100% - 24px)' : '100%', 
              marginTop: isGridLayout ? '24px' : '0',
            }}>
              {items[layout.fileId] && (
                <EditorPane
                  fileId={layout.fileId}
                  file={items[layout.fileId]}
                  onEditorReady={onEditorChange}
                />
              )}
            </div>
          </div>
        ) : null;
      })}
    </div>
  );
};

export default EditorGrid; 