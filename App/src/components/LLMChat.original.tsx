import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import lmStudio from '../services/LMStudioService';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { v4 as uuidv4 } from 'uuid';
import '../styles/LLMChat.css';
import { DiffViewer } from './DiffViewer';
import { FileChangeEventService } from '../services/FileChangeEventService';
import { AIFileService } from '../services/AIFileService';
import { Message } from '../types';
import { FileSystemService } from '../services/FileSystemService';
import agentService from '../services/AgentService';

// Extend the Message interface to include attachments
interface ExtendedMessage extends Message {
  attachments?: AttachedFile[];
  tool_calls?: any[];
}

interface ChatSession {
  id: string;
  name: string;
  createdAt: string;
  messages: ExtendedMessage[];
}

// Add interface for attached files
interface AttachedFile {
  name: string;
  path: string;
  content: string;
}

interface LLMChatProps {
  isVisible: boolean;
  onClose: () => void;
  onResize?: (width: number) => void;
  currentChatId: string;
  onSelectChat: (chatId: string) => void;
}

// Simplified system message
const INITIAL_SYSTEM_MESSAGE: ExtendedMessage = {
  role: 'system',
  content: `You are a helpful AI assistant that can assist with coding tasks.

When sharing code examples, you can specify a filename by using the format:
\`\`\`language:filename.ext
// code goes here
\`\`\`

For example:
\`\`\`javascript:app.js
const hello = "world";
console.log(hello);
\`\`\`

This will display the filename above the code block to provide better context.`,
  attachments: undefined
};

// Combined actions button component for code blocks
const CodeActionsButton: React.FC<{ content: string; filename: string }> = ({ content, filename }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setIsOpen(false);
  };

  const handleInsert = async () => {
    setIsProcessing(true);
    // Declare originalContent at the function scope so it's accessible in the catch blocks
    let originalContent = '';
    
    try {
      // Check if file exists first
      
      // Get directory path for the file
      const directoryPath = filename.substring(0, filename.lastIndexOf('/'));
      
      try {
        // Try to read the file
        const response = await fetch(`http://localhost:23816/read-file?path=${encodeURIComponent(filename)}`);
        if (response.ok) {
          originalContent = await response.text();
        } else {
          // If file doesn't exist, check if we need to create directories
          if (directoryPath) {
            // Try to create the directory structure
            const createDirResponse = await fetch(`http://localhost:23816/create-directory`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                parentId: 'root_' + directoryPath.split('/')[0], // Use root as parent for first level
                name: directoryPath.split('/').pop() || ''
              })
            });
            
            if (!createDirResponse.ok) {
              console.log(`Created directory structure: ${directoryPath}`);
            }
          }
          
          // For non-existing files, we'll use empty content
          originalContent = '';
        }
      } catch (error) {
        console.error('Error reading file:', error);
        // For errors, use empty content
        originalContent = '';
      }

      // Get model ID for insert purpose
      const insertModelId = await AIFileService.getModelIdForPurpose('insert');
      
      // Get insert model settings from localStorage
      const insertModelConfigStr = localStorage.getItem('insertModelConfig');
      const insertModelConfig = insertModelConfigStr ? JSON.parse(insertModelConfigStr) : {
        temperature: 0.2,
        maxTokens: -1,
      };

      // Create a prompt for the AI to merge the changes
      const mergePrompt = `You are a code merging expert. You need to analyze and merge code changes intelligently.

${originalContent ? `EXISTING FILE (${filename}):\n\`\`\`\n${originalContent}\n\`\`\`\n` : `The file ${filename} is new and will be created.\n`}

