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
import { ChatModeSwitch } from './ChatModeSwitch';
import ToolService from '../services/ToolService';

// Extend the Message interface to include attachments
interface ExtendedMessage extends Message {
  attachments?: AttachedFile[];
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string | object;
  }>;
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
const MessageRenderer: React.FC<{ message: ExtendedMessage }> = ({ message }) => {
  const [thinkTimes] = useState<ThinkTimes>({});
  
  // Check if we have an incomplete think block
  const hasIncompleteThink = message.content.includes('<think>') && 
    !message.content.includes('</think>');

  // Start timing when a think block starts
  useEffect(() => {
    if (hasIncompleteThink) {
      const thinkStart = Date.now();
      const thinkKey = message.content; // Use the full message content as the key
      thinkTimes[thinkKey] = thinkStart;
    }
  }, [hasIncompleteThink, message.content, thinkTimes]);

  // If we have an incomplete think, extract the content after <think>
  if (hasIncompleteThink) {
    const parts = message.content.split('<think>');
    return (
      <>
        {/* Render content before <think> tag */}
        {parts[0] && (
          <div className="message-content">
            {message.attachments && message.attachments.length > 0 && (
              <div className="message-attachments">
                <div className="attachments-header">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span>{message.attachments.length} attached {message.attachments.length === 1 ? 'file' : 'files'}</span>
                </div>
                <div className="attachments-list">
                  {message.attachments.map((file, index) => (
                    <div key={index} className="attachment-item">
                      <div className="attachment-name">
                        <span className="attachment-icon">📄</span>
                        {file.name}
                      </div>
                      <button
                        className="attachment-expand-button"
                        onClick={() => window.open(`data:text/plain;charset=utf-8,${encodeURIComponent(file.content)}`, '_blank')}
                        title="View file content"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <polyline points="9 21 3 21 3 15"></polyline>
                          <line x1="21" y1="3" x2="14" y2="10"></line>
                          <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <ReactMarkdown
              components={{
                p: ({ children, ...props }) => {
                  const hasCodeBlock = React.Children.toArray(children).some(
                    child => React.isValidElement(child) && child.type === 'code'
                  );
                  return hasCodeBlock ? <div {...props}>{children}</div> : <p {...props}>{children}</p>;
                },
                ul: ({ children, ...props }) => (
                  <ul style={{ 
                    margin: '8px 0',
                    paddingLeft: '24px',
                    listStyleType: 'disc'
                  }} {...props}>
                    {children}
                  </ul>
                ),
                ol: ({ children, ...props }) => (
                  <ol style={{ 
                    margin: '8px 0',
                    paddingLeft: '24px',
                    listStyleType: 'decimal'
                  }} {...props}>
                    {children}
                  </ol>
                ),
                li: ({ children, ...props }) => (
                  <li style={{ 
                    margin: '4px 0',
                    lineHeight: '1.5'
                  }} {...props}>
                    {children}
                  </li>
                ),
                code({ className, children, ...props }: CodeProps) {
                  let content = String(children).replace(/\n$/, '');
                  
                  // Check if this is a code block (triple backticks) or inline code (single backtick)
                  const isCodeBlock = content.includes('\n') || content.length > 50;
                  
                  if (!isCodeBlock) {
                    return (
                      <code
                        style={{
                          background: 'var(--bg-code)',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          fontSize: '0.9em',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--inline-code-color, #cc0000)',
                        }}
                        {...props}
                      >
                        {content}
                      </code>
                    );
                  }

                  let language = '';
                  let filename = '';
                  
                  if (className) {
                    const match = /language-(\w+)(?::(.+))?/.exec(className);
                    if (match) {
                      language = match[1] || '';
                      filename = match[2] || '';
                    }
                  }

                  // If no filename was provided in the className, try to extract it from the first line
                  if (!filename) {
                    const lines = content.split('\n');
                    const firstLine = lines[0].trim();
                    
                    // Extract potential filename from any comment style
                    // Match HTML comments, regular comments, and other common comment styles
                    const commentPatterns = [
                      /^<!--\s*(.*?\.[\w]+)\s*-->/, // HTML comments
                      /^\/\/\s*(.*?\.[\w]+)\s*$/, // Single line comments
                      /^#\s*(.*?\.[\w]+)\s*$/, // Hash comments
                      /^\/\*\s*(.*?\.[\w]+)\s*\*\/$/, // Multi-line comments
                      /^--\s*(.*?\.[\w]+)\s*$/, // SQL comments
                      /^%\s*(.*?\.[\w]+)\s*$/, // Matlab/LaTeX comments
                      /^;\s*(.*?\.[\w]+)\s*$/, // Assembly/Lisp comments
                    ];

                    for (const pattern of commentPatterns) {
                      const match = firstLine.match(pattern);
                      if (match && match[1]) {
                        const potentialPath = match[1].trim();
                        // Basic check if it looks like a file path (no spaces)
                        if (!potentialPath.includes(' ')) {
                          filename = potentialPath;
                          // Remove the first line from the content since we're using it as the filename
                          content = lines.slice(1).join('\n').trim();
                          break;
                        }
                      }
                    }
                  }
                  
                  return (
                    <CollapsibleCodeBlock
                      language={language || 'text'}
                      filename={filename}
                      content={content}
                    />
                  );
                }
              }}
            >
              {parts[0]}
            </ReactMarkdown>
          </div>
        )}
        <ThinkingBlock content={parts[1]} />
      </>
    );
  }

  // Split content into think blocks and other content
  const parts = message.content.split(/(<think>.*?<\/think>)/s);
  
  // If no think blocks and no special parts, render as a regular message
  if (parts.length === 1) {
    return (
      <div className="message-content">
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            <div className="attachments-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span>{message.attachments.length} attached {message.attachments.length === 1 ? 'file' : 'files'}</span>
            </div>
            <div className="attachments-list">
              {message.attachments.map((file, index) => (
                <div key={index} className="attachment-item">
                  <div className="attachment-name">
                    <span className="attachment-icon">📄</span>
                    {file.name}
                  </div>
                  <button
                    className="attachment-expand-button"
                    onClick={() => window.open(`data:text/plain;charset=utf-8,${encodeURIComponent(file.content)}`, '_blank')}
                    title="View file content"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <polyline points="9 21 3 21 3 15"></polyline>
                      <line x1="21" y1="3" x2="14" y2="10"></line>
                      <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <ReactMarkdown
          components={{
            p: ({ children, ...props }) => {
              const hasCodeBlock = React.Children.toArray(children).some(
                child => React.isValidElement(child) && child.type === 'code'
              );
              return hasCodeBlock ? <div {...props}>{children}</div> : <p {...props}>{children}</p>;
            },
            ul: ({ children, ...props }) => (
              <ul style={{ 
                margin: '8px 0',
                paddingLeft: '24px',
                listStyleType: 'disc'
              }} {...props}>
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol style={{ 
                margin: '8px 0',
                paddingLeft: '24px',
                listStyleType: 'decimal'
              }} {...props}>
                {children}
              </ol>
            ),
            li: ({ children, ...props }) => (
              <li style={{ 
                margin: '4px 0',
                lineHeight: '1.5'
              }} {...props}>
                {children}
              </li>
            ),
            code({ className, children, ...props }: CodeProps) {
              let content = String(children).replace(/\n$/, '');
              
              // Check if this is a code block (triple backticks) or inline code (single backtick)
              const isCodeBlock = content.includes('\n') || content.length > 50;
              
              if (!isCodeBlock) {
                return (
                  <code
                    style={{
                      background: 'var(--bg-code)',
                      padding: '2px 4px',
                      borderRadius: '3px',
                      fontSize: '0.9em',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--inline-code-color, #cc0000)',
                    }}
                    {...props}
                  >
                    {content}
                  </code>
                );
              }

              let language = '';
              let filename = '';
              
              if (className) {
                const match = /language-(\w+)(?::(.+))?/.exec(className);
                if (match) {
                  language = match[1] || '';
                  filename = match[2] || '';
                }
              }

              // If no filename was provided in the className, try to extract it from the first line
              if (!filename) {
                const lines = content.split('\n');
                const firstLine = lines[0].trim();
                
                // Extract potential filename from any comment style
                // Match HTML comments, regular comments, and other common comment styles
                const commentPatterns = [
                  /^<!--\s*(.*?\.[\w]+)\s*-->/, // HTML comments
                  /^\/\/\s*(.*?\.[\w]+)\s*$/, // Single line comments
                  /^#\s*(.*?\.[\w]+)\s*$/, // Hash comments
                  /^\/\*\s*(.*?\.[\w]+)\s*\*\/$/, // Multi-line comments
                  /^--\s*(.*?\.[\w]+)\s*$/, // SQL comments
                  /^%\s*(.*?\.[\w]+)\s*$/, // Matlab/LaTeX comments
                  /^;\s*(.*?\.[\w]+)\s*$/, // Assembly/Lisp comments
                ];

                for (const pattern of commentPatterns) {
                  const match = firstLine.match(pattern);
                  if (match && match[1]) {
                    const potentialPath = match[1].trim();
                    // Basic check if it looks like a file path (no spaces)
                    if (!potentialPath.includes(' ')) {
                      filename = potentialPath;
                      // Remove the first line from the content since we're using it as the filename
                      content = lines.slice(1).join('\n').trim();
                      break;
                    }
                  }
                }
              }
              
              return (
                <CollapsibleCodeBlock
                  language={language || 'text'}
                  filename={filename}
                  content={content}
                />
              );
            }
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    );
  }

  // Handle messages with think blocks
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('<think>') && part.endsWith('</think>')) {
          // Extract content between think tags
          const thinkContent = part.slice(7, -8); // Remove <think> and </think>
          // Calculate actual thinking time using the full message as key
          const thinkKey = message.content;
          const thinkTime = thinkTimes[thinkKey] ? Math.round((Date.now() - thinkTimes[thinkKey]) / 1000) : 0;
          return <ThinkBlock key={index} content={thinkContent} thinkTime={thinkTime} />;
        }

        // Regular content
        return part ? (
          <div key={index} className="message-content">
            {/* Display file attachments if they exist and it's the first part */}
            {index === 0 && message.attachments && message.attachments.length > 0 && (
              <div className="message-attachments">
                <div className="attachments-header">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span>{message.attachments.length} attached {message.attachments.length === 1 ? 'file' : 'files'}</span>
                </div>
                <div className="attachments-list">
                  {message.attachments.map((file, index) => (
                    <div key={index} className="attachment-item">
                      <div className="attachment-name">
                        <span className="attachment-icon">📄</span>
                        {file.name}
                      </div>
                      <button
                        className="attachment-expand-button"
                        onClick={() => window.open(`data:text/plain;charset=utf-8,${encodeURIComponent(file.content)}`, '_blank')}
                        title="View file content"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <polyline points="9 21 3 21 3 15"></polyline>
                          <line x1="21" y1="3" x2="14" y2="10"></line>
                          <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <ReactMarkdown
              components={{
                p: ({ children, ...props }) => {
                  const hasCodeBlock = React.Children.toArray(children).some(
                    child => React.isValidElement(child) && child.type === 'code'
                  );
                  return hasCodeBlock ? <div {...props}>{children}</div> : <p {...props}>{children}</p>;
                },
                ul: ({ children, ...props }) => (
                  <ul style={{ 
                    margin: '8px 0',
                    paddingLeft: '24px',
                    listStyleType: 'disc'
                  }} {...props}>
                    {children}
                  </ul>
                ),
                ol: ({ children, ...props }) => (
                  <ol style={{ 
                    margin: '8px 0',
                    paddingLeft: '24px',
                    listStyleType: 'decimal'
                  }} {...props}>
                    {children}
                  </ol>
                ),
                li: ({ children, ...props }) => (
                  <li style={{ 
                    margin: '4px 0',
                    lineHeight: '1.5'
                  }} {...props}>
                    {children}
                  </li>
                ),
                code({ className, children, ...props }: CodeProps) {
                  let content = String(children).replace(/\n$/, '');
                  
                  // Check if this is a code block (triple backticks) or inline code (single backtick)
                  const isCodeBlock = content.includes('\n') || content.length > 50;
                  
                  if (!isCodeBlock) {
                    return (
                      <code
                        style={{
                          background: 'var(--bg-code)',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          fontSize: '0.9em',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--inline-code-color, #cc0000)',
                        }}
                        {...props}
                      >
                        {content}
                      </code>
                    );
                  }

                  let language = '';
                  let filename = '';
                  
                  if (className) {
                    const match = /language-(\w+)(?::(.+))?/.exec(className);
                    if (match) {
                      language = match[1] || '';
                      filename = match[2] || '';
                    }
                  }

                  // If no filename was provided in the className, try to extract it from the first line
                  if (!filename) {
                    const lines = content.split('\n');
                    const firstLine = lines[0].trim();
                    
                    // Extract potential filename from any comment style
                    // Match HTML comments, regular comments, and other common comment styles
                    const commentPatterns = [
                      /^<!--\s*(.*?\.[\w]+)\s*-->/, // HTML comments
                      /^\/\/\s*(.*?\.[\w]+)\s*$/, // Single line comments
                      /^#\s*(.*?\.[\w]+)\s*$/, // Hash comments
                      /^\/\*\s*(.*?\.[\w]+)\s*\*\/$/, // Multi-line comments
                      /^--\s*(.*?\.[\w]+)\s*$/, // SQL comments
                      /^%\s*(.*?\.[\w]+)\s*$/, // Matlab/LaTeX comments
                      /^;\s*(.*?\.[\w]+)\s*$/, // Assembly/Lisp comments
                    ];

                    for (const pattern of commentPatterns) {
                      const match = firstLine.match(pattern);
                      if (match && match[1]) {
                        const potentialPath = match[1].trim();
                        // Basic check if it looks like a file path (no spaces)
                        if (!potentialPath.includes(' ')) {
                          filename = potentialPath;
                          // Remove the first line from the content since we're using it as the filename
                          content = lines.slice(1).join('\n').trim();
                          break;
                        }
                      }
                    }
                  }
                  
                  return (
                    <CollapsibleCodeBlock
                      language={language || 'text'}
                      filename={filename}
                      content={content}
                    />
                  );
                }
              }}
            >
              {part}
            </ReactMarkdown>
          </div>
        ) : null;
      })}
    </>
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
      transform: rotate(-360deg);
    }
  }

  .rotating-svg {
    animation: rotate 1.5s linear infinite;
  }
`;

// First, restore the interface for FunctionCall and ToolArgs
interface FunctionCall {
  id: string;
  name: string;
  arguments: string | Record<string, any>;
}

interface ToolArgs {
  directory_path?: string;
  file_path?: string;
  query?: string;
  url?: string;
  [key: string]: any;
}

// Add a utility function to generate valid tool call IDs
const generateValidToolCallId = (): string => {
  // Generate a random 9-character alphanumeric string
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 9; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export function LLMChat({ isVisible, onClose, onResize, currentChatId, onSelectChat }: LLMChatProps) {
  // Add mode state
  const [mode, setMode] = useState<'chat' | 'agent'>('agent'); // Change to agent by default for testing
  
  // Update the initial state and types to use ExtendedMessage
  const [messages, setMessages] = useState<ExtendedMessage[]>([INITIAL_SYSTEM_MESSAGE]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [width, setWidth] = useState(700);
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
  
  // Add a state variable to track streaming completion
  const [isStreamingComplete, setIsStreamingComplete] = useState(false);
  
  // Restore tool-related state
  const [toolResults, setToolResults] = useState<{[key: string]: any}[]>([]);
  const [isExecutingTool, setIsExecutingTool] = useState(false);
  const [isInToolExecutionChain, setIsInToolExecutionChain] = useState(false);
  
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

  // System messages for different modes
  const chatSystemMessage = 'You are a helpful coding assistant.';
  const agentSystemMessage = 'You are a helpful coding assistant with access to tools.';

  // Modify handleSubmit to use the correct model based on mode
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !attachedFiles.length) return;
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      setIsStreamingComplete(false); // Reset streaming complete state
      
      // Auto-accept any pending changes before sending new message
      await autoAcceptChanges();
      
      // Create the user message
      const userMessage: ExtendedMessage = {
        role: 'user',
        content: input,
        attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setAttachedFiles([]);

      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController();

      // Add a temporary message for streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Get model configuration based on mode
      const modelConfig = await AIFileService.getModelConfigForPurpose(mode === 'agent' ? 'agent' : 'chat');
      const modelId = modelConfig.modelId;

      // Prepare messages for API
      const messagesForAPI = messages.map(msg => {
        if (msg.attachments && msg.attachments.length > 0) {
          let contentWithAttachments = msg.content;
          if (contentWithAttachments && contentWithAttachments.trim() !== '') {
            contentWithAttachments += '\n\n';
          }
          msg.attachments.forEach(file => {
            contentWithAttachments += `File: ${file.name}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
          });
          return { role: msg.role, content: contentWithAttachments };
        }
        return { 
          role: msg.role, 
          content: msg.content,
          // Ensure any tool_call_id is properly formatted
          ...(msg.tool_call_id && {
            tool_call_id: msg.tool_call_id.length === 9 && /^[a-z0-9]+$/.test(msg.tool_call_id)
              ? msg.tool_call_id
              : generateValidToolCallId()
          }) 
        };
      });

      // Add tools configuration if in agent mode
      const apiConfig = {
        model: modelId,
        messages: [
          {
            role: 'system' as const,
            content: mode === 'agent' ? agentSystemMessage : chatSystemMessage,
          },
          ...messagesForAPI
        ],
        temperature: modelConfig.temperature || 0.7,
        max_tokens: modelConfig.maxTokens || -1,
        top_p: modelConfig.topP,
        frequency_penalty: modelConfig.frequencyPenalty,
        presence_penalty: modelConfig.presencePenalty,
        ...(mode === 'agent' && {
          tools: [
            {
              type: "function",
              function: {
                name: "read_file",
                description: "Read the contents of a file",
                parameters: {
                  type: "object",
                  properties: {
                    file_path: {
                      type: "string",
                      description: "The path to the file to read"
                    }
                  },
                  required: ["file_path"]
                }
              }
            },
            {
              type: "function",
              function: {
                name: "list_directory",
                description: "List the contents of a directory",
                parameters: {
                  type: "object",
                  properties: {
                    directory_path: {
                      type: "string",
                      description: "The path to the directory to list"
                    }
                  },
                  required: ["directory_path"]
                }
              }
            },
            {
              type: "function",
              function: {
                name: "web_search",
                description: "Search the web for information",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "The search query"
                    },
                    num_results: {
                      type: "integer",
                      description: "Number of results to return (default: 3)"
                    }
                  },
                  required: ["query"]
                }
              }
            },
            {
              type: "function",
              function: {
                name: "fetch_webpage",
                description: "Fetch and extract content from a webpage",
                parameters: {
                  type: "object",
                  properties: {
                    url: {
                      type: "string",
                      description: "The URL of the webpage to fetch"
                    }
                  },
                  required: ["url"]
                }
              }
            }
          ],
          tool_choice: "auto"
        })
      };

      // Debug log to check if tools are present
      console.log(`Mode: ${mode}, Tools included: ${mode === 'agent' ? 'yes' : 'no'}`);
      if (mode === 'agent') {
        console.log('API Config in agent mode:', JSON.stringify({
          ...apiConfig,
          messages: '[Messages included]',
          tools: apiConfig.tools ? `[${apiConfig.tools.length} tools included]` : 'No tools',
          tool_choice: apiConfig.tool_choice || 'No tool_choice'
        }, null, 2));
      }

      let currentContent = '';
      // Log what we're about to pass to the API
      console.log('Passing to API:', {
        ...apiConfig,
        messages: '[Messages included]',
        tools: apiConfig.tools ? `[${apiConfig.tools.length} tools included]` : 'No tools',
        tool_choice: apiConfig.tool_choice || 'No tool_choice'
      });
      
      // Add a debounce timeout reference for tool calls
      let toolCallTimeoutRef: ReturnType<typeof setTimeout> | null = null;
      
      await lmStudio.createStreamingChatCompletion({
        ...apiConfig,
        purpose: mode === 'agent' ? 'agent' : 'chat',
        onUpdate: async (content: string) => {
          currentContent = content;
          console.log("Received content update in handleSubmit:", content.substring(0, 50) + "...");
          
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: 'assistant',
              content: content
            };
            return newMessages;
          });

          // In agent mode, debounce the tool call processing
          if (mode === 'agent' && content.includes('function_call:')) {
            console.log("Detected tool call in initial response");
            
            // Clear any existing timeout
            if (toolCallTimeoutRef) {
              clearTimeout(toolCallTimeoutRef);
            }
            
            // Set a new timeout to process tool calls after 200ms of no updates
            toolCallTimeoutRef = setTimeout(() => {
              console.log("Processing tool calls after debounce");
              setIsInToolExecutionChain(true); // Make sure we're in tool execution chain
              processToolCalls(content);
              toolCallTimeoutRef = null;
            }, 200);
          }
        }
      });
      
      // Ensure we process any final tool calls after streaming is complete
      setIsStreamingComplete(true);
      if (mode === 'agent' && currentContent.includes('function_call:')) {
        console.log('Processing final tool calls after streaming completion');
        // Cancel any pending timeout
        if (toolCallTimeoutRef) {
          clearTimeout(toolCallTimeoutRef);
          toolCallTimeoutRef = null;
        }
        // Process immediately
        setIsInToolExecutionChain(true); // Make sure we're in tool execution chain
        await processToolCalls(currentContent);
      }

      // Extract and queue code blocks for auto-insert
      const codeBlocks = extractCodeBlocks(currentContent);
      if (codeBlocks.length > 0) {
        setPendingInserts(prev => [
          ...prev,
          ...codeBlocks.map(block => ({ filename: block.filename, content: block.content }))
        ]);
        
        setTimeout(() => {
          preloadInsertModel();
        }, 3000);
      }

    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'I apologize, but I encountered an error processing your request. Please try again.'
        }
      ]);
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

      // Get model configuration based on mode
      const modelConfig = await AIFileService.getModelConfigForPurpose(mode === 'agent' ? 'agent' : 'chat');
      const modelId = modelConfig.modelId;

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
      
      // Add tools configuration if in agent mode
      const apiConfig = {
        model: modelId,
        messages: [
          {
            role: 'system' as const,
            content: mode === 'agent' ? agentSystemMessage : chatSystemMessage,
          },
          ...messagesForAPI
        ],
        temperature: modelConfig.temperature || 0.7,
        max_tokens: modelConfig.maxTokens || -1,
        top_p: modelConfig.topP,
        frequency_penalty: modelConfig.frequencyPenalty,
        presence_penalty: modelConfig.presencePenalty,
        ...(mode === 'agent' && {
          tools: [
            {
              type: "function",
              function: {
                name: "read_file",
                description: "Read the contents of a file",
                parameters: {
                  type: "object",
                  properties: {
                    file_path: {
                      type: "string",
                      description: "The path to the file to read"
                    }
                  },
                  required: ["file_path"]
                }
              }
            },
            {
              type: "function",
              function: {
                name: "list_directory",
                description: "List the contents of a directory",
                parameters: {
                  type: "object",
                  properties: {
                    directory_path: {
                      type: "string",
                      description: "The path to the directory to list"
                    }
                  },
                  required: ["directory_path"]
                }
              }
            },
            {
              type: "function",
              function: {
                name: "web_search",
                description: "Search the web for information",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "The search query"
                    },
                    num_results: {
                      type: "integer",
                      description: "Number of results to return (default: 3)"
                    }
                  },
                  required: ["query"]
                }
              }
            },
            {
              type: "function",
              function: {
                name: "fetch_webpage",
                description: "Fetch and extract content from a webpage",
                parameters: {
                  type: "object",
                  properties: {
                    url: {
                      type: "string",
                      description: "The URL of the webpage to fetch"
                    }
                  },
                  required: ["url"]
                }
              }
            }
          ],
          tool_choice: "auto"
        })
      };
      
      // Debug log to check if tools are present in edit message handler
      console.log(`Edit - Mode: ${mode}, Tools included: ${apiConfig.tools ? 'yes' : 'no'}`);
      if (mode === 'agent') {
        console.log('Edit - API Config in agent mode:', JSON.stringify(apiConfig, null, 2));
      }

      // Call the LMStudio API
      let currentContent = '';
      // Log what we're about to pass to the API (edit handler)
      console.log('Edit - Passing to API:', {
        ...apiConfig,
        messages: '[Messages included]',
        tools: apiConfig.tools ? `[${apiConfig.tools.length} tools included]` : 'No tools',
        tool_choice: apiConfig.tool_choice || 'No tool_choice'
      });
      
      // Add a debounce timeout reference for tool calls
      let toolCallTimeoutRef: ReturnType<typeof setTimeout> | null = null;
      
      await lmStudio.createStreamingChatCompletion({
        ...apiConfig,
        purpose: mode === 'agent' ? 'agent' : 'chat',
        onUpdate: async (content: string) => {
          currentContent = content;
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = {
              role: 'assistant',
              content: content
            };
            return newMessages;
          });

          // In agent mode, debounce the tool call processing
          if (mode === 'agent' && content.includes('function_call:')) {
            // Clear any existing timeout
            if (toolCallTimeoutRef) {
              clearTimeout(toolCallTimeoutRef);
            }
            
            // Set a new timeout to process tool calls after 200ms of no updates
            toolCallTimeoutRef = setTimeout(() => {
              processToolCalls(content);
              toolCallTimeoutRef = null;
            }, 200);
          } else if (mode !== 'agent') {
            // For regular chat mode, process immediately
            await processToolCalls(content);
          }
        }
      });
      
      // Ensure we process any final tool calls after streaming is complete
      setIsStreamingComplete(true);
      if (mode === 'agent' && currentContent.includes('function_call:')) {
        console.log('Processing final tool calls after streaming completion');
        // Cancel any pending timeout
        if (toolCallTimeoutRef) {
          clearTimeout(toolCallTimeoutRef);
          toolCallTimeoutRef = null;
        }
        // Process immediately
        await processToolCalls(currentContent);
      }
      
      // After the response is complete, extract code blocks and queue them for auto-insert
      const codeBlocks = extractCodeBlocks(currentContent);
      if (codeBlocks.length > 0) {
        setPendingInserts(prev => [
          ...prev,
          ...codeBlocks.map(block => ({ filename: block.filename, content: block.content }))
        ]);
        
        setTimeout(() => {
          preloadInsertModel();
        }, 3000);
      }

    } catch (error) {
      console.error('Error in handleSubmitEdit:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'I apologize, but I encountered an error processing your request. Please try again.'
        }
      ]);
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

  // Add a helper function to process tool calls
  const addMessage = (message: ExtendedMessage) => {
    setMessages(prev => [...prev, message]);
  };

  // Updated handleToolCall function with user prompt reincorporation
  const handleToolCall = async (functionCall: any) => {
    const { name, arguments: args } = functionCall;
    
    try {
      console.log(`Processing tool call: ${name}`, args);
      setIsExecutingTool(true);
      
      // Parse arguments if they're a string
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      
      // Ensure ID is in the correct format (9-character alphanumeric)
      const toolCallId = functionCall.id && functionCall.id.length === 9 && /^[a-z0-9]+$/.test(functionCall.id)
        ? functionCall.id
        : generateValidToolCallId();
      
      // Get the last user message to reincorporate
      const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
      
      // Call the ToolService to get real results
      const result = await ToolService.callTool(name, parsedArgs);
      
      // Add result to toolResults with proper ID format
      setToolResults(prev => [...prev, { id: toolCallId, result }]);
      
      // If the result includes a continuation prompt, add it to the conversation
      if (result.continuation) {
        // Add a special formatting marker in the result to force continued generation
        result.content = result.content.replace(/"success":\s*true/, '"success": true, "_continue": true');
        
        // Add the original user query to help the model continue
        if (lastUserMessage) {
          result.content = result.content.replace(
            /}$/,
            `, "_original_user_query": ${JSON.stringify(lastUserMessage.content)}}`
          );
          
          // Update the continuation prompt to reference the user's original query
          result.continuation = `Based on the tool result above AND the user's original question: "${lastUserMessage.content}", 
            continue generating your response. You must address the user's original query directly.`;
        }
      }
      
      return {
        ...result,
        toolCallId // Add the toolCallId to the result for reference
      };
    } catch (err) {
      const error = err as Error;
      console.error(`Exception calling tool ${name}:`, error);
      
      // Get the last user message to reincorporate even on error
      const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
      
      return { 
        role: 'system',
        success: false,
        error: `Failed to call tool: ${error.message}`,
        toolCallId: functionCall.id || generateValidToolCallId(),
        content: JSON.stringify({
          success: false,
          error: `Failed to call tool: ${error.message}`,
          _original_user_query: lastUserMessage?.content || ""
        }),
        continuation: lastUserMessage ? 
          `Despite this error, please address the user's original question: "${lastUserMessage.content}"` : 
          "Despite this error, please continue generating a helpful response."
      };
    } finally {
      setIsExecutingTool(false);
    }
  };

  // Update the processToolCalls function for proper ID handling
  const processToolCalls = async (content: string) => {
    // First try to find function calls using regex
    const functionCallRegex = /function_call:\s*({[\s\S]*?})\s*(?=function_call:|$)/g;
    const matches = content.matchAll(functionCallRegex);
    let processedAnyCalls = false;
    
    console.log("Checking for tool calls in:", content.substring(0, 100) + "...");
    
    for (const match of matches) {
      try {
        const functionCallStr = match[1];
        if (!functionCallStr) continue;
        
        console.log("Found function call:", functionCallStr);
        
        // Try to parse the function call JSON
        let functionCall: FunctionCall;
        try {
          functionCall = JSON.parse(functionCallStr);
        } catch (error) {
          // If JSON parsing fails, try to extract components manually
          console.log("Attempting to parse function call manually:", functionCallStr);
          
          // Extract ID - ensure it's valid or generate a new one
          const idMatch = functionCallStr.match(/"id"\s*:\s*"([^"]+)"/);
          const rawId = idMatch ? idMatch[1] : '';
          // Validate the ID format or generate a new one
          const id = (rawId && rawId.length === 9 && /^[a-z0-9]+$/.test(rawId))
            ? rawId
            : generateValidToolCallId();
          
          // Extract name
          const nameMatch = functionCallStr.match(/"name"\s*:\s*"([^"]+)"/);
          const name = nameMatch ? nameMatch[1] : '';
          
          // Extract arguments
          const argsMatch = functionCallStr.match(/"arguments"\s*:\s*({[^}]+}|"[^"]+")/);
          let args = argsMatch ? argsMatch[1] : '{}';
          
          // Create the function call object
          functionCall = {
            id,
            name,
            arguments: args
          };
        }
        
        // If we have a valid function call, process it
        if (functionCall.name) {
          // Ensure ID is in the correct format
          if (!functionCall.id || functionCall.id.length !== 9 || !/^[a-z0-9]+$/.test(functionCall.id)) {
            functionCall.id = generateValidToolCallId();
          }
          
          console.log("Processing tool call:", functionCall.name, "with ID:", functionCall.id);
          const result = await handleToolCall(functionCall);
          if (result) {
            processedAnyCalls = true;
            
            // Add the tool result to messages for display
            setMessages(prev => [...prev, {
              role: 'tool',
              content: JSON.stringify(result, null, 2),
              tool_call_id: functionCall.id
            }]);
            
            console.log("Added tool result to messages with ID:", functionCall.id);
          }
        }
      } catch (error) {
        console.error("Error processing function call:", error);
      }
    }
    
    // Continue the conversation if we processed any tool calls
    if (processedAnyCalls) {
      console.log("Tool calls processed, continuing conversation...");
      setIsInToolExecutionChain(true);
      
      // Use setTimeout to ensure state updates have completed
      setTimeout(() => {
        continueLLMConversation();
      }, 100);
    } else {
      console.log("No tool calls processed or processed successfully");
      setIsInToolExecutionChain(false);
    }
  };
  
  // Add a continuation method to the LLM conversation
  const continueLLMConversation = async () => {
    console.log("Continuing conversation. Tool execution chain:", isInToolExecutionChain);
    
    try {
      setIsProcessing(true);
      console.log("Starting to process conversation continuation");
      
      // Get the last messages to provide context
      const lastUserMessageIndex = [...messages].reverse().findIndex(msg => msg.role === 'user');
      if (lastUserMessageIndex === -1) {
        console.log('No user message found, cannot continue conversation');
        setIsInToolExecutionChain(false);
        return;
      }
      
      // Include the user message and all subsequent messages
      const actualIndex = messages.length - 1 - lastUserMessageIndex;
      const recentMessages = messages.slice(actualIndex);

      // Add a special system message to ensure continuation
      const continuationPrompt: ExtendedMessage = {
        role: 'system',
        content: `You must continue your response to the user's query. Do not repeat what you've already said, but continue with new information or complete your previous thoughts. Be thorough and complete in your continuation. Reference the user's original question explicitly to maintain context.`
      };
      
      // Format a simpler context - avoid tool_call_id altogether
      let formattedContext: Message[] = [];
      
      // Add the user's original query
      formattedContext.push({
        role: 'user' as const,
        content: recentMessages[0].content || '',
      });
      
      // Add the continuation prompt
      formattedContext.push(continuationPrompt);
      
      // Collect all tool results into a single assistant response
      let toolResults = '';
      for (let i = 1; i < recentMessages.length; i++) {
        const msg = recentMessages[i];
        if (msg.role === 'tool') {
          let resultData;
          try {
            resultData = JSON.parse(msg.content);
          } catch (e) {
            resultData = { content: msg.content };
          }
          
          toolResults += `\n\nTool Result:\n${JSON.stringify(resultData, null, 2)}`;
        }
      }
      
      // If we have tool results, add them as an assistant message
      if (toolResults) {
        formattedContext.push({
          role: 'assistant' as const, 
          content: `I've retrieved the following information:${toolResults}\n\nLet me analyze this information and provide you with a comprehensive answer.`
        });
      }
      
      console.log('Simplified context:', formattedContext.map(m => ({ 
        role: m.role, 
        content: m.content?.substring(0, 50) 
      })));
      
      // Get model configuration
      const modelConfig = await AIFileService.getModelConfigForPurpose('agent');
      const modelId = modelConfig.modelId;
      
      if (!modelId) {
        throw new Error('No model ID configured for agent purpose');
      }
      
      // Log what we're sending to the model
      console.log('Continuing conversation with simplified format. Model:', modelId);
      
      // Format the API config with the conversation context
      const apiConfig = {
        model: modelId,
        messages: [
          {
            role: 'system' as const,
            content: 'You are a helpful AI assistant. You have access to various tools to help answer the user\'s questions. Based on the tool results, you MUST continue generating a complete response that directly addresses the user\'s original question.',
          },
          ...formattedContext
        ],
        temperature: modelConfig.temperature || 0.7,
        max_tokens: modelConfig.maxTokens || -1,
        top_p: modelConfig.topP,
        frequency_penalty: modelConfig.frequencyPenalty,
        presence_penalty: modelConfig.presencePenalty,
        // Add tools configuration for agent mode
        tools: [
          {
            type: "function",
            function: {
              name: "read_file",
              description: "Read the contents of a file",
              parameters: {
                type: "object",
                properties: {
                  file_path: {
                    type: "string",
                    description: "The path to the file to read"
                  }
                },
                required: ["file_path"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "list_directory",
              description: "List the contents of a directory",
              parameters: {
                type: "object",
                properties: {
                  directory_path: {
                    type: "string",
                    description: "The path to the directory to list"
                  }
                },
                required: ["directory_path"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "web_search",
              description: "Search the web for information",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The search query"
                  },
                  num_results: {
                    type: "integer",
                    description: "Number of results to return (default: 3)"
                  }
                },
                required: ["query"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "fetch_webpage",
              description: "Fetch and extract content from a webpage",
              parameters: {
                type: "object",
                properties: {
                  url: {
                    type: "string",
                    description: "The URL of the webpage to fetch"
                  }
                },
                required: ["url"]
              }
            }
          }
        ],
        tool_choice: "auto"
      };
      
      // Debug log to check if tools are present
      console.log('Continuation - API Config:', JSON.stringify({
        ...apiConfig,
        messages: '[Messages included]',
        tools: apiConfig.tools ? `[${apiConfig.tools.length} tools included]` : 'No tools',
        tool_choice: apiConfig.tool_choice || 'No tool_choice'
      }, null, 2));
      
      let finalContent = '';
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Thinking...'
      }]);
      
      console.log("Calling AI with simplified context");
      
      // Add timeout mechanism
      let timeoutId: number | null = null;
      const requestTimeout = 30000; // 30 seconds timeout
      
      // Create a promise that will reject after the timeout
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("AI response timeout after " + requestTimeout / 1000 + " seconds"));
        }, requestTimeout) as unknown as number;
      });
      
      try {
        // Race the API call against the timeout
        await Promise.race([
          lmStudio.createStreamingChatCompletion({
            model: modelId,
            messages: apiConfig.messages,
            temperature: apiConfig.temperature || 0.7,
            max_tokens: apiConfig.max_tokens || -1,
            top_p: apiConfig.top_p,
            frequency_penalty: apiConfig.frequency_penalty,
            presence_penalty: apiConfig.presence_penalty,
            tools: apiConfig.tools,
            tool_choice: apiConfig.tool_choice,
            purpose: 'agent',
            onUpdate: async (content: string) => {
              if (!content) return;
              
              // Clear timeout on first response
              if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
              }
              
              finalContent = content;
              
              console.log("Received content update:", content.substring(0, 50) + "...");
              
              // Update the last message with the new content
              setMessages((prev: ExtendedMessage[]): ExtendedMessage[] => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                  const lastIndex = newMessages.length - 1;
                  if (newMessages[lastIndex].role === 'assistant') {
                    newMessages[lastIndex] = {
                      role: 'assistant',
                      content: content
                    };
                  }
                }
                return newMessages;
              });
              
              // Only process tool calls if we have valid content
              if (content && content.includes('function_call:')) {
                console.log("Detected new tool calls in response");
                try {
                  // We want to avoid an infinite loop, so we'll set isInToolExecutionChain to false
                  // before processing the new tool calls
                  setIsInToolExecutionChain(false);
                  
                  // Then process the new tool calls
                  setTimeout(() => {
                    processToolCalls(content);
                  }, 100);
                } catch (toolError) {
                  console.error('Error processing tool calls:', toolError);
                }
              }
            }
          }),
          timeoutPromise
        ]);
      } catch (error) {
        // Handle timeout or other errors
        console.error("Error during AI call:", error);
        setMessages((prev: ExtendedMessage[]): ExtendedMessage[] => {
          const newMessages = [...prev];
          if (newMessages.length > 0) {
            const lastIndex = newMessages.length - 1;
            if (newMessages[lastIndex].role === 'assistant') {
              newMessages[lastIndex] = {
                role: 'assistant',
                content: `Sorry, there was an error generating a response: ${(error as Error).message}`
              };
            }
          }
          return newMessages;
        });
        
        // Ensure we clear the timeout if it's still active
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
      
      // Check if we actually received a response
      if (!finalContent || finalContent.trim() === '') {
        console.error("AI response completed but no content was returned");
        setMessages((prev: ExtendedMessage[]): ExtendedMessage[] => {
          // Find the last message and update it
          const newMessages = [...prev];
          if (newMessages.length > 0) {
            const lastIndex = newMessages.length - 1;
            if (newMessages[lastIndex].role === 'assistant' && 
                (newMessages[lastIndex].content === '' || newMessages[lastIndex].content === 'Thinking...')) {
              newMessages[lastIndex] = {
                role: 'assistant',
                content: 'Sorry, I was unable to generate a response. Please try again.'
              };
            }
          }
          return newMessages;
        });
      } else {
        console.log("AI response completed with content:", finalContent.substring(0, 50) + "...");
      }
      
      setIsInToolExecutionChain(false);

      // Extract and queue code blocks for auto-insert, similar to handleSubmit
      const codeBlocks = extractCodeBlocks(finalContent);
      if (codeBlocks.length > 0) {
        setPendingInserts(prev => [
          ...prev,
          ...codeBlocks.map(block => ({ filename: block.filename, content: block.content }))
        ]);
        
        setTimeout(() => {
          preloadInsertModel();
        }, 3000);
      }

    } catch (error) {
      console.error('Error continuing conversation:', error);
      setIsInToolExecutionChain(false);
      
      // Add a helpful error message
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, I encountered an error while processing the tool results: ${(error as Error).message || 'Unknown error'}`
        }
      ]);
    } finally {
      setIsProcessing(false);
      setIsStreamingComplete(true);
    }
  };

  // Update the message rendering to handle the new message structure
  const renderMessage = (message: ExtendedMessage, index: number) => {
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';
    const isTool = message.role === 'tool';
    
    return (
      <div 
        key={index} 
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <div 
          className={`max-w-[80%] rounded-lg p-4 ${
            isUser 
              ? 'bg-blue-500 text-white' 
              : isTool
                ? 'bg-gray-200 text-gray-800'
                : 'bg-gray-100 text-gray-800'
          }`}
        >
          {isTool ? (
            <div className="text-sm">
              <pre className="whitespace-pre-wrap">{message.content}</pre>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none">
              {message.content.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      className="llm-chat"
      style={{
        display: isVisible ? 'flex' : 'none',
        flexDirection: 'column',
        position: 'fixed',
        top: '32px', // Account for titlebar height
        right: 0,
        width: `${width}px`,
        height: 'calc(100vh - 54px)', // Subtract titlebar (32px) + statusbar (22px)
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-primary)',
        zIndex: 1,
      }}
    >
      <div style={{ 
        padding: '10px', 
        borderBottom: '1px solid var(--border-primary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '35px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ChatModeSwitch mode={mode} onModeChange={setMode} />
          <div className="chat-switcher">
            <button
              onClick={() => setIsChatListVisible(!isChatListVisible)}
              className="settings-button"
              title="Switch chats"
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
                  onClick={handleNewChat}
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
                {chats.length === 0 ? (
                  <div style={{ padding: '10px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                    No saved chats
                  </div>
                ) : (
                  chats.map(chat => (
                    <button
                      key={chat.id}
                      className="chat-button"
                      onClick={() => handleSelectChat(chat.id)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: chat.id === currentChatId ? 'var(--bg-hover)' : 'none',
                        border: 'none',
                        borderBottom: '1px solid var(--border-primary)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: chat.id === currentChatId ? 'bold' : 'normal' }}>
                        {chat.name}
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: 'var(--text-secondary)',
                        marginTop: '2px' 
                      }}>
                        {new Date(chat.createdAt).toLocaleString()}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onClose}
            className="close-button"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
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

      {/* Auto-insert indicator */}
      <AutoInsertIndicator 
        count={pendingInserts.length} 
        isProcessing={autoInsertInProgress} 
      />
    </div>
  );
} 