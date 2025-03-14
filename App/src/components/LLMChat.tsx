import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { lmStudio } from '../services/LMStudioService';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileSystemService } from '../services/FileSystemService';
import { ChatService, ChatSession } from '../services/ChatService';
import { v4 as uuidv4 } from 'uuid';
import { getIconForFile } from './FileIcons';
import { editor } from 'monaco-editor';
import { Settings } from './Settings';
import '../styles/LLMChat.css';
import { AIFileService } from '../services/AIFileService';
import { cleanAIResponse, getLanguageFromFilename } from '../utils/textUtils';
import { keyframes } from '@emotion/react';

declare global {
  interface Window {
    cursorAPI: {
      insertCodeAtCursor: (code: string) => Promise<void>;
    }
    getCurrentFile: () => { path: string };
    editor?: editor.IStandaloneCodeEditor;
    fileSystem?: { items: Record<string, { path: string }> };
    reloadFileContent?: (fileId: string) => Promise<void>;
  }

  interface WindowEventMap {
    'showLLMChat': CustomEvent<{ input: string; selection?: string }>;
  }
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  relevantFiles?: {
    path: string;
    score: number;
  }[];
  keywords?: string[];
  executedCommands?: string[]; // Track which commands have been executed in this message
  commandExecutions?: CommandExecution[]; // Store detailed information about command executions
}

// New interface for command execution details
interface CommandExecution {
  id: string;
  command: string;
  parameters: Record<string, any>;
  timestamp: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  output?: string;
  error?: string;
}

interface LLMChatProps {
  isVisible: boolean;
  onClose: () => void;
  onResize?: (width: number) => void;
  currentChatId: string;
  onSelectChat: (chatId: string) => void;
}

interface LLMChatState {
  currentChatId: string;
  chats: ChatSession[];
}

interface FileCompletion {
  path: string;
  type: 'file' | 'directory';
}

interface RelevantFile {
  path: string;
  score: number;
  content: string | null;
}

interface RelevantFilesResponse {
  files: RelevantFile[];
  keywords: string[];
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Update the style constants
const codeBlockStyles = {
  position: 'relative' as const,
  marginTop: '32px',  // Increased from 28px to give more space
};

const codeBlockHeaderStyles = {
  position: 'absolute' as const,
  top: '-24px',  // Changed from -28px to position it lower
  left: '0',
  backgroundColor: 'var(--bg-secondary)',
  borderTopLeftRadius: '4px',
  borderTopRightRadius: '4px',
  padding: '4px 8px',
  fontSize: '12px',
  color: 'var(--text-secondary)',
  borderTop: '1px solid var(--border-color)',
  borderLeft: '1px solid var(--border-color)',
  borderRight: '1px solid var(--border-color)',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: '24px',
  zIndex: 1,  // Add this to ensure it stays above the code block
};

const CopyButton: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        position: 'absolute',
        right: '8px',
        top: '-12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '4px',
        padding: '6px',
        color: copied ? 'var(--accent-color)' : 'var(--text-secondary)',
        cursor: 'pointer',
        opacity: 0.7,
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        transform: copied ? 'scale(1.1)' : 'scale(1)',
      }}
      title={copied ? 'Copied!' : 'Copy code'}
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
};

const InsertButton: React.FC<{ content: string }> = ({ content }) => {
  const [inserted, setInserted] = useState(false);
  const [error, setError] = useState(false);

  const handleInsert = async () => {
    try {
      // Get the current file path from the App state
      const currentFile = window.getCurrentFile?.();
      console.log('Current file:', currentFile);
      if (!currentFile) {
        throw new Error('No file is currently open');
      }

      // Call the backend endpoint
      const response = await fetch('http://localhost:23816/insert-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: currentFile.path,
          content: content,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to insert code');
      }

      // Get the current file ID from the path
      console.log('FileSystem:', window.fileSystem);
      const currentFileId = Object.entries(window.fileSystem?.items || {})
        .find(([_, item]) => item.path === currentFile.path)?.[0];
      console.log('Found file ID:', currentFileId);

      // Reload the file content if we have the ID and the reload function
      if (currentFileId && window.reloadFileContent) {
        console.log('Reloading file content for ID:', currentFileId);
        await window.reloadFileContent(currentFileId);
      } else {
        console.log('Using fallback file read');
        // Fallback to direct file read if we can't find the ID
        const contentResponse = await fetch(`http://localhost:23816/read-file?path=${encodeURIComponent(currentFile.path)}`);
        if (contentResponse.ok) {
          const updatedContent = await contentResponse.text();
          console.log('Got updated content:', updatedContent.slice(0, 100) + '...');
          if (window.editor?.setValue) {
            window.editor.setValue(updatedContent);
          }
        }
      }

      setInserted(true);
      setError(false);
      setTimeout(() => setInserted(false), 2000);
    } catch (err) {
      console.error('Failed to insert code:', err);
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <button
      onClick={handleInsert}
      style={{
        position: 'absolute',
        right: '44px',
        top: '-12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '4px',
        padding: '6px',
        color: error ? 'var(--text-error)' : inserted ? 'var(--accent-color)' : 'var(--text-secondary)',
        cursor: 'pointer',
        opacity: 0.7,
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        transform: (inserted || error) ? 'scale(1.1)' : 'scale(1)',
      }}
      title={error ? 'Failed to insert code' : inserted ? 'Inserted!' : 'Insert code in editor'}
    >
      {error ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ) : inserted ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </button>
  );
};

const ProcessFilesButton: React.FC<{ content: string }> = ({ content }) => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  const handleProcess = async () => {
    try {
      setProcessing(true);
      setError(false);
      setSuccess(false);
      
      // Process the AI response
      await AIFileService.processAIResponse(content);
      
      // Force a final file structure refresh
      await FileSystemService.refreshStructure();
      
      // Refresh editor content if available
      const currentFile = window.getCurrentFile?.();
      if (currentFile && window.editor?.setValue) {
        const response = await fetch(`http://localhost:23816/read-file?path=${encodeURIComponent(currentFile.path)}`);
        if (response.ok) {
          const updatedContent = await response.text();
          window.editor.setValue(updatedContent);
        }
      }
      
      // Trigger a file explorer refresh by clearing loaded folders
      FileSystemService.clearLoadedFolders();
      
      setSuccess(true);
      setHasProcessed(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to process files:', err);
      setError(true);
      setTimeout(() => setError(false), 2000);
    } finally {
      setProcessing(false);
      // Clear the refresh interval
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
    }
  };

  return (
    <button
      onClick={handleProcess}
      style={{
        position: 'absolute',
        right: '80px',
        top: '-12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '4px',
        padding: '6px',
        color: error ? 'var(--text-error)' : success ? 'var(--accent-color)' : 'var(--text-secondary)',
        cursor: 'pointer',
        opacity: 0.7,
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        transform: (success || error) ? 'scale(1.1)' : 'scale(1)',
        animation: !hasProcessed ? 'float 2s ease-in-out infinite' : undefined,
      }}
      title={error ? 'Failed to process files' : success ? 'Files processed!' : hasProcessed ? 'Retry processing files' : 'Process files from AI response'}
      disabled={processing}
    >
      <style>
        {`
          @keyframes float {
            0% {
              transform: translateY(0px);
            }
            50% {
              transform: translateY(-4px);
            }
            100% {
              transform: translateY(0px);
            }
          }
        `}
      </style>
      {processing ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ) : error ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ) : success ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : hasProcessed ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6" />
          <path d="M2 12c0-3.87 3.13-7 7-7 3.17 0 5.85 2.11 6.71 5M22 12c0 3.87-3.13 7-7 7-3.17 0-5.85-2.11-6.71-5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )}
    </button>
  );
};