${originalContent ? 'NEW CHANGES:' : 'NEW FILE CONTENT:'}
\`\`\`
${content}
\`\`\`

Task:
${originalContent ? 
  '1. If the new changes are a complete file, determine if they should replace the existing file entirely\n2. If the new changes are partial (e.g., a single function), merge them into the appropriate location\n3. Preserve any existing functionality that isn\'t being explicitly replaced' : 
  '1. This is a new file, so use the provided content directly.'
}
4. Ensure the merged code is properly formatted and maintains consistency
5. Consider the project structure when merging (e.g., for imports)

Return ONLY the final merged code without any explanations. The code should be ready to use as-is.`;

      // Use the chat completions endpoint for merging
      const result = await lmStudio.createChatCompletion({
        model: insertModelId,
        messages: [
          {
            role: 'system',
            content: 'You are a code merging expert. Return only the merged code without any explanations.'
          },
          {
            role: 'user',
            content: mergePrompt
          }
        ],
        temperature: insertModelConfig.temperature || 0.2,
        max_tokens: insertModelConfig.maxTokens || -1,
        stream: false
      });

      const mergedContent = result.choices[0].message.content.trim();

      // Use the FileChangeEventService to trigger the diff viewer
      FileChangeEventService.emitChange(filename, originalContent, mergedContent);
    } catch (error) {
      console.error('Error during insert:', error);
      // Fallback to using the chat model if the Insert-Model fails
      try {
        console.log('Falling back to chat model for insertion...');
        
        // Get chat model ID for fallback
        const chatModelId = await AIFileService.getModelIdForPurpose('chat');
        
        // Get chat model settings from localStorage
        const modelConfigStr = localStorage.getItem('modelConfig');
        const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : {
          temperature: 0.3,
          maxTokens: -1,
          frequencyPenalty: 0,
          presencePenalty: 0,
        };

        // Create a prompt for the AI to merge the changes
        const mergePrompt = `You are a code merging expert. You need to analyze and merge code changes intelligently.

${originalContent ? `EXISTING FILE (${filename}):\n\`\`\`\n${originalContent}\n\`\`\`\n` : `The file ${filename} is new and will be created.\n`}

${originalContent ? 'NEW CHANGES:' : 'NEW FILE CONTENT:'}
\`\`\`
${content}
\`\`\`

Task:
${originalContent ? 
  '1. If the new changes are a complete file, determine if they should replace the existing file entirely\n2. If the new changes are partial (e.g., a single function), merge them into the appropriate location\n3. Preserve any existing functionality that isn\'t being explicitly replaced' : 
  '1. This is a new file, so use the provided content directly.'
}
4. Ensure the merged code is properly formatted and maintains consistency
5. Consider the project structure when merging (e.g., for imports)

Return ONLY the final merged code without any explanations. The code should be ready to use as-is.`;

        // Use the lmStudio service for merging
        const result = await lmStudio.createChatCompletion({
          model: chatModelId,
          messages: [
            {
              role: 'system',
              content: 'You are a code merging expert. Return only the merged code without any explanations.'
            },
            {
              role: 'user',
              content: mergePrompt
            }
          ],
          temperature: modelConfig.temperature || 0.3,
          max_tokens: modelConfig.maxTokens || -1,
          stream: false
        });

        const mergedContent = result.choices[0].message.content.trim();

        // Use the FileChangeEventService to trigger the diff viewer
        FileChangeEventService.emitChange(filename, originalContent, mergedContent);
      } catch (fallbackError) {
        console.error('Fallback insertion also failed:', fallbackError);
      }
    } finally {
      setIsProcessing(false);
      setIsOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'absolute',
          right: '10px',
          top: '10px',
          background: 'rgba(30, 30, 30, 0.7)',
          border: 'none',
          borderRadius: '4px',
          padding: '6px 10px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          backdropFilter: 'blur(3px)',
          fontSize: '12px',
          fontWeight: 'bold',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          zIndex: 5,
        }}
        title="Code actions"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: '10px',
            top: '40px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            zIndex: 6,
            minWidth: '150px',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              color: copied ? 'var(--accent-color)' : 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy code'}
          </button>
          {filename && (
            <button
              onClick={handleInsert}
              disabled={isProcessing}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'none',
                border: 'none',
                color: isProcessing ? 'var(--accent-color)' : 'var(--text-primary)',
                cursor: isProcessing ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isProcessing) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {isProcessing ? (
                <svg 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  style={{ animation: 'spin 1s linear infinite' }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              )}
              {isProcessing ? 'Inserting...' : 'Insert code'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Update CollapsibleCodeBlock component to use the new combined button
const CollapsibleCodeBlock: React.FC<{ language: string; filename?: string; content: string }> = ({ language, filename, content }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  
  // Calculate if the code block should be collapsible
  const lines = content.split('\n');
  const shouldBeCollapsible = lines.length > 10; // Only collapse if more than 10 lines
  const isCollapsible = shouldBeCollapsible && isCollapsed;
  
  return (
    <div 
      style={{ 
        position: 'relative', 
        marginTop: '15px',
        marginBottom: '15px',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        border: '1px solid var(--border-primary)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            background: 'rgba(40, 44, 52, 0.9)',
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            backdropFilter: 'blur(3px)',
            zIndex: 4,
          }}
        >
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{ marginRight: '8px' }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          {filename || `${language}.${getFileExtension(language)}`}
        </div>
        <CodeActionsButton content={content} filename={filename || ''} />
      </div>
      <div style={{ 
        maxHeight: isCollapsible ? '200px' : 'none',
        overflow: 'hidden',
        transition: 'max-height 0.3s ease-out'
      }}>
        <SyntaxHighlighter
              language={language}
          style={vscDarkPlus as any}
              wrapLines={true}
          showLineNumbers={true}
          lineNumberStyle={{ 
            minWidth: '2.5em', 
            paddingRight: '1em', 
            color: 'rgba(150, 150, 150, 0.5)',
            textAlign: 'right',
            userSelect: 'none',
            borderRight: '1px solid rgba(100, 100, 100, 0.4)',
            marginRight: '10px',
            background: 'transparent'
          }}
          customStyle={{
            margin: '0',
            padding: '16px 0',
            paddingTop: '40px',
            borderRadius: '8px',
            fontSize: '13px',
            backgroundColor: 'var(--bg-code)',
            overflowX: 'auto',
          }}
          codeTagProps={{
            style: {
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              padding: '0 16px',
              background: 'transparent'
            }
          }}
          lineProps={(lineNumber) => ({
            style: {
              backgroundColor: 'transparent',
              display: 'block',
              width: '100%'
            }
          })}
        >
          {content}
        </SyntaxHighlighter>
      </div>
      {isCollapsible && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '40px',
            background: 'linear-gradient(transparent, var(--bg-code))',
            pointerEvents: 'none'
          }}
        />
      )}
      {shouldBeCollapsible && (
      <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
            position: 'absolute',
            left: '50%',
            bottom: '5px',
            transform: 'translateX(-50%)',
            background: isHovered ? 'rgba(30, 30, 30, 0.9)' : 'rgba(30, 30, 30, 0.7)',
          border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            color: 'var(--text-secondary)',
          cursor: 'pointer',
            transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            backdropFilter: 'blur(3px)',
            fontSize: '12px',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            zIndex: 5,
            opacity: isHovered ? 1 : 0,
          }}
          title={isCollapsed ? 'Show more' : 'Show less'}
        >
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{
              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.2s ease'
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span>{isCollapsed ? `Show ${lines.length - 10} more lines` : 'Show less'}</span>
            </button>
      )}
    </div>
  );
};

// Add this near the top with other component definitions
interface ThinkTimes {
  [key: string]: number;
}

// Add this near the top with other interfaces
interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