// Update the initial system message
const INITIAL_SYSTEM_MESSAGE = {
  role: 'system' as const,
  content: `You are a coding assistant that helps users write, debug, edit, and understand code.

When showing code examples, use standard markdown code blocks with language specifiers:

\`\`\`python
def example():
    return "Hello World"
\`\`\`

MARKDOWN FORMATTING GUIDELINES:
1. Use headers for structure:
   # Main Section
   ## Sub-section

2. Use lists for steps and options:
   - For unordered items
   - Like this
   1. For ordered steps
   2. Like this

3. Use > for important notes

4. Use **bold** for emphasis

5. For code blocks, always use triple backticks with a language specifier:
   \`\`\`language
   code here
   \`\`\`

6. For terminal commands, use the command pointer format:
   @pointer:command+execute:start
   npm install react
   @pointer:command+execute:end
   
   The 'execute' mode will automatically run the command.
   
   @pointer:command+normal:start
   npm run build
   @pointer:command+normal:end
   
   The 'normal' mode will show an execute button for the user to run manually.

Remember:
- Always specify the language in code blocks
- Use proper markdown formatting
- Keep responses clear and well-structured
- Use command pointers for terminal commands instead of \`\`\`sh blocks`
};

// Update the processFileReferences function
const processFileReferences = async (text: string): Promise<string> => {
  const fileRegex = /@([\w.-/\\]+)/g;
  let result = text;
  let match;

  // Get the current directory from FileSystemService
  const currentDir = FileSystemService.getCurrentDirectory();

  while ((match = fileRegex.exec(text)) !== null) {
    const command = match[1];

    // Handle special commands
    if (command === 'filestructure' || command === 'files') {
      try {
        if (!currentDir) {
          result = result.replace(match[0], 
            `\nNo directory opened. Please open a directory first using the file explorer.\n`
          );
          continue;
        }

        // Include currentDir in the query params
        const queryParams = new URLSearchParams();
        queryParams.append('currentDir', currentDir);

        const response = await fetch(`http://localhost:23816/files?${queryParams}`);
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const files = await response.json();
        
        if (command === 'filestructure') {
          // Create a tree-like structure for filestructure command
          const fileTree = files
            .sort((a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path))
            .map((file: { path: string }) => {
              const parts = file.path.split('/');
              const indent = '  '.repeat(parts.length - 1);
              return `${indent}${parts[parts.length - 1]}`;
            })
            .join('\n');
          result = result.replace(match[0], `\nProject Structure:\n${fileTree}\n`);
        } else {
          // Regular flat list for files command
          const fileList = files.map((file: { path: string }) => `- ${file.path}`).join('\n');
          result = result.replace(match[0], `\nProject Files:\n${fileList}\n`);
        }
      } catch (error) {
        console.error('Error fetching file list:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        result = result.replace(match[0], 
          `\nError: ${errorMessage}\nPlease make sure a directory is opened in the file explorer.\n`
        );
      }
      continue;
    }

    // Handle regular file references
    const filePath = command;
    try {
      // Include the current directory in the query params
      const queryParams = new URLSearchParams();
      queryParams.append('path', filePath);
      if (currentDir) {
        queryParams.append('currentDir', currentDir);
      }

      console.log('Attempting to read file:', {
        filePath,
        currentDir,
        fullQueryString: queryParams.toString(),
        baseUrl: `http://localhost:23816/read-file?${queryParams}`
      });

      // Get the file content through the backend
      const response = await fetch(`http://localhost:23816/read-file?${queryParams}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Failed to read file:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        result = result.replace(match[0], 
          `\nFile not found: ${filePath}\nCurrent directory: ${currentDir}\nError: ${errorData?.detail || response.statusText}\n`
        );
        continue;
      }
      
      const content = await response.text();
      // Ensure proper line endings
      const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const fileExtension = filePath.split('.').pop() || '';
      const replacement = `\nFile: ${filePath}\n\`\`\`${fileExtension}\n${normalizedContent}\n\`\`\`\n`;
      result = result.replace(match[0], replacement);
    } catch (error) {
      console.error('Error reading file:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      result = result.replace(match[0], 
        `\nError reading file ${filePath}: ${errorMessage}\n`
      );
    }
  }

  return result;
};

// Component for displaying code blocks (both complete and incomplete)
const CodeBlock: React.FC<{
  filename: string;
  language: string;
  code?: string;
  isGenerating?: boolean;
  message?: Message;
}> = ({ filename, language, code = '', isGenerating = false, message }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Styles for the code block
  const containerStyles: React.CSSProperties = {
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    marginBottom: '16px',
    marginTop: '12px',
    border: `1px solid ${isHovered ? '#555' : '#333'}`,
    overflow: 'hidden',
    transition: 'border-color 0.2s ease'
  };
  
  const headerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: isHovered ? '#2c2c2c' : '#252525',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'monospace',
    userSelect: 'none',
    transition: 'background-color 0.2s ease',
    zIndex: 10 // Ensure header is above the content
  };
  
  const loadingIndicatorStyles: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    marginLeft: '10px',
    color: '#888',
    fontSize: '12px',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: '12px',
    padding: '2px 8px'
  };
  
  const pulseStyle: React.CSSProperties = {
    height: '8px',
    width: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    backgroundColor: '#4CAF50',
    marginRight: '4px',
  };
  
  const codePreviewStyles: React.CSSProperties = {
    padding: '8px 12px',
    paddingLeft: '14px',
    color: '#bbb',
    fontSize: '13px',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    backgroundColor: '#1e1e1e',
    borderTop: '1px solid #333',
    fontStyle: 'italic'
  };
  
  const lineCountStyles: React.CSSProperties = {
    color: '#666',
    fontSize: '12px',
    fontStyle: 'italic',
    padding: '4px 12px',
    paddingTop: '0',
    backgroundColor: '#1e1e1e',
    borderTop: 'none',
    display: 'flex',
    alignItems: 'center'
  };
  
  const codeContainerStyles: React.CSSProperties = {
    position: 'relative',
    maxHeight: '500px',  // Set a max height for long code blocks
    overflow: 'auto',    // Enable scrolling for long content
    msOverflowStyle: 'none', // IE and Edge
    scrollbarWidth: 'none'  // Firefox
  };
  
  const codeStyles = {
    margin: 0,
    padding: '16px',
    paddingLeft: '18px',
    fontSize: '13px',
    backgroundColor: '#1e1e1e',
    overflow: 'visible'
  };
  
  // First line of code for preview
  const previewLine = code.trim().split('\n')[0];
  
  // Calculate the number of lines in the code
  const codeLines = code.trim().split('\n');
  const totalLines = codeLines.length;
  const remainingLines = totalLines > 1 ? totalLines - 1 : 0;
  
  // Cast SyntaxHighlighter as any to avoid typing issues
  const SyntaxHighlighterComponent = SyntaxHighlighter as any;
  
  // Stop event propagation to prevent collapsing
  const handleContentInteraction = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };
  
  // Toggle expanded state
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  
  return (
    <div 
      style={containerStyles} 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        style={headerStyles} 
        onClick={toggleExpand}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {getIconForFile(filename)}
          <span style={{ marginLeft: '8px' }}>{filename}</span>
          {isGenerating && (
            <div style={loadingIndicatorStyles}>
              <span style={pulseStyle} className="pulse-dot"></span>
              Generating...
            </div>
          )}
        </div>
        <span style={{ 
          color: '#888', 
          fontSize: '12px', 
          display: 'flex', 
          alignItems: 'center',
          gap: '4px' 
        }}>
          {isExpanded ? 'Hide' : 'Show'} 
          <span>{isExpanded ? '▼' : '▶'}</span>
        </span>
      </div>
      
      {/* Show a preview when collapsed and not generating */}
      {!isExpanded && !isGenerating && previewLine && (
        <>
          <div style={codePreviewStyles}>
            {previewLine.length > 80 ? previewLine.substring(0, 77) + '...' : previewLine}
          </div>
          {remainingLines > 0 && (
            <div style={lineCountStyles}>
              <span style={{ marginLeft: '2px' }}>... ({remainingLines} line{remainingLines !== 1 ? 's' : ''} remaining)</span>
            </div>
          )}
        </>
      )}
      
      {/* Show the full code when expanded */}
      {isExpanded && !isGenerating && (
        <div 
          ref={contentRef} 
          className="code-content-container"
          onClick={handleContentInteraction}
          onDoubleClick={handleContentInteraction}
          onMouseDown={handleContentInteraction}
          onMouseUp={handleContentInteraction}
          onMouseMove={handleContentInteraction}
          onScroll={handleContentInteraction}
          onWheel={handleContentInteraction}
          onKeyDown={handleContentInteraction}
          onKeyUp={handleContentInteraction}
        >
          <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 20 }}>
            <CopyButton content={code} />
            {filename && <InsertButton content={code} />}
            {message?.role === 'assistant' && <ProcessFilesButton content={message.content} />}
          </div>
          <div style={codeContainerStyles} className="hide-scrollbar">
            <SyntaxHighlighterComponent
              language={language}
              style={vscDarkPlus}
              customStyle={codeStyles}
              wrapLines={true}
              wrapLongLines={true}
            >
              {code}
            </SyntaxHighlighterComponent>
          </div>
        </div>
      )}
    </div>
  );
};

// Global registry to track already executed commands
// This will persist across re-renders and component remounts
const executedCommandsRegistry = new Set<string>();
// Store detailed command execution information
const commandExecutionsRegistry: Record<string, CommandExecution> = {};

// Helper function to extract parameters from a command string
const extractCommandParameters = (command: string): Record<string, any> => {
  const params: Record<string, any> = {};
  
  // Extract command name (first word)
  const commandName = command.trim().split(/\s+/)[0];
  params.commandName = commandName;
  
  // Extract flags and arguments
  const flagRegex = /--(\w+)(?:=([^\s"']+|"[^"]*"|'[^']*'))?|(?:^|\s)-(\w)(?:=([^\s"']+|"[^"]*"|'[^']*'))?/g;
  let match;
  
  while ((match = flagRegex.exec(command)) !== null) {
    const longFlag = match[1];
    const longValue = match[2];
    const shortFlag = match[3];
    const shortValue = match[4];
    
    if (longFlag) {
      // Handle --flag or --flag=value
      params[longFlag] = longValue || true;
    } else if (shortFlag) {
      // Handle -f or -f=value
      params[shortFlag] = shortValue || true;
    }
  }
  
  return params;
};

// Generate a unique ID for a command execution
const generateCommandExecutionId = (command: string, timestamp: number): string => {
  // Generate a simple hash of the command
  let hash = 0;
  for (let i = 0; i < command.length; i++) {
    const char = command.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Combine hash with timestamp for uniqueness
  return `cmd_${Math.abs(hash)}_${timestamp}`;
};

// New component for displaying terminal commands
const CommandBlock: React.FC<{
  command: string;
  mode: 'execute' | 'normal';
  message?: Message;
  existingExecution?: CommandExecution;
}> = ({ command, mode, message, existingExecution }) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [hasExecuted, setHasExecuted] = useState(!!existingExecution);
  const [isExpanded, setIsExpanded] = useState(mode === 'execute' || !!existingExecution);
  const [output, setOutput] = useState<string | null>(existingExecution?.output || null);
  const [error, setError] = useState<string | null>(existingExecution?.error || null);
  const [executionId, setExecutionId] = useState<string | null>(existingExecution?.id || null);
  const [executionTimestamp, setExecutionTimestamp] = useState<number | null>(existingExecution?.timestamp || null);
  const [execCount, setExecCount] = useState(0); // Track multiple executions of same command
  
  // Store message reference so we can update it later
  const messageRef = useRef(message);
  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  // Generate a unique execution ID for this command instance
  const generateExecutionId = useCallback(() => {
    const timestamp = Date.now();
    const randomId = Math.floor(Math.random() * 100000000);
    return `cmd_${randomId}_${timestamp}`;
  }, []);

  // Update message with the executed command information
  const updateMessageWithExecutedCommand = useCallback((cmdExecution: CommandExecution) => {
    if (!messageRef.current) return;
    
    console.log('Updating message with executed command:', cmdExecution);
    
    const msg = messageRef.current;
    const updatedMsg = { ...msg };
    
    // Initialize arrays if they don't exist
    if (!updatedMsg.executedCommands) {
      updatedMsg.executedCommands = [];
    }
    if (!updatedMsg.commandExecutions) {
      updatedMsg.commandExecutions = [];
    }
    
    // Add command to executedCommands if not already present
    if (!updatedMsg.executedCommands.includes(command)) {
      updatedMsg.executedCommands.push(command);
    }
    
    // Add or update execution details
    const existingIndex = updatedMsg.commandExecutions?.findIndex(exec => exec.id === cmdExecution.id);
    
    if (existingIndex !== undefined && existingIndex >= 0) {
      // Update existing execution
      if (updatedMsg.commandExecutions) {
        updatedMsg.commandExecutions[existingIndex] = cmdExecution;
      }
    } else {
      // Add new execution
      updatedMsg.commandExecutions?.push(cmdExecution);
    }
    
    // TODO: Handle updating the message in state - this would require passing down a setter function
    console.log('Updated message:', updatedMsg);
    
    // For now we just update the local state
    // A real implementation would update the parent component's state as well
  }, [command]);

  const executeCommand = useCallback(async () => {
    // Don't execute if already executing
    if (isExecuting) return;
    
    // Always increment execution count when executing
    const newExecCount = execCount + 1;
    setExecCount(newExecCount);
    
    setIsExecuting(true);
    setError(null);
    setOutput(null);
    setIsExpanded(true); // Always expand when executing
    
    const newExecutionId = generateExecutionId();
    setExecutionId(newExecutionId);
    setExecutionTimestamp(Date.now());

    try {
      console.log(`Executing command (count: ${newExecCount}): ${command} (mode: ${mode}, id: ${newExecutionId})`);
      const response = await fetch('/execute-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: command,
          timeout: 30, // 30 second timeout
          executionId: newExecutionId,
        }),
      });

      const data = await response.json();
      console.log("Command execution response:", data);

      // Update execution state
      if (data.executionId) {
        setExecutionId(data.executionId);
      }
      
      if (data.timestamp) {
        setExecutionTimestamp(data.timestamp);
      }
      
      if (data.error) {
        setError(data.error);
      } else {
        setOutput(data.output || "");
      }
      
      // Update message with command execution info
      const cmdExecution: CommandExecution = {
        id: data.executionId || newExecutionId,
        command: command,
        parameters: { execCount: newExecCount },
        timestamp: data.timestamp || Date.now(),
        status: data.error ? 'error' : 'completed',
        output: data.output || "",
        error: data.error || null,
      };
      
      updateMessageWithExecutedCommand(cmdExecution);
      
    } catch (err) {
      console.error("Error executing command:", err);
      setError(`Failed to execute command: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExecuting(false);
      setHasExecuted(true);
    }
  }, [command, isExecuting, mode, execCount, updateMessageWithExecutedCommand, generateExecutionId]);

  // Handle automatic execution for 'execute' mode
  useEffect(() => {
    if (mode === 'execute' && !hasExecuted && !isExecuting) {
      executeCommand();
    }
  }, [mode, hasExecuted, isExecuting, executeCommand]);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Format timestamp
  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return null;
    
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    
    return `${hours}:${minutes}:${seconds} ${ampm}`;
  };

  // Format output with syntax highlighting for Python
  const formatOutput = (text: string) => {
    if (!text) return null;
    
    // Basic syntax highlighting for Python output
    const highlightPythonOutput = (str: string) => {
      return str
        .replace(/(".*?")/g, '<span style="color: #a8d7fe;">$1</span>') // strings
        .replace(/\b(True|False|None)\b/g, '<span style="color: #ff9d45;">$1</span>') // booleans and None
        .replace(/\b(\d+(\.\d+)?)\b/g, '<span style="color: #c586c0;">$1</span>') // numbers
        .replace(/^(>>>|\.\.\.) /gm, '<span style="color: #569cd6;">$1 </span>') // REPL prompts
        .replace(/^(Traceback.*:|Error.*:)/gm, '<span style="color: #ff5555; font-weight: bold;">$1</span>') // error headlines
        .replace(/^(\s*File ".*", line \d+.*)/gm, '<span style="color: #888;">$1</span>') // file references in tracebacks
        .replace(/^(\s*\w+Error:.*)/gm, '<span style="color: #ff5555;">$1</span>'); // error messages
    };
    
    // Apply highlighting and preserve line breaks
    const highlighted = highlightPythonOutput(text);
    
    // Safe to use dangerouslySetInnerHTML as we're not allowing any user HTML input
    return <div dangerouslySetInnerHTML={{ __html: highlighted }} />;
  };

  // Create copy button for output
  const CopyOutputButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);
    
    const copyToClipboard = () => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };
    
    return (
      <button 
        onClick={copyToClipboard}
        style={{
          background: 'none',
          border: 'none',
          color: copied ? '#4CAF50' : '#888',
          cursor: 'pointer',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 6px',
          borderRadius: '4px',
          transition: 'all 0.2s ease'
        }}
      >
        {copied ? (
          <>
            <span style={{ fontSize: '14px' }}>✓</span> Copied
          </>
        ) : (
          <>
            <span style={{ fontSize: '14px' }}>📋</span> Copy
          </>
        )}
      </button>
    );
  };

  return (
    <div className="command-block">
      <div className="command-header" onClick={toggleExpand}>
        <div className="command-prompt">
          <span className="prompt-symbol">$</span>
          <span className="command-text">{command}</span>
        </div>
        <div className="command-controls">
          {!isExecuting && mode === 'normal' && (
            <button 
              className="execute-button" 
              onClick={(e) => {
                e.stopPropagation();
                executeCommand();
              }}
            >
              Execute Command
            </button>
          )}
          {isExecuting && (
            <span className="execution-status running">Running...</span>
          )}
          {hasExecuted && !isExecuting && error && (
            <span className="execution-status error">Failed</span>
          )}
          
          <span className="expand-icon" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            ▼
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="command-output scrollable-output">
          {isExecuting && <div className="executing-indicator">Executing command...</div>}
          
          {error && (
            <div className="error-container">
              <pre className="error-output">{error}</pre>
              {error && <CopyOutputButton text={error} />}
            </div>
          )}
          
          {output !== null && output !== "" && (
            <div className="output-container">
              <pre className="success-output">
                {formatOutput(output)}
              </pre>
              {output && <CopyOutputButton text={output} />}
            </div>
          )}
          
          {!isExecuting && hasExecuted && output === "" && (
            <pre className="success-output">Command executed successfully with no output.</pre>
          )}
          
          <div className="execution-metadata">
            <div>
              {executionId && (
                <div className="execution-id">Execution ID: {executionId}</div>
              )}
              {executionTimestamp && (
                <div className="execution-timestamp">Time: {formatTimestamp(executionTimestamp)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MessageRenderer: React.FC<{ message: Message }> = ({ message }) => {
  const [processedContent, setProcessedContent] = useState(message.content);

  useEffect(() => {
    let mounted = true;
    
    const processContent = async () => {
      try {
        // First clean up any backticks in the AI response if it's from the assistant
        let processed = message.role === 'assistant' 
          ? cleanAIResponse(message.content) 
          : message.content;
        
        // Process complete code pointer blocks
        const pointerRegex = /Pointer:Code\+(.*?):start\s*([\s\S]*?)\s*Pointer:Code\+\1:end/g;
        processed = processed.replace(pointerRegex, (match, filename, code) => {
          // Clean up the code: remove extra line breaks and normalize indentation
          const lines = code.trim().split('\n');
          
          // Find the minimum indentation level (ignoring empty lines)
          const minIndent = lines
            .filter((line: string) => line.trim())
            .reduce((min: number, line: string) => {
              const indent = line.match(/^\s*/)?.[0].length || 0;
              return Math.min(min, indent);
            }, Infinity);

          // Remove the common indentation but preserve relative indentation
          const cleanCode = lines
            .map((line: string) => {
              if (!line.trim()) return '';
              const currentIndent = line.match(/^\s*/)?.[0].length || 0;
              return ' '.repeat(Math.max(0, currentIndent - minIndent)) + line.trim();
            })
            .join('\n');
          
          // Get language from file extension
          const language = filename.split('.').pop() || '';
          
          // Add a special marker to identify this as a code pointer block
          return `\`\`\`${language}\n@pointer:${filename}\n${cleanCode}\n\`\`\``;
        });
        
        // Process command pointer blocks
        const commandRegex = /@pointer:command\+(execute|normal):start\s*([\s\S]*?)\s*@pointer:command\+\1:end/g;
        processed = processed.replace(commandRegex, (match, mode, command) => {
          const cleanCommand = command.trim();
          // Add a special marker to identify this as a command pointer block
          return `\`\`\`command-${mode}\n${cleanCommand}\n\`\`\``;
        });
        
        // Process incomplete code blocks - replace them with placeholder markers
        // that will be rendered as the loading indicator
        const incompleteBlockRegex = /Pointer:Code\+(.*?):start\s*([\s\S]*?)(?=$|Pointer:Code\+(?!\1))/g;
        processed = processed.replace(incompleteBlockRegex, (match, filename) => {
          // Check if this is truly incomplete (doesn't have an end tag)
          if (!match.includes(`Pointer:Code+${filename}:end`)) {
            // This is an incomplete block, replace with placeholder
            return `\`\`\`generating\n@incomplete:${filename}\n\`\`\``;
          }
          return match; // Not incomplete, leave as is
        });

        if (mounted) {
          setProcessedContent(processed);
        }
      } catch (error) {
        console.error('Error processing message content:', error instanceof Error ? error.message : String(error));
        if (mounted) {
          setProcessedContent(message.content);
        }
      }
    };

    processContent();

    return () => {
      mounted = false;
    };
  }, [message.content, message.role]);

  return (
    <ReactMarkdown
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !String(children).includes('\n');
          
          if (isInline) {
            return (
              <code
                className={className}
                style={{
                  backgroundColor: '#2a2a2a',
                  padding: '0.2em 0.4em',
                  borderRadius: '3px',
                  fontFamily: 'monospace',
                  fontSize: '85%'
                }}
                {...props}
              >
                {children}
              </code>
            );
          }

          const value = String(children).replace(/\n$/, '');
          
          // Check if this is a command block
          const commandMatch = /^language-command-(execute|normal)$/.exec(className || '');
          if (commandMatch) {
            const mode = commandMatch[1] as 'execute' | 'normal';
            
            // Find existing command execution data if available
            const existingExecution = message?.commandExecutions?.find(
              exec => exec.command === value
            );
            
            return (
              <CommandBlock
                command={value}
                mode={mode}
                message={message}
                existingExecution={existingExecution}
              />
            );
          }
          
          // Check if this is a loading/generating placeholder
          if (className === 'language-generating') {
            const incompleteMatch = value.match(/^@incomplete:(.*?)$/);
            if (incompleteMatch) {
              const filename = incompleteMatch[1];
              const language = getLanguageFromFilename(filename);
              
              return (
                <CodeBlock
                  filename={filename}
                  language={language}
                  isGenerating={true}
                />
              );
            }
          }
          
          // Check if this is a code pointer block
          const pointerMatch = value.match(/^@pointer:(.*)\n([\s\S]*)$/);
          
          if (pointerMatch) {
            const [_, filename, code] = pointerMatch;
            const language = className?.replace('language-', '') || 
                             getLanguageFromFilename(filename);
            
            return (
              <CodeBlock
                filename={filename}
                language={language}
                code={code}
                message={message}
              />
            );
          }

          // Handle regular code blocks
          let filename = '';
          let code = value;
          
          // Check for pointer marker in the first line
          const lines = code.split('\n');
          if (lines[0] && lines[0].startsWith('@pointer:')) {
            filename = lines[0].substring(9).trim();
            code = lines.slice(1).join('\n');
          }

          // Extract language from className
          const language = className?.replace('language-', '') || '';
          
          return (
            <CodeBlock
              filename={filename || `file.${language}`}
                  language={language}
              code={code}
              message={message}
            />
          );
        },
        // Add styles for list items
        ol: ({ children, ...props }) => (
          <ol style={{ paddingLeft: '2em', margin: '0.5em 0' }} {...props}>
            {children}
          </ol>
        ),
        ul: ({ children, ...props }) => (
          <ul style={{ paddingLeft: '2em', margin: '0.5em 0' }} {...props}>
            {children}
          </ul>
        ),
        li: ({ children, ...props }) => (
          <li style={{ margin: '0.25em 0' }} {...props}>
            {children}
          </li>
        )
      }}
      className="markdown-content"
    >
      {processedContent}
    </ReactMarkdown>
  );
};