// Component to render messages with markdown and code syntax highlighting
const MessageRenderer: React.FC<{ 
  message: ExtendedMessage; 
  toolResponses?: Record<string, any>;
}> = ({ message, toolResponses }) => {
  const [thinkTimes] = useState<ThinkTimes>({});
  
  // Add tool call rendering
  if (message.tool_calls && message.tool_calls.length > 0 && toolResponses) {
    return (
      <div className={`message ${message.role}`}>
        <div className="message-content">
          {message.content && (
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }) {
                  // ... existing code block implementation
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
          
          <div className="tool-calls">
            {message.tool_calls.map(toolCall => (
              <ToolCallResponse 
                key={toolCall.id} 
                toolCall={toolCall} 
                toolResponse={toolResponses[toolCall.id] || { status: 'pending' }} 
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  
  // The rest of the existing MessageRenderer implementation
  return (
    <div className={`message ${message.role}`}>
      {/* ... existing code */}
    </div>
  );
};

// Update ThinkBlock component to accept actual think time
const ThinkBlock: React.FC<{ content: string; thinkTime: number }> = ({ content, thinkTime }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        position: 'relative',
        marginTop: '8px',
        marginBottom: '8px',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          width: '100%',
          background: 'var(--bg-tertiary)',
          border: 'none',
          borderRadius: '4px',
          padding: '6px 12px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease'
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span>Thoughts</span>
        </span>
      </button>
      {!isCollapsed && (
        <div
          style={{
            marginTop: '8px',
            padding: '12px 12px 12px 12px',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};

// Add this component for handling incomplete think blocks
const ThinkingBlock: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div
      style={{
        marginTop: '4px',
        marginBottom: '8px',
        padding: '4px 12px',
        color: 'var(--text-secondary)',
        fontSize: '13px',
        opacity: 0.7,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg 
          width="14" 
          height="14" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          style={{ animation: 'spin 2s linear infinite' }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span style={{ fontWeight: 500 }}>Thinking...</span>
      </div>
      <div style={{ paddingLeft: '22px' }}>{content}</div>
    </div>
  );
};

// Helper function to get file extension based on language
const getFileExtension = (language: string): string => {
  const extensionMap: { [key: string]: string } = {
    javascript: 'js',
    typescript: 'ts',
    python: 'py',
    java: 'java',
    cpp: 'cpp',
    'c++': 'cpp',
    c: 'c',
    csharp: 'cs',
    ruby: 'rb',
    php: 'php',
    swift: 'swift',
    go: 'go',
    rust: 'rs',
    html: 'html',
    css: 'css',
    json: 'json',
    yaml: 'yml',
    markdown: 'md',
    text: 'txt',
    shell: 'sh',
    bash: 'sh',
    powershell: 'ps1',
    sql: 'sql',
    // Add more mappings as needed
  };

  return extensionMap[language.toLowerCase()] || 'txt';
};

// Add this section before the LLMChat component
const AutoInsertIndicator = ({ count, isProcessing }: { count: number; isProcessing: boolean }) => {
  if (count === 0) return null;
  
  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '1rem',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        borderRadius: '0.375rem',
        padding: '0.5rem 0.75rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '12px',
        border: '1px solid var(--border-primary)',
        zIndex: 50,
        transition: 'all 0.3s ease',
      }}
    >
      {isProcessing ? (
        <svg 
          width="14" 
          height="14" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="var(--accent-color)" 
          strokeWidth="2"
          className="rotating-svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg 
          width="14" 
          height="14" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="var(--accent-color)" 
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      <span style={{ color: 'var(--text-primary)' }}>
        {isProcessing ? 
          `Auto-inserting code (${count} remaining)...` : 
          `${count} code ${count === 1 ? 'block' : 'blocks'} queued for insertion`
        }
      </span>
    </div>
  );
};

// Keyframe animation styles for the spinner
const AUTO_INSERT_STYLES = `
  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .rotating-svg {
    animation: rotate 1.5s linear infinite;
  }
`;

// Add mode type
type ChatMode = 'chat' | 'agent';

// Add mode toggle component
const ModeSwitcher: React.FC<{
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}> = ({ mode, onChange }) => {
  return (
    <div className="mode-switcher">
      <div className="mode-switcher-container">
        <div 
          className={`mode-option ${mode === 'chat' ? 'active' : ''}`} 
          onClick={() => onChange('chat')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span>Chat</span>
        </div>
        <div 
          className={`mode-option ${mode === 'agent' ? 'active' : ''}`} 
          onClick={() => onChange('agent')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span>Agent</span>
        </div>
      </div>
    </div>
  );
};

// Add Tool Call Response component
const ToolCallResponse: React.FC<{ toolCall: any; toolResponse: any }> = ({ toolCall, toolResponse }) => {
  const functionName = toolCall.function.name;
  const functionArgs = JSON.parse(toolCall.function.arguments);
  
  return (
    <div className="tool-call-response">
      <div className="tool-call-header">
        <span className="tool-call-name">{functionName}</span>
        <span className="tool-call-args">
          {Object.entries(functionArgs).map(([key, value]) => (
            <span key={key} className="tool-call-arg">
              <span className="arg-name">{key}:</span>
              <span className="arg-value">{JSON.stringify(value)}</span>
            </span>
          ))}
        </span>
      </div>
      <div className="tool-call-result">
        {toolResponse.status === 'error' ? (
          <div className="tool-call-error">Error: {toolResponse.error}</div>
        ) : (
          <pre className="tool-call-content">
            {typeof toolResponse.content === 'object' 
              ? JSON.stringify(toolResponse.content, null, 2)
              : toolResponse.content
            }
          </pre>
        )}
      </div>
    </div>
  );
};

export function LLMChat({ isVisible, onClose, onResize, currentChatId, onSelectChat }: LLMChatProps) {
  // Update the initial state and types to use ExtendedMessage
  const [messages, setMessages] = useState<ExtendedMessage[]>([INITIAL_SYSTEM_MESSAGE]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [width, setWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [isChatListVisible, setIsChatListVisible] = useState(false);
  const [chatTitle, setChatTitle] = useState<string>('');
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  // Add state for tracking pending code inserts
  const [pendingInserts, setPendingInserts] = useState<{filename: string; content: string}[]>([]);
  const [autoInsertInProgress, setAutoInsertInProgress] = useState(false);
  // Add state to track if insert model has been preloaded
  const [insertModelPreloaded, setInsertModelPreloaded] = useState(false);

  // Add state for attached files
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showFileSuggestions, setShowFileSuggestions] = useState(false);
  const [fileSuggestions, setFileSuggestions] = useState<{ name: string; path: string }[]>([]);
  const [mentionPosition, setMentionPosition] = useState<{ start: number; end: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionBoxRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Preload the insert model only when needed
  const preloadInsertModel = async () => {
    if (insertModelPreloaded) return; // Only preload once
    
    try {
      console.log("Preloading insert model...");
      // Get model ID without actually loading the model
      await AIFileService.getModelIdForPurpose('insert');
      setInsertModelPreloaded(true);
    } catch (error) {
      console.error("Error preloading insert model:", error);
    }
  };
  
  // Simple resize implementation
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate how much the mouse has moved
      const dx = startX - e.clientX;
      // Update width directly (adding dx because this is on the right side)
      const newWidth = Math.max(300, Math.min(800, startWidth + dx));
      
      // Update locally
      setWidth(newWidth);
      
      // Update container width immediately for smooth visual feedback
      if (containerRef.current) {
        containerRef.current.style.width = `${newWidth}px`;
      }
      
      // Notify parent for editor layout update
    if (onResize) {
      onResize(newWidth);
    }
      
      // Indicate active resize state
      setIsResizing(true);
      
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
  };

  const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Reset states
    setIsResizing(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      // Force editor layout update on mouse up
      if (onResize) {
        onResize(width);
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onResize]);
  
  // Add effect to handle initial width
  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && onResize) {
          onResize(entry.contentRect.width);
        }
      });
      
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, [onResize]);

  // Generate a title based on the first user message
  const generateChatTitle = (messages: ExtendedMessage[]): string => {
    // Find the first user message
    const firstUserMessage = messages.find(m => m.role === 'user');
    
    if (!firstUserMessage) {
      return `New Chat ${new Date().toLocaleString()}`;
    }
    
    const content = firstUserMessage.content;
    
    // Extract the first sentence or first few words
    let title = '';
    
    // Try to get the first sentence (up to 50 chars)
    const sentenceMatch = content.match(/^[^.!?]+[.!?]/);
    if (sentenceMatch && sentenceMatch[0]) {
      title = sentenceMatch[0].trim();
    } else {
      // If no sentence found, take first 6-8 words
      const words = content.split(' ');
      title = words.slice(0, Math.min(8, words.length)).join(' ');
    }
    
    // Limit title length
    if (title.length > 50) {
      title = title.substring(0, 50) + '...';
    }
    
    return title;
  };

  // Generate AI summary for chat title
  const generateAISummary = async (messages: ExtendedMessage[]): Promise<string> => {
    try {
      if (messages.length <= 1) return "New Chat";
      
      // Create a summary prompt with the conversation
      const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join("\n");
      
      const summaryPrompt = [
        { 
          role: 'system' as 'system', 
          content: 'You are a helpful assistant that generates extremely concise chat titles. Respond with ONLY 3-4 words that summarize the following user messages. No punctuation at the end.'
        },
        { role: 'user' as 'user', content: userMessages.slice(0, 500) } // Limit input size
      ];
      
      // Get model configuration for summary purpose
      const summaryModelId = await AIFileService.getModelIdForPurpose('summary');
      
      // Use LMStudioService to handle fallback endpoints
      const result = await lmStudio.createChatCompletion({
        model: summaryModelId,
        messages: summaryPrompt,
        temperature: 0.7,
        max_tokens: 15
      });
      
      let summary = result.choices[0].message.content.trim();
      
      // Ensure summary is concise
      const words = summary.split(' ');
      if (words.length > 4) {
        summary = words.slice(0, 4).join(' ');
      }
      
      return summary;
    } catch (error) {
      console.error('Error generating AI summary:', error);
      // Fallback to the basic title generation
      return generateChatTitle(messages);
    }
  };

  // Function to save chat
  const saveChat = async (chatId: string, messages: ExtendedMessage[]) => {
    try {
      if (messages.length <= 1) return; // Don't save if only system message exists
      
      let title = chatTitle;
      
      // Generate AI summary title if no title exists yet
      if (!title) {
        title = await generateAISummary(messages);
        setChatTitle(title); // Save the title for future use
      }
      
      const response = await fetch(`http://localhost:23816/chats/${chatId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: chatId,
          name: title,
          createdAt: new Date().toISOString(),
          messages,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save chat');
      }
      console.log('Chat saved successfully');
      loadChats(); // Refresh the chat list after saving
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  };

  // Load chat data
  const loadChat = async (chatId: string) => {
    try {
      const response = await fetch(`http://localhost:23816/chats/${chatId}`);
      if (response.ok) {
        const chat = await response.json();
        
        // Ensure the system message exists
        let chatMessages = Array.isArray(chat.messages) ? chat.messages : [];
        
        // Make sure all messages have the correct format
        chatMessages = chatMessages.map((msg: any) => ({
          role: msg.role || 'user',
          content: msg.content || '',
          attachments: msg.attachments || undefined
        }));
        
        // Add system message if not present
        if (!chatMessages.some((m: ExtendedMessage) => m.role === 'system')) {
          chatMessages = [INITIAL_SYSTEM_MESSAGE, ...chatMessages];
        }
        
        // Set messages and chat title
        setMessages(chatMessages);
        setChatTitle(chat.name || '');
      }
    } catch (error) {
      console.error('Error loading chat:', error);
      // Start with a new chat if there's an error
      setMessages([INITIAL_SYSTEM_MESSAGE]);
      setChatTitle('');
    }
  };

  // Load all chats
  const loadChats = async () => {
    try {
      const response = await fetch(`http://localhost:23816/chats`);
      if (!response.ok) {
        throw new Error('Failed to load chats');
      }
      
      const loadedChats = await response.json();
      // Sort chats by creation time, most recent first
      const sortedChats = loadedChats.sort((a: ChatSession, b: ChatSession) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setChats(sortedChats);
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  // Handle chat selection
  const handleSelectChat = (chatId: string) => {
    onSelectChat(chatId);
    setIsChatListVisible(false);
  };

  // Function to extract code blocks with filenames from message content
  const extractCodeBlocks = (content: string) => {
    const codeBlockRegex = /```(\w+):([^\n]+)\n([\s\S]*?)```/g;
    const codeBlocks: {language: string; filename: string; content: string}[] = [];
    
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [_, language, filename, code] = match;
      if (filename && code) {
        codeBlocks.push({
          language,
          filename,
          content: code
        });
      }
    }
    
    return codeBlocks;
  };

  // Process auto-insert for code blocks
  const processAutoInsert = async () => {
    if (pendingInserts.length === 0 || autoInsertInProgress) return;
    
    // Make sure the insert model is preloaded before starting
    if (!insertModelPreloaded) {
      await preloadInsertModel();
    }
    
    setAutoInsertInProgress(true);
    const currentInsert = pendingInserts[0];
    // Declare originalContent at the function scope so it's accessible in the catch blocks
    let originalContent = '';
    
    try {
      // Check if file exists first
      
      // Get directory path for the file
      const directoryPath = currentInsert.filename.substring(0, currentInsert.filename.lastIndexOf('/'));
      
      try {
        // Try to read the file
        const response = await fetch(`http://localhost:23816/read-file?path=${encodeURIComponent(currentInsert.filename)}`);
        if (response.ok) {
          originalContent = await response.text();
        } else {
          // If file doesn't exist, check if we need to create directories
          if (directoryPath) {
            // Try to create the directory structure
            const createDirResponse = await fetch(`http://localhost:23816/create-directory`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                parentId: 'root_' + directoryPath.split('/')[0], // Use root as parent for first level
                name: directoryPath.split('/').pop() || ''
              })
            });
            
            if (!createDirResponse.ok) {
              console.log(`Created directory structure: ${directoryPath}`);
            }
          }
          
          // For non-existing files, we'll use empty content
          originalContent = '';
        }
      } catch (error) {
        console.error('Error reading file:', error);
        // For errors, use empty content
        originalContent = '';
      }

      // Get model ID for insert purpose
      const insertModelId = await AIFileService.getModelIdForPurpose('insert');
      
      // Get insert model settings from localStorage
      const insertModelConfigStr = localStorage.getItem('insertModelConfig');
      const insertModelConfig = insertModelConfigStr ? JSON.parse(insertModelConfigStr) : {
        temperature: 0.2,
        maxTokens: -1,
      };

      // Create a prompt for the AI to merge the changes
      const mergePrompt = `You are a code merging expert. You need to analyze and merge code changes intelligently.

${originalContent ? `EXISTING FILE (${currentInsert.filename}):\n\`\`\`\n${originalContent}\n\`\`\`\n` : `The file ${currentInsert.filename} is new and will be created.\n`}

${originalContent ? 'NEW CHANGES:' : 'NEW FILE CONTENT:'}
\`\`\`
${currentInsert.content}
\`\`\`

Task:
${originalContent ? 
  '1. If the new changes are a complete file, determine if they should replace the existing file entirely\n2. If the new changes are partial (e.g., a single function), merge them into the appropriate location\n3. Preserve any existing functionality that isn\'t being explicitly replaced' : 
  '1. This is a new file, so use the provided content directly.'
}
4. Ensure the merged code is properly formatted and maintains consistency
5. Consider the project structure when merging (e.g., for imports)

Return ONLY the final merged code without any explanations. The code should be ready to use as-is.`;

      // Use the chat completions endpoint for merging
      const result = await lmStudio.createChatCompletion({
        model: insertModelId,
        messages: [
          {
            role: 'system',
            content: 'You are a code merging expert. Return only the merged code without any explanations.'
          },
          {
            role: 'user',
            content: mergePrompt
          }
        ],
        temperature: insertModelConfig.temperature || 0.2,
        max_tokens: insertModelConfig.maxTokens || -1,
        stream: false
      });

      const mergedContent = result.choices[0].message.content.trim();

      // Use the FileChangeEventService to trigger the diff viewer
      FileChangeEventService.emitChange(currentInsert.filename, originalContent, mergedContent);
      
      // Remove the processed insert from the queue
      setPendingInserts(prev => prev.slice(1));
    } catch (error) {
      console.error('Error during auto-insert:', error);
      // Fallback to using the chat model if the Insert-Model fails
      try {
        console.log('Falling back to chat model for auto-insertion...');
        
        // Get chat model ID for fallback
        const chatModelId = await AIFileService.getModelIdForPurpose('chat');
        
        // Get chat model settings from localStorage
        const modelConfigStr = localStorage.getItem('modelConfig');
        const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : {
          temperature: 0.3,
          maxTokens: -1,
          frequencyPenalty: 0,
          presencePenalty: 0,
        };

        // Create a prompt for the AI to merge the changes
        const mergePrompt = `You are a code merging expert. You need to analyze and merge code changes intelligently.

${originalContent ? `EXISTING FILE (${currentInsert.filename}):\n\`\`\`\n${originalContent}\n\`\`\`\n` : `The file ${currentInsert.filename} is new and will be created.\n`}

${originalContent ? 'NEW CHANGES:' : 'NEW FILE CONTENT:'}
\`\`\`
${currentInsert.content}
\`\`\`

Task:
${originalContent ? 
  '1. If the new changes are a complete file, determine if they should replace the existing file entirely\n2. If the new changes are partial (e.g., a single function), merge them into the appropriate location\n3. Preserve any existing functionality that isn\'t being explicitly replaced' : 
  '1. This is a new file, so use the provided content directly.'
}
4. Ensure the merged code is properly formatted and maintains consistency
5. Consider the project structure when merging (e.g., for imports)

Return ONLY the final merged code without any explanations. The code should be ready to use as-is.`;

        // Use the lmStudio service for merging
        const result = await lmStudio.createChatCompletion({
          model: chatModelId,
          messages: [
            {
              role: 'system',
              content: 'You are a code merging expert. Return only the merged code without any explanations.'
            },
            {
              role: 'user',
              content: mergePrompt
            }
          ],
          temperature: modelConfig.temperature || 0.3,
          max_tokens: modelConfig.maxTokens || -1,
          stream: false
        });

        const mergedContent = result.choices[0].message.content.trim();

        // Use the FileChangeEventService to trigger the diff viewer
        FileChangeEventService.emitChange(currentInsert.filename, originalContent, mergedContent);
        
        // Remove the processed insert from the queue
        setPendingInserts(prev => prev.slice(1));
      } catch (fallbackError) {
        console.error('Fallback auto-insertion also failed:', fallbackError);
        // Remove the failed insert and continue with others
        setPendingInserts(prev => prev.slice(1));
      }
    } finally {
      setAutoInsertInProgress(false);
    }
  };

  // Auto-accept all pending changes
  const autoAcceptChanges = async () => {
    try {
      // Use the FileChangeEventService to accept all diffs
      await FileChangeEventService.acceptAllDiffs();
    } catch (error) {
      console.error('Error auto-accepting changes:', error);
    }
  };

  // Run auto-insert whenever pendingInserts changes
  useEffect(() => {
    // Add a delay to prevent immediate loading of insertion model when page loads
    if (pendingInserts.length > 0) {
      const timer = setTimeout(() => {
        processAutoInsert();
      }, 2000); // 2 second delay
      
      return () => clearTimeout(timer);
    }
  }, [pendingInserts, autoInsertInProgress]);

  // Function to handle file attachment via dialog
  const handleFileAttachment = async () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Function to handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        const file = e.target.files[0];
        const content = await readFileContent(file);
        
        // Add file to attached files
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          path: file.name, // Just using filename as path for uploaded files
          content
        }]);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('Error reading file:', error);
      }
    }
  };

  // Function to read file content
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result.toString());
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = (e) => {
        reject(e);
      };
      reader.readAsText(file);
    });
  };

  // Function to remove an attached file
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Function to handle input change and check for @ mentions
  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const inputValue = e.target.value;
    setInput(inputValue);
    
    // Check for @ mentions
    const match = /@([^@\s]*)$/.exec(inputValue);
    
    if (match) {
      // If there's a match, show file suggestions
      const currentDir = FileSystemService.getCurrentDirectory();
      if (currentDir) {
        try {
          // Fetch current directory contents
          const result = await FileSystemService.fetchFolderContents(currentDir);
          if (result && result.items) {
            // Filter files based on match
            const files = Object.values(result.items)
              .filter(item => item.type === 'file')
              .filter(item => match[1] === '' || item.name.toLowerCase().includes(match[1].toLowerCase()))
              .map(item => ({ name: item.name, path: item.path }));
            
            setFileSuggestions(files);
            setShowFileSuggestions(files.length > 0);
            setMentionPosition({ start: match.index, end: match.index + match[0].length });
          }
        } catch (error) {
          console.error('Error fetching directory contents:', error);
        }
      }
    } else {
      // Hide suggestions if there's no match
      setShowFileSuggestions(false);
    }
  };

  // Function to select a file suggestion
  const selectFileSuggestion = async (file: { name: string; path: string }) => {
    if (mentionPosition) {
      // Replace the @mention with the file name
      const newInput = input.substring(0, mentionPosition.start) + file.name + input.substring(mentionPosition.end);
      setInput(newInput);
      
      // Hide suggestions
      setShowFileSuggestions(false);
      
      // Read file content
      try {
        // Try to read the file directly using the path
        const content = await FileSystemService.readText(file.path);
        
        if (content) {
          // Add file to attached files
          setAttachedFiles(prev => [...prev, {
            name: file.name,
            path: file.path,
            content
          }]);
        }
      } catch (error) {
        console.error('Error reading file:', error);
      }
    }
  };

  // Handle click outside of suggestion box
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target as Node)) {
        setShowFileSuggestions(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Modify handleSubmit to send attachments separately
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!input.trim() && attachedFiles.length === 0) || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      // Auto-accept any pending changes before sending new message
      await autoAcceptChanges();
      
      // Add user message with attachments as a separate field
      const userMessage: ExtendedMessage = { 
        role: 'user', 
        content: input,
        attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      // Clear attached files after sending
      setAttachedFiles([]);

      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController();

      // Add a temporary message for streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Get model ID for chat purpose
      const chatModelId = await AIFileService.getModelIdForPurpose('chat');
      
      // Get model configuration from localStorage for other parameters
      const modelConfigStr = localStorage.getItem('modelConfig');
      const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : {
        temperature: 0.7,
        maxTokens: -1,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      };

      // Prepare messages for API - convert attachments to content for LLM
      const messagesForAPI = messages.map(msg => {
        if (msg.attachments && msg.attachments.length > 0) {
          // Create a copy of the message with attachments included in content
          let contentWithAttachments = msg.content;
          
          if (contentWithAttachments && contentWithAttachments.trim() !== '') {
            contentWithAttachments += '\n\n';
          }
          
          msg.attachments.forEach((file, index) => {
            contentWithAttachments += `File: ${file.name}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
          });
          
          return { role: msg.role, content: contentWithAttachments };
        }
        return { role: msg.role, content: msg.content };
      });
      
      // Add the current message with attachments
      if (userMessage.attachments && userMessage.attachments.length > 0) {
        let contentWithAttachments = userMessage.content;
        
        if (contentWithAttachments && contentWithAttachments.trim() !== '') {
          contentWithAttachments += '\n\n';
        }
        
        userMessage.attachments.forEach((file, index) => {
          contentWithAttachments += `File: ${file.name}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
        });
        
        messagesForAPI.push({ role: userMessage.role, content: contentWithAttachments });
      } else {
        messagesForAPI.push({ role: userMessage.role, content: userMessage.content });
      }
      
      // Call the LMStudio API
      let finalContent = '';
      await lmStudio.createStreamingChatCompletion({
        model: chatModelId,
        messages: messagesForAPI,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
        top_p: modelConfig.topP,
        frequency_penalty: modelConfig.frequencyPenalty,
        presence_penalty: modelConfig.presencePenalty,
        onUpdate: (content: string) => {
          finalContent = content;
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
      
      // After the response is complete, extract code blocks and queue them for auto-insert
      const codeBlocks = extractCodeBlocks(finalContent);
      if (codeBlocks.length > 0) {
        // Queue all code blocks with filenames for auto-insert
        setPendingInserts(prev => [
          ...prev,
          ...codeBlocks.map(block => ({ filename: block.filename, content: block.content }))
        ]);
        
        // Only preload the insert model if we have code blocks to insert
        setTimeout(() => {
          preloadInsertModel();
        }, 3000); // Delay loading insert model by 3 seconds
      }

    } catch (error) {
      console.error('Error in handleSubmit:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Cancel ongoing requests
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsProcessing(false);
    }
  };

  // Create a new chat
  const handleNewChat = () => {
    const newChatId = uuidv4();
    setMessages([INITIAL_SYSTEM_MESSAGE]);
    setInput('');
    setChatTitle(''); // Reset chat title for new chat
    onSelectChat(newChatId);
    setIsChatListVisible(false);
  };

  // Close chat list when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isChatListVisible) {
        const target = e.target as HTMLElement;
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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chat when currentChatId changes
  useEffect(() => {
    if (currentChatId) {
      loadChat(currentChatId);
    }
  }, [currentChatId]);

  // Load chats on component mount
  useEffect(() => {
    loadChats();
  }, []);

  // Save chat when messages change
  useEffect(() => {
    if (currentChatId && messages.length > 1) {
      const saveTimer = setTimeout(() => {
        saveChat(currentChatId, messages);
      }, 1000); // Debounce save to avoid too many API calls
      
      return () => clearTimeout(saveTimer);
    }
  }, [messages, currentChatId]);

  // Add this before the return statement
  const handleEditMessage = (index: number) => {
    const message = messages[index];
    if (message.role === 'user') {
      setEditingMessageIndex(index);
      setInput(message.content);
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageIndex(null);
    setInput('');
  };

  // Update handleSubmitEdit to follow the same pattern
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!input.trim() && attachedFiles.length === 0) || isProcessing || editingMessageIndex === null) return;
    
    try {
      setIsProcessing(true);
      
      // Auto-accept any pending changes before sending new message
      await autoAcceptChanges();
      
      // Update the edited message with attachments as a separate field
      const updatedMessage: ExtendedMessage = { 
        role: 'user', 
        content: input,
        attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined
      };
      
      const updatedMessages = [...messages];
      updatedMessages[editingMessageIndex] = updatedMessage;
      
      // Remove all messages after the edited message
      updatedMessages.splice(editingMessageIndex + 1);
      
      setMessages(updatedMessages);
      setInput('');
      setEditingMessageIndex(null);
      // Clear attached files after submitting edit
      setAttachedFiles([]);

      // Add a temporary message for streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Get model ID for chat purpose
      const chatModelIdForEdit = await AIFileService.getModelIdForPurpose('chat');
      
      // Get model configuration from localStorage for other parameters
      const modelConfigStr = localStorage.getItem('modelConfig');
      const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : {
        temperature: 0.7,
        maxTokens: -1,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      };

      // Prepare messages for API - convert attachments to content for LLM
      const messagesForAPI = updatedMessages.map(msg => {
        if (msg.attachments && msg.attachments.length > 0) {
          // Create a copy of the message with attachments included in content
          let contentWithAttachments = msg.content;
          
          if (contentWithAttachments && contentWithAttachments.trim() !== '') {
            contentWithAttachments += '\n\n';
          }
          
          msg.attachments.forEach((file, index) => {
            contentWithAttachments += `File: ${file.name}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
          });
          
          return { role: msg.role, content: contentWithAttachments };
        }
        return { role: msg.role, content: msg.content };
      });
      
      // Call the LMStudio API
      let finalContent = '';
      await lmStudio.createStreamingChatCompletion({
        model: chatModelIdForEdit,
        messages: messagesForAPI,
        temperature: modelConfig.temperature,
        max_tokens: modelConfig.maxTokens,
        top_p: modelConfig.topP,
        frequency_penalty: modelConfig.frequencyPenalty,
        presence_penalty: modelConfig.presencePenalty,
        onUpdate: (content: string) => {
          finalContent = content;
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
      
      // After the response is complete, extract code blocks and queue them for auto-insert
      const codeBlocks = extractCodeBlocks(finalContent);
      if (codeBlocks.length > 0) {
        // Queue all code blocks with filenames for auto-insert
        setPendingInserts(prev => [
          ...prev,
          ...codeBlocks.map(block => ({ filename: block.filename, content: block.content }))
        ]);
        
        // Only preload the insert model if we have code blocks to insert
        setTimeout(() => {
          preloadInsertModel();
        }, 3000); // Delay loading insert model by 3 seconds
      }

    } catch (error) {
      console.error('Error in handleSubmitEdit:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Add styles for the auto-insert spinner animation
  useEffect(() => {
    if (!document.getElementById('auto-insert-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'auto-insert-styles';
      styleSheet.textContent = AUTO_INSERT_STYLES;
      document.head.appendChild(styleSheet);

      return () => {
        styleSheet.remove();
      };
    }
  }, []);

  // Add state for chat/agent mode
  const [mode, setMode] = useState<ChatMode>('chat');
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [toolResponses, setToolResponses] = useState<Record<string, any>>({});
  
  // Load available tools for agent mode
  useEffect(() => {
    const loadTools = async () => {
      const tools = await agentService.getAvailableTools();
      setAvailableTools(tools);
    };
    
    loadTools();
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className={`llm-chat ${isVisible ? 'visible' : 'hidden'}`}
      ref={containerRef}
    >
      <div className="chat-header">
        <h2>Chat</h2>
        <div className="header-right">
          {/* Add mode switcher here */}
          <ModeSwitcher mode={mode} onChange={setMode} />
          <button className="close-button" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      <div
        ref={chatContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.length <= 1 ? (
          <div className="empty-chat-message" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            padding: '0 20px'
          }}>
            <svg 
              width="48" 
              height="48" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              style={{ marginBottom: '16px', opacity: 0.7 }}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Start a new conversation</h3>
            <p style={{ fontSize: '14px', opacity: 0.8, maxWidth: '400px' }}>
              Ask a question, get coding help, or have a chat with your AI assistant.
            </p>
          </div>
        ) : (
          <>
            {messages.slice(1).map((message, index) => {
              // Check if message has think blocks
              const hasThinkBlocks = message.content.includes('<think>');
              
              // Calculate if this message should be faded
              const shouldBeFaded = editingMessageIndex !== null && index + 1 > editingMessageIndex;
              
              // If it's a thinking message, render it differently
              if (hasThinkBlocks) {
                return (
                  <div 
                    key={index} 
                    style={{ 
                      width: '100%',
                      opacity: shouldBeFaded ? 0.33 : 1,
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    <MessageRenderer message={message} />
                  </div>
                );
              }

              // Regular message
              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: message.role === 'assistant' ? 'flex-start' : 'flex-end',
                    position: 'relative',
                    width: '100%',
                    opacity: shouldBeFaded ? 0.5 : 1,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  <div
                    className={`message ${message.role === 'assistant' ? 'assistant' : 'user'}`}
                    style={{
                      background: message.role === 'assistant' ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                      padding: '12px',
                      borderRadius: '8px',
                      maxWidth: '85%',
                      border: message.role === 'assistant' ? 'none' : '1px solid var(--border-primary)',
                    }}
                  >
                    <MessageRenderer message={message} />
                  </div>
                  {message.role === 'user' && (
                    <div
                      style={{
                        marginTop: '4px',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        paddingRight: '4px',
                      }}
                      className="edit-button-container"
                    >
                      <button
                        className="edit-button"
                        onClick={() => handleEditMessage(index + 1)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-tertiary)',
                          cursor: shouldBeFaded ? 'not-allowed' : 'pointer',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          fontSize: '11px',
                          transition: 'all 0.2s ease',
                          opacity: shouldBeFaded ? 0.3 : 0.7,
                          pointerEvents: shouldBeFaded ? 'none' : 'auto',
                        }}
                        onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                          if (!shouldBeFaded) {
                            e.currentTarget.style.background = 'var(--bg-hover)';
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }
                        }}
                        onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                          if (!shouldBeFaded) {
                            e.currentTarget.style.background = 'none';
                            e.currentTarget.style.opacity = '0.7';
                            e.currentTarget.style.color = 'var(--text-tertiary)';
                          }
                        }}
                        title={shouldBeFaded ? "Can't edit while another message is being edited" : "Edit message"}
                        disabled={shouldBeFaded}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        <span>Edit</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attached Files Section */}
      {attachedFiles.length > 0 && (
        <div className="attached-files-container">
          <div
            style={{
              fontSize: '12px',
              fontWeight: 'bold',
              marginBottom: '6px',
              color: 'var(--text-secondary)',
            }}
          >
            Attached Files ({attachedFiles.length})
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {attachedFiles.map((file, index) => (
              <div key={index} className="attached-file-item">
                <div className="attached-file-name">
                  <span className="attached-file-icon">📎</span>
                  {file.name}
                </div>
                <button
                  onClick={() => removeAttachedFile(index)}
                  className="remove-file-button"
                  title="Remove file"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={editingMessageIndex !== null ? handleSubmitEdit : handleSubmit}
        style={{
          borderTop: attachedFiles.length > 0 ? 'none' : '1px solid var(--border-primary)',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <textarea
            value={input}
            onChange={handleInputChange}
              placeholder={editingMessageIndex !== null ? "Edit your message..." : "Type your message... (Use @ to attach files)"}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '4px',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                resize: 'none',
                fontSize: '13px',
                minHeight: '60px',
                maxHeight: '150px',
                overflow: 'auto',
              }}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (editingMessageIndex !== null) {
                    handleSubmitEdit(e);
                  } else {
                    handleSubmit(e);
                  }
                } else if (e.key === 'Escape' && editingMessageIndex !== null) {
                  handleCancelEdit();
                } else if (e.key === 'Escape' && showFileSuggestions) {
                  setShowFileSuggestions(false);
                  e.preventDefault();
                }
              }}
              disabled={isProcessing}
            />

            {/* File suggestions dropdown */}
            {showFileSuggestions && (
              <div
                ref={suggestionBoxRef}
                className="file-suggestions-dropdown"
              >
                {fileSuggestions.map((file, index) => (
                  <div
                    key={index}
                    onClick={() => selectFileSuggestion(file)}
                    className="file-suggestion-item"
                  >
                    <span className="file-suggestion-icon">📄</span>
                    {file.name}
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: '8px',
                gap: '8px',
              }}
            >
              {editingMessageIndex !== null && (
                <button
                  onClick={handleCancelEdit}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                  type="button"
                >
                  Cancel
                </button>
              )}
              
              {/* Add hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
              
              {/* File attachment button */}
              {!editingMessageIndex && !isProcessing && (
                <button
                  onClick={handleFileAttachment}
                  type="button"
                  className="add-file-button"
                  title="Attach file"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
              
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
                  disabled={!input.trim() && attachedFiles.length === 0}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-primary)',
                    background: (input.trim() || attachedFiles.length > 0) ? 'var(--accent-color)' : 'var(--bg-secondary)',
                    color: (input.trim() || attachedFiles.length > 0) ? 'white' : 'var(--text-secondary)',
                    cursor: (input.trim() || attachedFiles.length > 0) ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  {editingMessageIndex !== null ? 'Update' : 'Send'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {autoInsertInProgress && (
        <div className="auto-insert-indicator">
          <AutoInsertIndicator 
            count={pendingInserts.length} 
            isProcessing={autoInsertInProgress} 
          />
        </div>
      )}
    </div>
  );
} 