const RelevantFilesList: React.FC<{ files: RelevantFile[]; keywords: string[] }> = ({ files, keywords }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!files || files.length === 0) return null;

  return (
    <div className="relevant-files-container" style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      backgroundColor: 'var(--bg-primary)',
      marginBottom: '12px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
          backgroundColor: 'var(--bg-secondary)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Relevant Files ({files.length})</span>
          {keywords.length > 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
              Keywords: {keywords.join(', ')}
            </span>
          )}
        </div>
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 12 12" 
          style={{ 
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}
        >
          <path 
            d="M2 4L6 8L10 4" 
            stroke="currentColor" 
            fill="none" 
            strokeWidth="2"
          />
        </svg>
      </div>
      {isExpanded && (
        <div style={{ 
          padding: '8px 12px', 
          maxHeight: '200px', 
          overflowY: 'auto',
          backgroundColor: 'var(--bg-primary)',
          borderBottomLeftRadius: '4px',
          borderBottomRightRadius: '4px'
        }}>
          {files.map((file, index) => (
            <div 
              key={file.path} 
              style={{
                padding: '4px 8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: index % 2 === 0 ? 'var(--bg-secondary)' : 'transparent',
                borderRadius: '2px'
              }}
            >
              <span style={{ flex: 1 }}>{file.path}</span>
              <span style={{ 
                color: 'var(--text-secondary)',
                fontSize: '0.9em',
                marginLeft: '12px'
              }}>
                {file.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export function LLMChat({ isVisible, onClose, onResize, currentChatId, onSelectChat }: LLMChatProps) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_SYSTEM_MESSAGE]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<number | null>(null);
  const [truncatedMessages, setTruncatedMessages] = useState<Message[]>([]);
  const [showCompletions, setShowCompletions] = useState(false);
  const [completions, setCompletions] = useState<FileCompletion[]>([]);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [isChatListVisible, setIsChatListVisible] = useState(false);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [width, setWidth] = useState(400);
  const [isLMStudioConnected, setIsLMStudioConnected] = useState(false);
  const [isLMStudioChecking, setIsLMStudioChecking] = useState(true);
  const [isLMStudioEnabled, setIsLMStudioEnabled] = useState(false);
  const [isLMStudioRetrying, setIsLMStudioRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<string[]>([]);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isProcessingCancelled, setIsProcessingCancelled] = useState(false);
  const [isProcessingComplete, setIsProcessingComplete] = useState(false);
  const [isProcessingStarted, setIsProcessingStarted] = useState(false);
  const [totalFiles, setTotalFiles] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string | null>(null);
  const [processingSpeed, setProcessingSpeed] = useState<string | null>(null);
  const [processingStats, setProcessingStats] = useState<{
    totalFiles: number;
    processedFiles: number;
    errorFiles: number;
    startTime: number | null;
    endTime: number | null;
  }>({
    totalFiles: 0,
    processedFiles: 0,
    errorFiles: 0,
    startTime: null,
    endTime: null,
  });
  const [relevantFiles, setRelevantFiles] = useState<RelevantFile[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeStartX = useRef<number>(0);
  const startWidth = useRef<number>(0);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Add event listener for showLLMChat event
  useEffect(() => {
    const handleShowLLMChat = (event: CustomEvent<{ input: string; selection?: string }>) => {
      const { input, selection } = event.detail;
      
      // If there's a selection, include it in the prompt
      const fullPrompt = selection 
        ? `${input}\n\nSelected code:\n\`\`\`\n${selection}\n\`\`\``
        : input;
        
      setInput(fullPrompt);
      if (!isVisible) {
        onClose(); // This typically toggles visibility
      }
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    };

    window.addEventListener('showLLMChat', handleShowLLMChat as EventListener);
    return () => {
      window.removeEventListener('showLLMChat', handleShowLLMChat as EventListener);
    };
  }, [isVisible, onClose]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    startWidth.current = width;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const deltaX = resizeStartX.current - e.clientX;
    const newWidth = Math.min(Math.max(startWidth.current + deltaX, 300), 800);
    setWidth(newWidth);
    if (onResize) {
      onResize(newWidth);
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  // Add mouse event handlers for resizing
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const isNearBottom = () => {
    const container = chatContainerRef.current;
    if (!container) return true;
    
    const threshold = 100; // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  const handleScroll = () => {
    setIsScrolledToBottom(isNearBottom());
  };

  const scrollToBottom = () => {
    if (isScrolledToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isScrolledToBottom]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsProcessing(false);
    }
  };

  const handleMessageSelect = (index: number) => {
    if (isProcessing) return;
    
    // Get the actual messages without system message
    const visibleMessages = messages.filter(m => m.role !== 'system');
    const actualMessage = visibleMessages[index];
    const actualIndex = messages.findIndex(m => m === actualMessage);
    
    // Only allow selecting user messages
    if (actualMessage.role !== 'user') return;

    setSelectedMessageIndex(actualIndex);
    setInput(actualMessage.content);
    
    // Store truncated messages before truncating
    const messagesToTruncate = messages.slice(actualIndex + 1);
    if (messagesToTruncate.length > 0) {
      setTruncatedMessages(messagesToTruncate);
    }
    // Truncate messages to this point
    setMessages(prev => prev.slice(0, actualIndex + 1));
  };

  const handleClearSelection = (e: React.MouseEvent) => {
    e.preventDefault();
    const selectedMessage = selectedMessageIndex !== null ? messages[selectedMessageIndex] : null;
    const isUnchanged = selectedMessage?.role === 'user' && selectedMessage.content === input;

    if (isUnchanged && truncatedMessages.length > 0) {
      // Restore truncated messages if nothing changed
      setMessages(prev => [...prev, ...truncatedMessages]);
      setTruncatedMessages([]);
    }
    
    setSelectedMessageIndex(null);
    setInput('');
  };

  const getRelevantFiles = async (query: string): Promise<RelevantFilesResponse> => {
    try {
      const response = await fetch('http://localhost:23816/get-relevant-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          max_files: 10,
          include_content: true
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch relevant files');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching relevant files:', error);
      return { files: [], keywords: [] };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    try {
      setIsProcessing(true);
      setShowScrollButton(false);

      // First, get relevant files based on the input
      const relevantFilesResponse = await getRelevantFiles(input);
      setRelevantFiles(relevantFilesResponse.files);
      setKeywords(relevantFilesResponse.keywords);

      // Then, get the contents of the relevant files
      const fileContents = await fetch('http://localhost:23816/get-file-contents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(relevantFilesResponse.files.map(f => f.path))
      }).then(res => res.json());

      const newMessage: Message = {
        role: 'user',
        content: input,
        relevantFiles: relevantFilesResponse.files.map(f => ({ path: f.path, score: f.score })),
        keywords: relevantFilesResponse.keywords
      };

      // Create a context message with file information
      const contextMessage: Message = {
        role: 'system',
        content: `CRITICAL FORMATTING REQUIREMENT:
You MUST format ALL code responses using this exact format:
Pointer:Code+filename.ext:start
code here
Pointer:Code+filename.ext:end

Example - when showing Python code:
Pointer:Code+example.py:start
def example():
    return "Hello"
Pointer:Code+example.py:end

Current workspace context:
Relevant files (sorted by relevance):
${relevantFilesResponse.files.map(file => 
`File: ${file.path} (${file.score})
${fileContents[file.path] || '[Content not available]'}`
).join('\n\n')}

Keywords extracted: ${relevantFilesResponse.keywords.join(', ')}

FINAL REMINDER:
1. NEVER use \`\`\` code blocks
2. ALWAYS wrap code in Pointer:Code tags
3. ALWAYS include a descriptive filename
4. Format EVERY code snippet this way`
      };

      setMessages(prev => [...prev, contextMessage, newMessage]);
      setInput('');

      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController();

      // Add a temporary message for streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Get model configuration from localStorage
      const modelConfigStr = localStorage.getItem('modelConfig');
      const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : {
        name: 'deepseek-coder-v2-lite-instruct',
        temperature: 0.7,
        maxTokens: -1,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      };

      // Prepare messages array
      const messagesForAPI = [
        INITIAL_SYSTEM_MESSAGE,
        {
          role: 'system' as const,
          content: 'Remember: ALL code must be wrapped in Pointer:Code tags with a filename.'
        },
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        contextMessage,
        newMessage
      ];

      await lmStudio.createStreamingChatCompletion({
        model: modelConfig.name,
        messages: messagesForAPI,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
        top_p: modelConfig.topP,
        frequency_penalty: modelConfig.frequencyPenalty,
        presence_penalty: modelConfig.presencePenalty,
        onUpdate: (content: string) => {
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: 'assistant',
              content: content
            };
            return newMessages;
          });
        }
      });

    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setIsProcessing(false);
    }
  };

  // Update the loadChats function
  const loadChats = async () => {
    console.log('Loading chats...');
    try {
      const response = await fetch('http://localhost:23816/chats');
      if (!response.ok) {
        throw new Error('Failed to load chats');
      }
      const loadedChats = await response.json();
      console.log('Loaded chats:', loadedChats);
      setChats(loadedChats);
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  // Update the handleSelectChat function
  const handleSelectChat = async (chatId: string) => {
    console.log('handleSelectChat called with ID:', chatId);
    try {
      const response = await fetch(`http://localhost:23816/chats/${chatId}`);
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to load chat: ${response.status}`);
      }
      
      const chat = await response.json();
      console.log('Loaded chat data:', chat);
      
      if (chat && Array.isArray(chat.messages)) {
        // Ensure we have the system message
        const systemMessage = chat.messages.find((m: Message) => m.role === 'system');
        const updatedMessages = systemMessage 
          ? chat.messages 
          : [INITIAL_SYSTEM_MESSAGE, ...chat.messages];
        
        setMessages(updatedMessages);
        onSelectChat(chatId);
        console.log('Updated messages:', updatedMessages);
      } else {
        console.error('Invalid chat data received:', chat);
        // If invalid data, start a new chat with system message
        setMessages([INITIAL_SYSTEM_MESSAGE]);
      }
      setIsChatListVisible(false);
    } catch (error) {
      console.error('Error loading chat:', error);
      // On error, start a new chat with system message
      setMessages([INITIAL_SYSTEM_MESSAGE]);
    }
  };

  // Update the handleNewChat function
  const handleNewChat = () => {
    console.log('handleNewChat called');
    const newChatId = uuidv4();
    console.log('Generated new chat ID:', newChatId);
    
    // Reset messages to initial state with system message
    setMessages([INITIAL_SYSTEM_MESSAGE]);
    setInput('');
    setSelectedMessageIndex(null);
    setTruncatedMessages([]);
    
    // Update the current chat ID
    onSelectChat(newChatId);
    
    // Close the chat list
    setIsChatListVisible(false);
  };

  // Add useEffect to load initial chat
  useEffect(() => {
    if (currentChatId) {
      handleSelectChat(currentChatId);
    }
  }, [currentChatId]);

  const handleFileUpload = async () => {
    try {
      const currentFile = window.getCurrentFile?.();
      if (!currentFile) {
        setInput(prev => prev + "\nNo file is currently open.");
        return;
      }

      const content = await FileSystemService.readFile(currentFile.path);
      const fileExtension = currentFile.path.split('.').pop() || '';
      
      setInput(prev => prev + `\n\nHere's the content of ${currentFile.path}:\n\n\`\`\`${fileExtension}\n${content}\n\`\`\``);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      console.error('Error reading file:', error);
      setInput(prev => prev + "\nError reading file: " + errorMessage);
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200); // Max height of 200px
      textarea.style.height = `${newHeight}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]); // Resize when input changes

  const getFileCompletions = async (partial: string) => {
    try {
      const response = await fetch(`http://localhost:23816/completions?partial=${encodeURIComponent(partial)}`);
      if (!response.ok) throw new Error('Failed to get completions');
      const items = await response.json();
      return items;
    } catch (error) {
      console.error('Error getting completions:', error);
      return [];
    }
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);

    // Check if we should show completions
    const lastAtIndex = newValue.lastIndexOf('@');
    if (lastAtIndex !== -1 && lastAtIndex === newValue.length - 1) {
      // Just typed @, show all files
      const completions = await getFileCompletions('');
      setCompletions(completions);
      setShowCompletions(true);
      setCompletionIndex(0);
    } else if (lastAtIndex !== -1) {
      // Get the partial path after @
      const partial = newValue.slice(lastAtIndex + 1);
      const completions = await getFileCompletions(partial);
      setCompletions(completions);
      setShowCompletions(true);
      setCompletionIndex(0);
    } else {
      setShowCompletions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCompletions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCompletionIndex(prev => (prev + 1) % completions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCompletionIndex(prev => (prev - 1 + completions.length) % completions.length);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        if (completions[completionIndex]) {
          const lastAtIndex = input.lastIndexOf('@');
          const newValue = input.slice(0, lastAtIndex) + '@' + completions[completionIndex].path;
          setInput(newValue);
          setShowCompletions(false);
        }
      } else if (e.key === 'Escape') {
        setShowCompletions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Load chats on mount
  useEffect(() => {
    loadChats().catch(error => {
      console.error('Error in loadChats effect:', error);
    });
  }, []);

  // Save chat when messages change
  useEffect(() => {
    const saveCurrentChat = async () => {
      console.log('Saving chat, messages length:', messages.length);
      if (messages.length > 1 && currentChatId) {
        try {
          // Filter out system messages that contain file contents
          const cleanedMessages = messages.map(msg => ({
            ...msg,
            // Remove content from system messages that contain file contents
            content: msg.role === 'system' && msg.content.includes('Current workspace context:') 
              ? INITIAL_SYSTEM_MESSAGE.content 
              : msg.content,
            // Preserve executedCommands even when cleaning content
            executedCommands: msg.executedCommands || [] 
          }));

          const response = await fetch(`http://localhost:23816/chats/${currentChatId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: currentChatId,
              name: `Chat ${new Date().toLocaleString()}`,
              createdAt: new Date().toISOString(),
              messages: cleanedMessages,
            }),
          });
          
          if (!response.ok) {
            throw new Error('Failed to save chat');
          }
          
          // Reload the chat list after saving
          loadChats();
        } catch (error) {
          console.error('Error saving chat:', error);
        }
      }
    };

    saveCurrentChat();
  }, [messages, currentChatId]);

  // Add click outside handler to close the chat list
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isChatListVisible) {
        const target = event.target as HTMLElement;
        if (!target.closest('.chat-switcher')) {
          setIsChatListVisible(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isChatListVisible]);

  if (!isVisible) return null;

  return (
    <div
      style={{
        width: `${width}px`,
        height: '100%',
        backgroundColor: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border-primary)',
        display: 'flex',
        flexDirection: 'column',
        position: 'absolute',
        right: 0,
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        className="resize-handle"
        style={{
          background: isResizing ? 'var(--accent-color)' : undefined,
        }}
      />

      <div
        style={{
          padding: '8px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 5, color: 'var(--text-primary)', fontSize: '13px' }}>Builder</h3>
          <div style={{ position: 'relative' }}>
            <div className="chat-switcher">
              <button
                onClick={() => setIsChatListVisible(!isChatListVisible)}
                className="settings-button"
                title="Switch Chats"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>

              {isChatListVisible && (
                <div
                  className="chat-switcher-dropdown"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
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
                      onClick={(e) => {
                        e.preventDefault();
                        handleNewChat();
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
                      className="chat-button"
                      onClick={() => handleSelectChat(chat.id)}
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
          <button
            onClick={() => setIsSettingsVisible(true)}
            className="settings-button"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <button
          onClick={onClose}
          className="close-button"
        >
          ✕
        </button>
      </div>

      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <RelevantFilesList files={relevantFiles} keywords={keywords} />
        {messages.filter(message => message.role !== 'system').length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontStyle: 'italic',
          }}>
            No messages yet. Start a conversation!
          </div>
        ) : (
          messages
            .filter(message => message.role !== 'system')
            .map((message, index) => (
              <div
                key={index}
                onClick={() => message.role === 'user' && handleMessageSelect(index)}
                style={{
                  backgroundColor: message.role === 'user' ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  lineHeight: '1.4',
                  cursor: message.role === 'user' ? 'pointer' : 'default',
                  position: 'relative',
                  opacity: selectedMessageIndex !== null && index > selectedMessageIndex ? 0.5 : 1,
                  border: index === selectedMessageIndex ? '1px solid var(--accent-color)' : 'none',
                }}
              >
                <div style={{ 
                  color: 'var(--text-secondary)', 
                  fontSize: '11px', 
                  marginBottom: '4px',
                  fontWeight: 500,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                  {index === selectedMessageIndex && (
                    <span style={{ fontSize: '10px', color: 'var(--accent-color)' }}>Selected</span>
                  )}
                </div>
                <div className="markdown-body">
                  <MessageRenderer message={message} />
                </div>
              </div>
            ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          padding: '12px',
          borderTop: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {selectedMessageIndex !== null && (
          <div style={{
            fontSize: '11px',
            color: 'var(--accent-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <span>Editing from selected message</span>
            <button
              onClick={handleClearSelection}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 4px',
                cursor: 'pointer',
                fontSize: '11px',
                color: 'var(--text-secondary)',
              }}
            >
              Clear ✕
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ 
            flex: 1, 
            display: 'flex',
            gap: '8px',
            background: 'var(--bg-secondary)',
            padding: '8px',
            borderRadius: '4px',
            position: 'relative',
          }}>
            <button
              type="button"
              onClick={handleFileUpload}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Share current file"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              style={{
                flex: 1,
                border: 'none',
                background: 'none',
                resize: 'none',
                padding: '0',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'inherit',
                minHeight: '24px', // Slightly increased from 20px
                maxHeight: '200px',
                outline: 'none',
                overflowY: 'auto',
              }}
              rows={1}
            />
            {showCompletions && completions.length > 0 && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                maxHeight: '200px',
                overflowY: 'auto',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
                zIndex: 1000,
              }}>
                {completions.map((completion, index) => (
                  <div
                    key={completion.path}
                    onClick={() => {
                      const lastAtIndex = input.lastIndexOf('@');
                      const newValue = input.slice(0, lastAtIndex) + '@' + completion.path;
                      setInput(newValue);
                      setShowCompletions(false);
                    }}
                    style={{
                      padding: '6px 12px',
                      cursor: 'pointer',
                      background: index === completionIndex ? 'var(--bg-hover)' : 'none',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {completion.type === 'directory' ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                      </svg>
                    )}
                    {completion.path}
                  </div>
                ))}
              </div>
            )}
          </div>
          {isProcessing ? (
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-error)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
              type="button"
            >
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: '1px solid var(--border-primary)',
                background: input.trim() ? 'var(--accent-color)' : 'var(--bg-secondary)',
                color: input.trim() ? 'white' : 'var(--text-secondary)',
                cursor: input.trim() ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Send
            </button>
          )}
        </div>
      </form>

      <Settings isVisible={isSettingsVisible} onClose={() => setIsSettingsVisible(false)} />
    </div>
  );
} 