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
// Import configurations from the new chatConfig file
import { 
  INITIAL_SYSTEM_MESSAGE, 
  REFRESH_KNOWLEDGE_PROMPT,
  ExtendedMessage, 
  AttachedFile, 
  ChatSession,
  getFileExtension,
  generateValidToolCallId,
  generatePrompts,
  defaultModelConfigs,
  AFTER_TOOL_CALL_PROMPT
} from '../config/chatConfig';
import { stripThinkTags, extractCodeBlocks } from '../utils/textUtils';

// Add TypeScript declarations for window properties
declare global {
  interface Window {
  lastSaveChatTime?: number;
  chatSaveCounter?: number;
  lastContentLength?: number;
  chatSaveVersion?: number; // Track the version of saves to prevent old overwrites
  lastSavedMessageCount?: number; // Track the number of messages saved
  highestMessageId?: number; // Track the highest message ID we've seen
}
}

// LLMChat props
interface LLMChatProps {
  isVisible: boolean;
  onClose: () => void;
  onResize?: (width: number) => void;
  currentChatId: string;
  onSelectChat: (chatId: string) => void;
}

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
      const mergePrompt = generatePrompts.codeMerging(filename, originalContent, content);

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
        ...(insertModelConfig.maxTokens && insertModelConfig.maxTokens > 0 ? { max_tokens: insertModelConfig.maxTokens } : {}),
        stream: false
      });

      let mergedContent = result.choices[0].message.content.trim();
      
      // Strip <think> tags from the merged content before showing in diff viewer
      mergedContent = stripThinkTags(mergedContent);

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
        const mergePrompt = generatePrompts.codeMerging(filename, originalContent, content);

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
          ...(modelConfig.maxTokens && modelConfig.maxTokens > 0 ? { max_tokens: modelConfig.maxTokens } : {}),
          stream: false
        });

        let mergedContent = result.choices[0].message.content.trim();
        
        // Strip <think> tags from the merged content before showing in diff viewer
        mergedContent = stripThinkTags(mergedContent);

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
  
  // Handle non-string content
  const messageContent = typeof message.content === 'string' 
    ? message.content 
    : JSON.stringify(message.content, null, 2);
  
  // Check if we have an incomplete think block
  const hasIncompleteThink = messageContent.includes('<think>') && 
    !messageContent.includes('</think>');

  // Start timing when a think block starts
  useEffect(() => {
    if (hasIncompleteThink) {
      const thinkStart = Date.now();
      const thinkKey = messageContent; // Use the full message content as the key
      thinkTimes[thinkKey] = thinkStart;
    }
  }, [hasIncompleteThink, messageContent, thinkTimes]);

  // If we have an incomplete think, extract the content after <think>
  if (hasIncompleteThink) {
    const parts = messageContent.split('<think>');
    
    // If the thinking content is empty, just render the content before the <think> tag
    if (!parts[1] || !parts[1].trim()) {
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
            {parts[0]}
          </ReactMarkdown>
        </div>
      );
    }
    
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
  const parts = messageContent.split(/(<think>.*?<\/think>)/s);
  
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
          {messageContent}
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
          
          // Skip rendering if think content is empty
          if (!thinkContent.trim()) {
            return null;
          }
          
          // Calculate actual thinking time using the full message as key
          const thinkKey = messageContent;
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
        marginBottom: '12px', // Increased from 4px to 12px to create more space before tool calls
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="think-block-container" // Added for easier targeting in CSS
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
  // Skip rendering if content is empty
  if (!content || !content.trim()) {
    return null;
  }
  
  return (
    <div
      style={{
        marginTop: '4px',
        marginBottom: '16px', // Increased from 8px to 16px for more space
        padding: '4px 12px',
        color: 'var(--text-secondary)',
        fontSize: '13px',
        opacity: 0.7,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        position: 'relative', // Added for positioning
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
      
      {/* Spacer div to create more separation after thinking blocks and subsequent tool messages */}
      <div style={{
        position: 'absolute',
        height: '10px',
        bottom: '-10px',
        left: 0,
        right: 0,
        pointerEvents: 'none'
      }} />
    </div>
  );
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
  
  /* Add spacing between thinking blocks and subsequent tool messages */
  .think-block-container + div .message.tool {
    margin-top: 12px !important;
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

// Add a function to normalize conversation history before sending to LLM
const normalizeConversationHistory = (messages: ExtendedMessage[]): Message[] => {
  console.log('Normalizing conversation history, messages count:', messages.length);
  
  // Track seen tool call IDs to avoid duplicates
  const seenToolCallIds = new Set<string>();
  
  // First pass: identify and log all tool-related messages
  console.log('--- MESSAGE ANALYSIS START ---');
  messages.forEach((msg, idx) => {
    if (msg.role === 'tool' && msg.tool_call_id) {
      console.log(`Tool response at index ${idx}, ID: ${msg.tool_call_id}, content: ${typeof msg.content === 'string' ? msg.content.substring(0, 50) + '...' : '[object]'}`);
    } else if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls && msg.tool_calls.length > 0) {
      console.log(`Assistant with tool calls at index ${idx}, count: ${msg.tool_calls.length}`);
      msg.tool_calls.forEach(tc => console.log(`  Tool call: ${tc.name}, ID: ${tc.id}, args: ${typeof tc.arguments === 'string' ? tc.arguments.substring(0, 50) + '...' : '[object]'}`));
    } else if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.includes('function_call:')) {
      console.log(`Assistant with function_call string at index ${idx}, content: ${msg.content.substring(0, 100)}...`);
    } else {
      console.log(`Message at index ${idx}, role: ${msg.role}, content: ${typeof msg.content === 'string' ? msg.content.substring(0, 50) + '...' : '[object]'}`);
    }
  });
  console.log('--- MESSAGE ANALYSIS END ---');
  
  // Second pass: filter and normalize messages
  const normalizedMessages = messages
    // First filter out duplicate tool responses - keep only the first one for each tool_call_id
    .filter((msg) => {
      if (msg.role === 'tool' && msg.tool_call_id) {
        if (seenToolCallIds.has(msg.tool_call_id)) {
          console.log(`Filtering out duplicate tool response for ID: ${msg.tool_call_id}`);
          return false;
        }
        seenToolCallIds.add(msg.tool_call_id);
      }
      return true;
    })
    // Then map to the correct format for the API
    .map((msg) => {
      // Handle file attachments
      if (msg.attachments && msg.attachments.length > 0) {
        let contentWithAttachments = msg.content || '';
        if (contentWithAttachments && contentWithAttachments.trim() !== '') {
          contentWithAttachments += '\n\n';
        }
        msg.attachments.forEach(file => {
          contentWithAttachments += `File: ${file.name}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
        });
        return { role: msg.role, content: contentWithAttachments };
      }

      // Handle tool messages - ensure proper formatting
      if (msg.role === 'tool' && msg.tool_call_id) {
        const formattedToolResponse = { 
          role: 'tool' as const, 
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          tool_call_id: msg.tool_call_id
        };
        console.log(`Normalized tool response for ID: ${msg.tool_call_id}`);
        return formattedToolResponse;
      }

      // Special handling for assistant messages with function_call syntax in content
      if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.includes('function_call:')) {
        try {
          // Extract the function call - try multiple patterns
          const functionCallMatch = msg.content.match(/function_call:\s*({[\s\S]*?})(?=function_call:|$)/);
          if (functionCallMatch && functionCallMatch[1]) {
            console.log('Found function_call in content, extracting...');
            let functionCall: any;
            
            try {
              functionCall = JSON.parse(functionCallMatch[1]);
            } catch (e) {
              console.error('Error parsing function call JSON:', e);
              
              // Try manual extraction if JSON parsing fails
              const idMatch = functionCallMatch[1].match(/"id"\s*:\s*"([^"]+)"/);
              const nameMatch = functionCallMatch[1].match(/"name"\s*:\s*"([^"]+)"/);
              const argsMatch = functionCallMatch[1].match(/"arguments"\s*:\s*({[^}]+}|"[^"]+")/);
              
              functionCall = {
                id: idMatch?.[1] || generateValidToolCallId(),
                name: nameMatch?.[1] || 'unknown_function',
                arguments: argsMatch?.[1] || '{}'
              };
              console.log('Manually extracted function call:', functionCall);
            }
            
            // Ensure valid ID format
            if (!functionCall.id || functionCall.id.length !== 9 || !/^[a-z0-9]+$/.test(functionCall.id)) {
              functionCall.id = generateValidToolCallId();
            }
            
            // Create a tool calls format message
            const formattedAssistantMessage = {
              role: 'assistant' as const,
              content: '', // Empty content when it's a tool call
              tool_calls: [{
                id: functionCall.id,
                type: 'function',
                function: {
                  name: functionCall.name,
                  arguments: typeof functionCall.arguments === 'string' ? 
                    functionCall.arguments : JSON.stringify(functionCall.arguments)
                }
              }]
            };
            
            console.log('Converted string function_call to proper tool_calls format:', 
              JSON.stringify(formattedAssistantMessage.tool_calls));
            
            return formattedAssistantMessage;
          }
        } catch (e) {
          console.error('Error extracting function call from content:', e);
          // On error, fallback to original content
        }
      }

      // Handle normal assistant messages with tool_calls property
      if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls && msg.tool_calls.length > 0) {
        // Properly format each tool call
        const formattedToolCalls = msg.tool_calls.map(tc => {
          // Generate valid ID if missing or invalid
          const validId = (!tc.id || tc.id.length !== 9 || !/^[a-z0-9]+$/.test(tc.id)) 
            ? generateValidToolCallId() 
            : tc.id;
            
          return {
            id: validId,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? 
                tc.arguments : JSON.stringify(tc.arguments)
            }
          };
        });
        
        console.log(`Formatted ${formattedToolCalls.length} tool calls for assistant message`);
        
        return {
          role: 'assistant' as const,
          content: '', // Clear content when there are tool calls
          tool_calls: formattedToolCalls
        };
      }

      // Default for regular messages
      return { 
        role: msg.role as ('user' | 'assistant' | 'system' | 'tool'), 
        content: msg.content || '',
        // Include tool_call_id if present
        ...(msg.tool_call_id && {
          tool_call_id: msg.tool_call_id
        })
      };
    });
    
  console.log(`Normalized ${messages.length} messages to ${normalizedMessages.length} messages for API`);
  
  // Log the final normalized messages
  console.log('--- NORMALIZED MESSAGES START ---');
  normalizedMessages.forEach((msg, idx) => {
    if (msg.role === 'tool') {
      console.log(`Normalized tool message at index ${idx}, ID: ${msg.tool_call_id}`);
    } else if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
      console.log(`Normalized assistant with tool_calls at index ${idx}, count: ${msg.tool_calls.length}`);
    } else {
      console.log(`Normalized message at index ${idx}, role: ${msg.role}`);
    }
  });
  console.log('--- NORMALIZED MESSAGES END ---');
  
  // Add the REFRESH_KNOWLEDGE_PROMPT at the beginning of every API call
  // This automatically provides context about the application to every message
  // without requiring the user to explicitly refresh the AI's knowledge
  const refreshKnowledgeMessage: Message = {
    role: REFRESH_KNOWLEDGE_PROMPT.role,
    content: REFRESH_KNOWLEDGE_PROMPT.content
  };
  
  // Return the normalized messages with the refresh knowledge prompt inserted at the beginning
  return [refreshKnowledgeMessage, ...normalizedMessages];
};

export function LLMChat({ isVisible, onClose, onResize, currentChatId, onSelectChat }: LLMChatProps) {
  // Add mode state
  const [mode, setMode] = useState<'chat' | 'agent'>('agent'); // Change to agent by default for testing
  
  // Update the initial state and types to use ExtendedMessage
  const [messages, setMessages] = useState<ExtendedMessage[]>([INITIAL_SYSTEM_MESSAGE]);
  const [currentMessageId, setCurrentMessageId] = useState<number>(1); // Track current message ID
  
  // Function to get the next message ID and increment the counter
  const getNextMessageId = () => {
    const nextId = currentMessageId;
    setCurrentMessageId(prevId => prevId + 1);
    return nextId;
  };
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
  // Add state for auto-insert setting
  const [autoInsertEnabled, setAutoInsertEnabled] = useState(true);
  // Add state to track processed code blocks to avoid duplicates during streaming
  const [processedCodeBlocks, setProcessedCodeBlocks] = useState<Set<string>>(new Set());

  // Add state for tracking expanded tool calls
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  
  // Toggle expansion state of a tool call
  const toggleToolCallExpansion = useCallback((toolCallId: string) => {
    setExpandedToolCalls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolCallId)) {
        newSet.delete(toolCallId);
      } else {
        newSet.add(toolCallId);
      }
      return newSet;
    });
  }, []);

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
  
  // Add a state variable to track thinking content
  const [thinking, setThinking] = useState<string>('');
  
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
  const generateChatTitle = async (messages: ExtendedMessage[]): Promise<string> => {
    try {
      const modelId = await AIFileService.getModelIdForPurpose('chat');
      
      // Get model settings from localStorage
      const modelConfigStr = localStorage.getItem('modelConfig');
      const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : defaultModelConfigs.chat;

      // Use the prompt from chatConfig
      const prompt = generatePrompts.titleGeneration(messages);

      // Create completion with the conversation
      const result = await lmStudio.createCompletion({
        model: modelId,
        prompt: prompt,
        temperature: modelConfig.temperature || 0.3,
        max_tokens: 20
        // Remove the 'stream: false' property that was causing linter error
      });

      // Extract and clean the generated title
      let title = result.choices[0].text.trim();
      // Remove quotes if present
      if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
        title = title.substring(1, title.length - 1);
      }
      return title || 'New Chat';
    } catch (err) { // Fixed the error variable name
      console.error('Error generating chat title:', err);
      return 'New Chat';
    }
  };


  // Function to save chat
  const saveChat = async (chatId: string, messages: ExtendedMessage[], reloadAfterSave = false) => {
    try {
      if (messages.length <= 1) return; // Don't save if only system message exists
      
      // For important save operations (user messages, AI completions, tool calls), always save
      // regardless of timing
      const now = Date.now();
      const lastSaveTime = window.lastSaveChatTime || 0;
      const timeSinceLastSave = now - lastSaveTime;
      
      // Skip very frequent saves only for streaming incremental updates
      // For important operations (reloadAfterSave=true), always save
      if (timeSinceLastSave < 100 && !reloadAfterSave) {
        console.log(`Skipping incremental save - too soon after previous save (${timeSinceLastSave}ms)`);
        return;
      }
      
      console.log(`Saving chat with ${reloadAfterSave ? 'reload' : 'no reload'} - operation type: ${reloadAfterSave ? 'critical' : 'incremental'}`);
      
      // Increment the save version to track most recent save
      window.chatSaveVersion = (window.chatSaveVersion || 0) + 1;
      const currentSaveVersion = window.chatSaveVersion;
      
      // Record that we're saving now
      window.lastSaveChatTime = now;
      
      let title = chatTitle;
      
      // Filter out continuation system messages before saving
      const filteredMessages = messages.filter((msg: ExtendedMessage) => {
        // Keep the first system message (instructions) but filter out continuation prompts
        if (msg.role === 'system') {
          const isFirstSystemMessage = messages.findIndex(m => m.role === 'system') === messages.indexOf(msg);
          const isContinuationPrompt = msg.content.includes("address the original question directly") || 
                                      msg.content.includes("Be concise and address the original question");
          return isFirstSystemMessage && !isContinuationPrompt;
        }
        return true;
      });
      
      // Deduplicate messages to prevent duplications
      const deduplicatedMessages: ExtendedMessage[] = [];
      const processedMessageIds = new Set<number>();
      
      // Function to generate a unique key for a message
      const getMessageKey = (msg: ExtendedMessage): string => {
        // If message has ID, use it as the primary identifier
        if (msg.messageId !== undefined) {
          return `id:${msg.messageId}`;
        }
        
        // For tool messages, include the tool_call_id to identify uniquely
        if (msg.role === 'tool' && msg.tool_call_id) {
          return `tool:${msg.tool_call_id}:${msg.content.substring(0, 50)}`;
        }
        // For assistant messages with tool calls, include the tool call IDs
        else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          const toolCallIds = msg.tool_calls.map(tc => tc.id).join(',');
          return `assistant:toolcalls:${toolCallIds}`;
        }
        // For other messages, use role and content (truncated)
        else {
          return `${msg.role}:${typeof msg.content === 'string' ? 
            msg.content.substring(0, 100) : JSON.stringify(msg.content).substring(0, 100)}`;
        }
      };
      
      // Deduplicate messages: prioritize using message IDs for deduplication
      if (filteredMessages.length > 0) {
        // Always add the first message
        deduplicatedMessages.push(filteredMessages[0]);
        if (filteredMessages[0].messageId !== undefined) {
          processedMessageIds.add(filteredMessages[0].messageId);
        }
        
        for (let i = 1; i < filteredMessages.length; i++) {
          const currentMsg = filteredMessages[i];
          
          // If message has ID, use it for deduplication
          if (currentMsg.messageId !== undefined) {
            if (!processedMessageIds.has(currentMsg.messageId)) {
              deduplicatedMessages.push(currentMsg);
              processedMessageIds.add(currentMsg.messageId);
              console.log(`Added message with ID: ${currentMsg.messageId}`);
            } else {
              console.log(`Skipping duplicate message with ID: ${currentMsg.messageId}`);
            }
            continue;
          }
          
          // For messages without ID, use the old comparison logic
          const prevMsg = deduplicatedMessages[deduplicatedMessages.length - 1];
          if (currentMsg.role === prevMsg.role && getMessageKey(currentMsg) === getMessageKey(prevMsg)) {
            console.log(`Skipping duplicate message (identical to previous and same role): ${getMessageKey(currentMsg)}`);
          } else {
            deduplicatedMessages.push(currentMsg);
          }
        }
      }
      
      console.log(`Deduplicated ${filteredMessages.length} messages to ${deduplicatedMessages.length} messages`);
      
      const messagesToSave = deduplicatedMessages.map((msg: ExtendedMessage) => {
        const cleanedMsg: any = {
          role: msg.role,
          content: msg.content || '',
          // Preserve messageId if it exists
          ...(msg.messageId !== undefined && { messageId: msg.messageId })
        };
        
        if (msg.role === 'assistant' && typeof msg.content === 'string' && 
            msg.content.includes('function_call:') && !msg.tool_calls) {
          try {
            console.log('Found function_call string in content during save, extracting...');
            const functionCallMatch = msg.content.match(/function_call:\\s*({[\\s\\S]*?})(?=function_call:|$)/);
            if (functionCallMatch && functionCallMatch[1]) {
              let functionCall: any;
              
              try {
                functionCall = JSON.parse(functionCallMatch[1]);
              } catch (e) {
                console.error('Error parsing function call JSON:', e);
                
                // Try manual extraction if JSON parsing fails
                const idMatch = functionCallMatch[1].match(/"id"\s*:\s*"([^"]+)"/);
                const nameMatch = functionCallMatch[1].match(/"name"\s*:\s*"([^"]+)"/);
                const argsMatch = functionCallMatch[1].match(/"arguments"\s*:\s*({[^}]+}|"[^"]+")/);
                
                functionCall = {
                  id: idMatch?.[1] || generateValidToolCallId(),
                  name: nameMatch?.[1] || 'unknown_function',
                  arguments: argsMatch?.[1] || '{}'
                };
              }
              
              // Convert to proper tool_calls format
              cleanedMsg.tool_calls = [{
                id: functionCall.id || generateValidToolCallId(),
                type: 'function',
                function: {
                  name: functionCall.name,
                  arguments: typeof functionCall.arguments === 'string' ? 
                    functionCall.arguments : JSON.stringify(functionCall.arguments)
                }
              }];
              
              // Empty content for tool calls
              cleanedMsg.content = '';
              
              console.log('Converted function_call content to tool_calls for storage:', 
                cleanedMsg.tool_calls[0].function.name);
            }
          } catch (e) {
            console.error('Error handling function_call in content:', e);
          }
        }
        // Handle tool_calls for assistant messages
        else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          // Store tool calls with proper format
          cleanedMsg.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id || generateValidToolCallId(),
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? 
                tc.arguments : JSON.stringify(tc.arguments)
            }
          }));
          
          // If this is a pure tool call with no content, make sure content is empty string
          if (!msg.content) {
            cleanedMsg.content = '';
          }
          
          console.log(`Saving assistant with ${cleanedMsg.tool_calls.length} tool calls: ${
            cleanedMsg.tool_calls.map((tc: any) => tc.function.name).join(', ')
          }`);
        }
        
        // Add tool_call_id if present for tool response messages
        if (msg.tool_call_id) {
          cleanedMsg.tool_call_id = msg.tool_call_id;
          console.log(`Saving tool response for call ID: ${msg.tool_call_id}`);
        }
        
        // Add attachments if present
        if (msg.attachments && msg.attachments.length > 0) {
          cleanedMsg.attachments = msg.attachments;
        }
        
        return cleanedMsg;
      });
      
      // Determine if this is an edit operation
      const isEdit = editingMessageIndex !== null;
      const editIndex = isEdit ? editingMessageIndex : -1;
      
      // For append operations, determine which messages are new
      let messagesToSend = [];
      
      if (isEdit) {
        // When editing, send all messages and mark as edit
        // The backend will truncate at the edit point and append these messages
        messagesToSend = messagesToSave;
        console.log(`Editing message at index ${editIndex}, sending all ${messagesToSend.length} messages`);
      } else {
        // For normal operations, determine what's new since last save
        const lastMsgCount = window.lastSavedMessageCount || 0;
        const currentMsgCount = deduplicatedMessages.length;
        
        if (!window.lastSavedMessageCount) {
          // First save of this session, send all messages
          messagesToSend = messagesToSave;
          console.log(`First save, sending all ${messagesToSend.length} messages`);
        } else if (currentMsgCount > lastMsgCount) {
          // Normal append - only send the new messages
          messagesToSend = messagesToSave.slice(lastMsgCount);
          console.log(`Appending ${messagesToSend.length} new messages`);
        } else {
          // No new messages or message count decreased
          // This shouldn't happen in append-only mode unless there was an edit
          // Send the last message to ensure it's up to date
          messagesToSend = messagesToSave.slice(-1);
          console.log(`No new messages detected, updating last message`);
        }
      }
      
      // First message should include chat title if available
      if (messagesToSend.length > 0 && title) {
        messagesToSend[0].name = title;
      }
      
      // Save the current count for next comparison
      window.lastSavedMessageCount = deduplicatedMessages.length;
      
      // Prepare the request for our append-only backend
      const chatData = {
        messages: messagesToSend,
        is_edit: isEdit,
        edit_index: editIndex,
        overwrite: false // Only use overwrite in special cases
      };
      
      try {
        // Use AbortController to set a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const saveResponse = await fetch(`http://localhost:23816/chats/${chatId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
          body: JSON.stringify(chatData),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!saveResponse.ok) {
          throw new Error(`Failed to save chat: ${saveResponse.status} ${saveResponse.statusText}`);
        }
        
        // Parse the response to get message count
        const saveResult = await saveResponse.json();
        
        // Update our saved message count with the actual count from server
        if (saveResult.message_count) {
          window.lastSavedMessageCount = saveResult.message_count;
          console.log(`Updated lastSavedMessageCount to ${saveResult.message_count} from server`);
        }
        
        // Check if our save version is still the most recent
        if (window.chatSaveVersion === currentSaveVersion) {
          console.log(`Chat saved successfully (version: ${currentSaveVersion}, operation: ${isEdit ? 'edit' : 'append'})`);
          
          // Only reload in specific situations (tool calls, errors) to prevent flickering
          if (reloadAfterSave) {
            // Wait a brief moment to ensure the file is written
            setTimeout(() => {
              // Only reload if our version is still current
              if (window.chatSaveVersion === currentSaveVersion) {
                console.log(`Reloading chat after critical save operation`);
                // Use a gentler reload that preserves scroll position and prevents flickering
                loadChat(chatId, true);
              }
            }, 200); // Slightly longer delay to reduce visual disruption
          }
        } else {
          console.log(`Skipping post-save actions - newer save version exists: ${window.chatSaveVersion} > ${currentSaveVersion}`);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error('Save operation timed out after 10 seconds');
        } else {
          console.error('Error in fetch operation during chat save:', error);
        }
      }
    } catch (error) {
      console.error('Error in saveChat function:', error);
    }
  };

  // Load chat data with cache-busting
  const loadChat = async (chatId: string, forceReload = false) => {
    // Fixed issue: Now we always respect forceReload parameter even during streaming
    // Don't reload the chat if we're streaming a response, UNLESS a force reload is requested
    if (isStreamingComplete === false && !forceReload) {
      console.log('Skipping loadChat due to active streaming');
      return;
    }
    
    try {
      // Store current chat ID as a local variable
      const currentId = chatId;
      setIsProcessing(true);
      
      // Check if we need a full reload or just new messages
      const shouldFetchAll = forceReload || !messages.length || !window.lastSavedMessageCount;
      
      let url = `http://localhost:23816/chats/${chatId}`;
      
      // If we already have messages, and it's not a forced reload, use the /latest endpoint
      if (!shouldFetchAll && window.lastSavedMessageCount) {
        // Get only messages after our current count
        url = `http://localhost:23816/chats/${chatId}/latest?after_index=${window.lastSavedMessageCount}`;
        console.log(`Fetching only new messages after index ${window.lastSavedMessageCount}`);
      } else if (forceReload) {
        console.log(`Force reloading all messages for chat ${chatId}`);
      }
      
      console.log(`Loading chat from ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          // Chat not found, create a new one
          const systemMsg: ExtendedMessage = { role: 'system', content: INITIAL_SYSTEM_MESSAGE.content };
          setMessages([systemMsg]);
          saveChat(chatId, [systemMsg]);
          setIsProcessing(false);
          setEditingMessageIndex(null);
          setInput('');
          setAttachedFiles([]);
          return;
        }
        throw new Error(`Failed to load chat: ${response.status} ${response.statusText}`);
      }
  
      const data = await response.json();
      console.log('Loaded chat data:', data);
      
      if (data && data.messages && Array.isArray(data.messages)) {
        // Update title if available
        if (data.name && data.name !== 'New Chat') {
          setChatTitle(data.name);
        }
        
        // Process the loaded messages
        const processedMessages = data.messages.map((msg: any) => {
          // Ensure role exists and is valid
          if (!msg.role || !['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
            console.warn(`Invalid message role: ${msg.role}, defaulting to 'user'`);
            msg.role = 'user';
          }
          
          // Ensure content exists
          if (msg.content === undefined || msg.content === null) {
            msg.content = '';
          }
          
          // Create a properly typed message
          const typedMsg: ExtendedMessage = {
            role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
            content: msg.content
          };
          
          // Preserve message ID if present
          if (msg.messageId !== undefined) {
            typedMsg.messageId = msg.messageId;
          }
          
          // Add tool_call_id if present (for tool response messages)
          if (msg.tool_call_id) {
            typedMsg.tool_call_id = msg.tool_call_id;
          }
          
          // Add tool_calls if present (for assistant messages)
          if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            typedMsg.tool_calls = msg.tool_calls.map((tc: any) => {
              // Ensure function exists
              if (!tc.function) {
                console.warn('Missing function in tool call:', tc);
                tc.function = { name: 'unknown', arguments: '{}' };
              }
              
              return {
                id: tc.id || generateValidToolCallId(),
                name: tc.function.name,
                type: 'function',
                arguments: tc.function.arguments
              };
            });
          }
          
          // Add attachments if present
          if (msg.attachments && Array.isArray(msg.attachments)) {
            typedMsg.attachments = msg.attachments;
          }
          
          return typedMsg;
        });

        // Deduplicate messages after loading
        const deduplicatedMessages: ExtendedMessage[] = [];
        const seenMessageKeys = new Set<string>();
        
        // Function to generate a unique key for a message
        const getMessageKey = (msg: ExtendedMessage): string => {
          // For tool messages, include the tool_call_id to identify uniquely
          if (msg.role === 'tool' && msg.tool_call_id) {
            return `tool:${msg.tool_call_id}:${msg.content.substring(0, 50)}`;
          }
          // For assistant messages with tool calls, include the tool call IDs
          else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
            const toolCallIds = msg.tool_calls.map(tc => tc.id).join(',');
            return `assistant:toolcalls:${toolCallIds}`;
          }
          // For other messages, use role and content (truncated)
          else {
            return `${msg.role}:${typeof msg.content === 'string' ? 
              msg.content.substring(0, 100) : JSON.stringify(msg.content).substring(0, 100)}`;
          }
        };
        
        // Only keep unique messages
        processedMessages.forEach((msg: ExtendedMessage) => {
          const key = getMessageKey(msg);
          if (!seenMessageKeys.has(key)) {
            seenMessageKeys.add(key);
            deduplicatedMessages.push(msg);
          } else {
            console.log(`Skipping duplicate loaded message: ${key}`);
          }
          
          // Check for message ID and update counter if needed
          if (msg.messageId !== undefined) {
            if (msg.messageId >= currentMessageId) {
              setCurrentMessageId(msg.messageId + 1);
              console.log(`Updated message ID counter to ${msg.messageId + 1} based on loaded message`);
            }
          }
        });
        
        console.log(`Deduplicated ${processedMessages.length} loaded messages to ${deduplicatedMessages.length} messages`);
        
        // If we received no messages but we know there should be some, don't clear the UI
        if (deduplicatedMessages.length === 0 && messages.length > 1 && !forceReload) {
          console.warn('Received empty messages array from backend but UI has messages. Keeping current UI state.');
          return;
        }
        
        // If we're fetching only new messages, append them to existing messages
        if (!shouldFetchAll && window.lastSavedMessageCount && messages.length > 0) {
          console.log(`Appending ${deduplicatedMessages.length} new messages to existing messages`);
          setMessages(prevMessages => [...prevMessages, ...deduplicatedMessages]);
          
          // Update our tracking of message count to include the new messages
          window.lastSavedMessageCount = (window.lastSavedMessageCount || 0) + deduplicatedMessages.length;
      } else {
          // For full loads, only replace if we actually got messages
          if (deduplicatedMessages.length > 0) {
            // Ensure the first message is a system message for full loads
            if (deduplicatedMessages[0].role !== 'system') {
              deduplicatedMessages.unshift({ role: 'system', content: INITIAL_SYSTEM_MESSAGE.content });
            }
            
            // Set the messages completely (for full loads)
            setMessages(deduplicatedMessages);
            
            // Update our tracking of message count for the full load
            window.lastSavedMessageCount = deduplicatedMessages.length;
            
            console.log(`Loaded chat ${chatId} with ${deduplicatedMessages.length} total messages`);
          } else {
            // If we got an empty array but requested a full load, initialize with system message
            console.log('Received empty messages array for full load, initializing with system message');
            const systemMsg: ExtendedMessage = { role: 'system', content: INITIAL_SYSTEM_MESSAGE.content };
            setMessages([systemMsg]);
            window.lastSavedMessageCount = 1;
          }
        }
        
        // Reset editing state
        setEditingMessageIndex(null);
        setInput('');
        setAttachedFiles([]);
        
        console.log(`Loaded chat ${chatId} with ${deduplicatedMessages.length} ${shouldFetchAll ? 'total' : 'new'} messages - total now: ${window.lastSavedMessageCount}`);
      } else {
        console.error('Invalid chat data format:', data);
        // Don't reset messages if we already have some
        if (messages.length <= 1) {
          // Initialize with default system message only if we don't have messages
          const systemMsg: ExtendedMessage = { role: 'system', content: INITIAL_SYSTEM_MESSAGE.content };
          setMessages([systemMsg]);
        }
      }
    } catch (error) {
      console.error('Error loading chat:', error);
      // Don't reset messages on error if we already have some
      if (messages.length <= 1) {
        // Initialize with default system message only if we don't have messages
        const systemMsg: ExtendedMessage = { role: 'system', content: INITIAL_SYSTEM_MESSAGE.content };
        setMessages([systemMsg]);
      }
    } finally {
      setIsProcessing(false);
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
    
    // First, find all thinking blocks to exclude code blocks within them
    const thinkBlockRegex = /<think>[\s\S]*?<\/think>/gi;
    const thinkBlocks: Array<{start: number; end: number}> = [];
    
    let thinkMatch;
    while ((thinkMatch = thinkBlockRegex.exec(content)) !== null) {
      thinkBlocks.push({
        start: thinkMatch.index,
        end: thinkMatch.index + thinkMatch[0].length
      });
    }
    
    // Function to check if a position is within any thinking block
    const isInThinkBlock = (position: number) => {
      return thinkBlocks.some(block => position >= block.start && position <= block.end);
    };
    
    // Function to strip think tags from code content
    const stripThinkTags = (codeContent: string): string => {
      return codeContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    };
    
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [fullMatch, language, filename, code] = match;
      const matchStart = match.index;
      
      // Skip this code block if it's within a thinking block
      if (isInThinkBlock(matchStart)) {
        console.log(`Skipping code block for ${filename} as it's within a thinking block`);
        continue;
      }
      
      if (filename && code) {
        // Strip any think tags from the code content
        const cleanedCode = stripThinkTags(code);
        
        // Only add the code block if there's actual content after cleaning
        if (cleanedCode.trim()) {
          codeBlocks.push({
            language,
            filename,
            content: cleanedCode
          });
        } else {
          console.log(`Skipping code block for ${filename} as it contains only thinking content`);
        }
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
          // File doesn't exist - create it directly without AI merging
          console.log(`File ${currentInsert.filename} doesn't exist, creating directly`);
          
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
          
          // Create the file directly with the cleaned content
          const cleanedContent = stripThinkTags(currentInsert.content);
          FileChangeEventService.emitChange(currentInsert.filename, '', cleanedContent);
          
          // Remove the processed insert from the queue
          setPendingInserts(prev => prev.slice(1));
          setAutoInsertInProgress(false);
          return;
        }
      } catch (error) {
        console.error('Error reading file:', error);
        // For errors, create the file directly
        const cleanedContent = stripThinkTags(currentInsert.content);
        FileChangeEventService.emitChange(currentInsert.filename, '', cleanedContent);
        setPendingInserts(prev => prev.slice(1));
        setAutoInsertInProgress(false);
        return;
      }

      // If we reach here, the file exists and we need AI merging
      // Get model ID for insert purpose
      const insertModelId = await AIFileService.getModelIdForPurpose('insert');
      
      // Get insert model settings from localStorage
      const insertModelConfigStr = localStorage.getItem('insertModelConfig');
      const insertModelConfig = insertModelConfigStr ? JSON.parse(insertModelConfigStr) : {
        temperature: 0.2,
        maxTokens: -1,
      };

      // Create a prompt for the AI to merge the changes
      const mergePrompt = generatePrompts.codeMerging(currentInsert.filename, originalContent, currentInsert.content);

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
        ...(insertModelConfig.maxTokens && insertModelConfig.maxTokens > 0 ? { max_tokens: insertModelConfig.maxTokens } : {}),
        stream: false
      });

      let mergedContent = result.choices[0].message.content.trim();
      
      // Strip <think> tags from the merged content before showing in diff viewer
      mergedContent = stripThinkTags(mergedContent);

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
        const mergePrompt = generatePrompts.codeMerging(currentInsert.filename, originalContent, currentInsert.content);

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
          ...(modelConfig.maxTokens && modelConfig.maxTokens > 0 ? { max_tokens: modelConfig.maxTokens } : {}),
          stream: false
        });

        let mergedContent = result.choices[0].message.content.trim();
        
        // Strip <think> tags from the merged content before showing in diff viewer
        mergedContent = stripThinkTags(mergedContent);

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

  // Function to detect and process complete code blocks during streaming
  const processStreamingCodeBlocks = (content: string) => {
    if (!autoInsertEnabled) return;
    
    // Extract code blocks from the current content
    const codeBlocks = extractCodeBlocks(content);
    
    // Process only new code blocks that haven't been processed yet
    codeBlocks.forEach(block => {
      const blockId = `${block.filename}:${block.content.slice(0, 50)}`; // Use filename + content snippet as ID
      
      if (!processedCodeBlocks.has(blockId)) {
        console.log(`Processing new code block during streaming: ${block.filename}`);
        
        // Mark as processed
        setProcessedCodeBlocks(prev => new Set(prev).add(blockId));
        
        // Add to pending inserts
        setPendingInserts(prev => [
          ...prev,
          { filename: block.filename, content: block.content }
        ]);
      }
    });
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
    if (pendingInserts.length > 0 && autoInsertEnabled) {
      const timer = setTimeout(() => {
        processAutoInsert();
      }, 2000); // 2 second delay
      
      return () => clearTimeout(timer);
    }
  }, [pendingInserts, autoInsertInProgress, autoInsertEnabled]);

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

  // Add state for current working directory
  const [currentWorkingDirectory, setCurrentWorkingDirectory] = useState<string>('');

  // Fetch current working directory on component mount
  useEffect(() => {
    const fetchCwd = async () => {
      try {
        const response = await fetch('http://localhost:23816/get-workspace-directory');
        if (response.ok) {
          const data = await response.json();
          setCurrentWorkingDirectory(data.workspace_directory || data.effective_directory || '');
        }
      } catch (error) {
        console.error('Failed to fetch workspace directory:', error);
      }
    };
    
    fetchCwd();
  }, []);

  // System messages for different modes
  const chatSystemMessage = `You are a concise, helpful coding assistant.
Current working directory: ${currentWorkingDirectory || 'Unknown'}
Be direct and to the point. Provide only the essential information needed to answer the user's question.
Avoid unnecessary explanations, introductions, or conclusions unless specifically requested.`;

  const agentSystemMessage = 'You are a powerful agentic AI coding assistant, powered by Claude 3.7 Sonnet. You operate exclusively in Pointer, the world\'s best IDE.\n\n' +
    'Your main goal is to follow the USER\'s instructions at each message.\n\n' +
    '# Additional context\n' +
    'Each time the USER sends a message, we may automatically attach some information about their current state, such as what files they have open, where their cursor is, recently viewed files, edit history in their session so far, linter errors, and more.\n' +
    'Some information may be summarized or truncated.\n' +
    'This information may or may not be relevant to the coding task, it is up for you to decide.\n\n' +
    '# Tone and style\n' +
    'You should be concise, direct, and to the point.\n' +
    'Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks. Never use tools or code comments as means to communicate with the user.\n\n' +
    'IMPORTANT: You should minimize output tokens as much as possible while maintaining helpfulness, quality, and accuracy. Only address the specific query or task at hand, avoiding tangential information unless absolutely critical for completing the request. If you can answer in 1-3 sentences or a short paragraph, please do.\n' +
    'IMPORTANT: Keep your responses short. Avoid introductions, conclusions, and explanations. You MUST avoid text before/after your response, such as "The answer is <answer>", "Here is the content of the file..." or "Based on the information provided, the answer is..." or "Here is what I will do next...". Here are some examples to demonstrate appropriate verbosity:\n\n'

  // Add a shared function to handle both new and edited messages
  const processUserMessage = async (
    content: string, 
    attachments: AttachedFile[] = [], 
    editIndex: number | null = null
  ) => {
    if ((!content.trim() && attachments.length === 0) || isProcessing) return;
    
    try {
      setIsProcessing(true);
      setIsStreamingComplete(false); // Reset streaming complete state
      
      // Auto-accept any pending changes before sending new message
      await autoAcceptChanges();
      
      // Create the user message with ID
      const userMessage: ExtendedMessage = {
        messageId: getNextMessageId(),
        role: 'user',
        content,
        attachments: attachments.length > 0 ? [...attachments] : undefined
      };
      
      console.log(`Created user message with ID: ${userMessage.messageId}`);
      
      // Update messages state based on whether this is an edit or a new message
      let updatedMessages: ExtendedMessage[] = [];
      
      setMessages(prev => {
        if (editIndex !== null) {
          // Editing an existing message
          updatedMessages = [...prev];
          updatedMessages[editIndex] = userMessage;
          // Remove all messages after the edited message
          updatedMessages.splice(editIndex + 1);
        } else {
          // Adding a new message - just append, don't reload the chat
          updatedMessages = [...prev, userMessage];
        }
        
        // Save chat history immediately after adding or editing a user message
        if (currentChatId) {
          // Don't reload after user messages - causes flickering
          saveChat(currentChatId, updatedMessages, false);
        }
        
        return updatedMessages;
      });
      
      setInput('');
      if (editIndex !== null) {
        setEditingMessageIndex(null);
      }
      setAttachedFiles([]);

      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController();

      // Add a temporary message for streaming with ID
      let messagesWithResponse: ExtendedMessage[] = [];
      setMessages(prev => {
        const assistantMessageId = getNextMessageId();
        console.log(`Created empty assistant message with ID: ${assistantMessageId}`);
        messagesWithResponse = [...prev, { 
          role: 'assistant' as const, 
          content: '',
          messageId: assistantMessageId
        }];
        return messagesWithResponse;
      });

      // Clear processed code blocks for the new response
      setProcessedCodeBlocks(new Set());

      // Get model configuration based on mode
      const modelConfig = await AIFileService.getModelConfigForPurpose(mode === 'agent' ? 'agent' : 'chat');
      const modelId = modelConfig.modelId;

      // Use the normalizeConversationHistory function to properly handle tool calls
      const messagesForAPI = normalizeConversationHistory(messagesWithResponse.slice(0, -1)); // Exclude empty assistant message
      
      // Add additional data for agent mode if this is a new message (not an edit)
      if (mode === 'agent' && editIndex === null) {
        const additionalData = {
          current_file: currentWorkingDirectory ? { path: currentWorkingDirectory } : undefined,
          message_count: messages.length,
          mode: 'agent'
        };
        messagesForAPI.push({
          role: 'system',
          content: `<additional_data>${JSON.stringify(additionalData)}</additional_data>`
        });
      }
      
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
        ...(modelConfig.maxTokens && modelConfig.maxTokens > 0 ? { max_tokens: modelConfig.maxTokens } : {}),
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
      
      // For initial messages in agent mode, we use list_directory as default
      if (mode === 'agent' && editIndex === null) {
        apiConfig.tool_choice = {
          type: "function",
          function: {
            name: "list_directory" // Default to list_directory tool
          }
        } as any; // Cast to any to avoid type issues
      }

      // Debug log
      const isEdit = editIndex !== null;
      const logPrefix = isEdit ? 'Edit - ' : '';
      console.log(`${logPrefix}Mode: ${mode}, Tools included: ${apiConfig.tools ? 'yes' : 'no'}`);
      if (mode === 'agent') {
        console.log(`${logPrefix}API Config in agent mode:`, JSON.stringify({
          ...apiConfig,
          messages: '[Messages included]',
          tools: apiConfig.tools ? `[${apiConfig.tools.length} tools included]` : 'No tools',
          tool_choice: apiConfig.tool_choice || 'No tool_choice'
        }, null, 2));
      }

      let currentContent = '';
      // Log what we're about to pass to the API
      console.log(`${logPrefix}Passing to API:`, {
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
              content
            };
            return newMessages;
          });

          // Process code blocks in real-time during streaming
          processStreamingCodeBlocks(content);

          // Process tool calls as needed
          if (mode === 'agent') {
            // Debounce tool call processing
            if (toolCallTimeoutRef) clearTimeout(toolCallTimeoutRef);
            toolCallTimeoutRef = setTimeout(() => {
              processToolCalls(content);
              toolCallTimeoutRef = null;
            }, 300);
          } else {
            await processToolCalls(content);
          }
        }
      });

      // Ensure we process any final tool calls after streaming is complete
      setIsStreamingComplete(true);
      if (mode === 'agent' && currentContent.includes('function_call:')) {
        // Cancel any pending timeout
        if (toolCallTimeoutRef) {
          clearTimeout(toolCallTimeoutRef);
          toolCallTimeoutRef = null;
        }
        setIsInToolExecutionChain(true); 
        await processToolCalls(currentContent);
      } else {
              // Whether there are tool calls or not, always save the final AI message
      if (currentChatId) {
        // Ensure we have the final message content before saving
        const lastMessageIndex = messages.length - 1;
        const updatedMessages = [...messages];
        
        // Make sure the last message has the complete content
        if (updatedMessages[lastMessageIndex]?.role === 'assistant') {
          updatedMessages[lastMessageIndex].content = currentContent;
        }
        
        // Save chat with the complete response but avoid reloading to prevent flickering
        // Only reload if we expect there to be tool calls
        const containsToolCalls = currentContent.includes('function_call:') || 
                                 currentContent.includes('<function_calls>');
        console.log('Saving chat with complete AI response');
        await saveChat(currentChatId, updatedMessages, containsToolCalls);
      }
      }

      // Extract and queue code blocks for auto-insert
      const codeBlocks = extractCodeBlocks(currentContent);
      if (codeBlocks.length > 0 && autoInsertEnabled) {
        setPendingInserts(prev => [
          ...prev,
          ...codeBlocks.map(block => ({ filename: block.filename, content: block.content }))
        ]);
        
        setTimeout(() => {
          preloadInsertModel();
        }, 3000);
      }
      
    } catch (error) {
      console.error(`Error in ${editIndex !== null ? 'handleSubmitEdit' : 'handleSubmit'}:`, error);
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

  // Simplify handleSubmit to use the shared function
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processUserMessage(input, attachedFiles);
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
    
    // Reset content length tracking for the streaming save optimization
    window.lastContentLength = undefined;
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

  // Load auto-insert setting from editor settings
  useEffect(() => {
    const loadAutoInsertSetting = async () => {
      try {
        const response = await fetch('http://localhost:23816/read-file?path=settings/editor.json');
        if (response.ok) {
          const editorSettings = JSON.parse(await response.text());
          setAutoInsertEnabled(editorSettings.autoInsertCodeBlocks !== false); // Default to true if not set
        }
      } catch (error) {
        console.log('Could not load auto-insert setting, using default (enabled)');
      }
    };
    
    loadAutoInsertSetting();
  }, []);

  // Define the saveBeforeToolExecution function
  const saveBeforeToolExecution = useCallback(async () => {
    if (currentChatId && messages.length > 1) {
      console.log('Saving chat before tool execution (external trigger)');
      await saveChat(currentChatId, messages, false);
      return true;
    }
    return false;
  }, [currentChatId, messages, saveChat]);

  // Expose the saveBeforeToolExecution method to the DOM
  useEffect(() => {
    const chatElement = document.querySelector('[data-chat-container="true"]');
    if (chatElement) {
      (chatElement as any).saveBeforeToolExecution = saveBeforeToolExecution;
    }

    return () => {
      // Clean up when component unmounts
      const chatElement = document.querySelector('[data-chat-container="true"]');
      if (chatElement) {
        (chatElement as any).saveBeforeToolExecution = undefined;
      }
    };
  }, [saveBeforeToolExecution]);

  // Remove useEffect for debounced saving as we now save immediately after each change
  // We'll still keep a minimal useEffect to save for any scenario where messages change but not through our direct actions
  useEffect(() => {
    if (currentChatId && messages.length > 1) {
      const saveTimer = setTimeout(() => {
        // Only save if we haven't saved recently
        if (!window.lastSaveChatTime || Date.now() - window.lastSaveChatTime > 5000) {
          saveChat(currentChatId, messages);
        }
      }, 5000); // Much longer debounce time as a safety net
      
      return () => clearTimeout(saveTimer);
    }
  }, [messages, currentChatId]);

  // Listen for save-chat-request events from ToolService
  useEffect(() => {
    const handleSaveChatRequest = (e: CustomEvent) => {
      if (currentChatId && messages.length > 1) {
        console.log('Save chat request received from tool service');
        saveChat(currentChatId, messages);
        // Record that we've saved
        window.lastSaveChatTime = Date.now();
      }
    };

    window.addEventListener('save-chat-request', handleSaveChatRequest as EventListener);
    
    return () => {
      window.removeEventListener('save-chat-request', handleSaveChatRequest as EventListener);
    };
  }, [currentChatId, messages]);

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

  // Function to handle message editing
  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMessageIndex === null) return;
    await processUserMessage(input, attachedFiles, editingMessageIndex);
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
    console.log(`Adding message with role ${message.role}${message.tool_call_id ? ` and tool_call_id ${message.tool_call_id}` : ''}`);
    
    // Ensure the message has all required properties including a messageId
    const formattedMessage: ExtendedMessage = {
      messageId: message.messageId || getNextMessageId(), // Use existing ID or generate a new one
      role: message.role,
      content: message.content || '',
      ...(message.tool_call_id && { tool_call_id: message.tool_call_id }),
      ...(message.tool_calls && message.tool_calls.length > 0 && { tool_calls: message.tool_calls }),
      ...(message.attachments && message.attachments.length > 0 && { attachments: message.attachments })
    };
    
    console.log(`Message assigned ID: ${formattedMessage.messageId}`);
    
    setMessages(prev => {
      const updatedMessages = [...prev, formattedMessage];
      
      // Always save the chat after adding a message
      if (currentChatId) {
        // Only reload after tool messages to avoid flickering
        // Other message types are saved without reloading
        const needsReload = 
          message.role === 'tool' || 
          !!message.tool_call_id || 
          !!message.tool_calls;
          
        // Use a short timeout to let the state update before saving
        setTimeout(() => {
          saveChat(currentChatId, updatedMessages, needsReload);
        }, 50);
      }
      
      return updatedMessages;
    });
  };

  // Updated handleToolCall function with user prompt reincorporation
  const handleToolCall = async (functionCall: any) => {
    const { name, arguments: args, id: rawId } = functionCall;
    
    try {
      console.log(`Processing tool call: ${name}`, args);
      setIsExecutingTool(true);
      
      // Ensure we have a valid ID
      const toolCallId = (rawId && rawId.length === 9 && /^[a-z0-9]+$/.test(rawId))
        ? rawId
        : generateValidToolCallId();
      
      console.log(`Using tool call ID: ${toolCallId} (validated from ${rawId || 'undefined'})`);
      
      // Parse arguments if they're a string
      let parsedArgs;
      try {
        parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      } catch (e) {
        console.error('Error parsing arguments:', e);
        parsedArgs = {};
      }
      
      // Fix relative directory paths for list_directory calls
      if (name === "list_directory" && parsedArgs.directory_path) {
        // Replace "." with actual working directory
        if (parsedArgs.directory_path === "." || parsedArgs.directory_path === "./") {
          parsedArgs.directory_path = currentWorkingDirectory || parsedArgs.directory_path;
          console.log(`Resolved "." to actual working directory: ${parsedArgs.directory_path}`);
        }
        // Handle "./" prefix
        else if (parsedArgs.directory_path.startsWith("./")) {
          parsedArgs.directory_path = (currentWorkingDirectory || "") + 
            parsedArgs.directory_path.substring(1); // Remove the "." but keep the "/"
          console.log(`Resolved "./" prefix to: ${parsedArgs.directory_path}`);
        }
      }
      
      // Apply similar path resolution to read_file
      if (name === "read_file" && parsedArgs.file_path) {
        if (parsedArgs.file_path.startsWith("./")) {
          parsedArgs.file_path = (currentWorkingDirectory || "") + 
            parsedArgs.file_path.substring(1); // Remove the "." but keep the "/"
          console.log(`Resolved relative file path to: ${parsedArgs.file_path}`);
        }
      }
      
      // Call the ToolService to get real results
      const result = await ToolService.callTool(name, parsedArgs);
      
      // After getting the tool result, immediately save the state
      if (currentChatId) {
        // We don't add the tool result to messages here, we'll do it in processToolCalls
        // But we save the current state to ensure it's persistent
        saveChat(currentChatId, messages, false);
      }
      
      // Check if this is an error from the tool service
      if (result?.success === false || !result) {
        const errorMessage = result?.error || "Unknown error";
        console.warn(`Tool call failed for ${name}:`, errorMessage);
        
        // Instead of returning an error as a tool message, add it as an assistant message
        setMessages(prev => {
          const assistantErrorMessage: ExtendedMessage = {
            role: 'assistant',
            content: `I tried to ${name.replace(/_/g, ' ')} but encountered an error: ${errorMessage}\n\nLet me try to help you with what I know instead.`
          };
          
          const updatedMessages = [...prev, assistantErrorMessage];
          
          // Save the chat after adding the error message
          if (currentChatId) {
            saveChat(currentChatId, updatedMessages, true);
          }
          
          return updatedMessages;
        });
        
        // Return null to indicate we handled the error separately
        return null;
      }
      
      // Properly format the tool response
      const formattedResult: ExtendedMessage = {
        role: 'tool',
        content: typeof result.content === 'string' 
          ? result.content 
          : JSON.stringify(result.content, null, 2),
        tool_call_id: toolCallId
      };
      
      console.log(`Tool call ${name} completed successfully with ID: ${toolCallId}`);
      return formattedResult;
    } catch (error) {
      console.error(`Error in handleToolCall for ${name}:`, error);
      
      // Add an error message to the chat
      setMessages(prev => {
        const errorMessage: ExtendedMessage = {
          role: 'assistant',
          content: `I encountered an error trying to ${name.replace(/_/g, ' ')}: ${(error as Error).message}\n\nLet me try a different approach.`
        };
        
        const updatedMessages = [...prev, errorMessage];
        
        // Save the chat after adding the error message
        if (currentChatId) {
          saveChat(currentChatId, updatedMessages, true);
        }
        
        return updatedMessages;
      });
      
      return null;
    } finally {
      setIsExecutingTool(false);
    }
  };



  // Update the processToolCalls function for proper ID handling
  const processToolCalls = async (content: string): Promise<{ hasToolCalls: boolean }> => {
    // First try to find function calls using regex
    const functionCallRegex = /function_call:\s*({[\s\S]*?})\s*(?=function_call:|$)/g;
    const matches = content.matchAll(functionCallRegex);
    let processedAnyCalls = false;
    
    // Create a process version to track this specific tool processing operation
    const processVersion = (window.chatSaveVersion || 0) + 1;
    window.chatSaveVersion = processVersion;
    
    console.log(`Processing tool calls (version: ${processVersion}):\n${content.substring(0, 100)}...`);
    
    // Track current execution to prevent multiple concurrent tool chains
    setIsInToolExecutionChain(true);
    
    // Skip this processing if already running a tool call
    if (isExecutingTool) {
      console.log('Tool already executing, skipping this processing round');
      return { hasToolCalls: false };
    }
    
    // Save chat before processing tools (without checking user messages)
    await saveBeforeToolExecution();
    
    try {
      // Create a set to track tool call IDs that have already been processed
      const processedToolCallIds = new Set<string>();
      
      // Get current messages directly from state to ensure we have the latest data
      let currentMessages: ExtendedMessage[] = [];
      setMessages(prev => {
        currentMessages = [...prev];
        return prev;
      });
      
      // Allow state update to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Find tool call IDs that already have responses in the conversation
      currentMessages.forEach(msg => {
        if (msg.role === 'tool' && msg.tool_call_id) {
          processedToolCallIds.add(msg.tool_call_id);
          console.log(`Found existing tool response for ID: ${msg.tool_call_id}`);
        }
      });
      
      // Extract all function calls from the content
      const functionCalls: FunctionCall[] = [];
      const matchArray = Array.from(content.matchAll(functionCallRegex));
      
      // Parse all function calls first
      for (const match of matchArray) {
        try {
          const functionCallStr = match[1];
          if (!functionCallStr) continue;
          
          // Try to parse the function call JSON
          let functionCall: FunctionCall;
          try {
            functionCall = JSON.parse(functionCallStr.trim());
          } catch (error) {
            // If JSON parsing fails, try to extract components manually
            const idMatch = functionCallStr.match(/"id"\s*:\s*"([^"]+)"/);
            const id = idMatch ? idMatch[1] : generateValidToolCallId();
            
            const nameMatch = functionCallStr.match(/"name"\s*:\s*"([^"]+)"/);
            const name = nameMatch ? nameMatch[1] : '';
            
            const argsMatch = functionCallStr.match(/"arguments"\s*:\s*({[^}]+}|"[^"]+")/);
            let args = argsMatch ? argsMatch[1] : '{}';
            
            // Clean up string arguments if needed
            if (args.startsWith('"') && args.endsWith('"')) {
              try {
                // Try to parse JSON from string
                args = JSON.parse(args);
              } catch (e) {
                // Keep as is if parsing fails
              }
            }
            
            // Create the function call object
            functionCall = {
              id: id,
              name: name,
              arguments: args
            };
          }
          
          // Add to function calls array if valid
          if (functionCall.name) {
            // Ensure ID has correct format
            if (!functionCall.id || functionCall.id.length !== 9 || !/^[a-z0-9]+$/.test(functionCall.id)) {
              functionCall.id = generateValidToolCallId();
            }
            
            // Only add if this is a new function call
            if (!processedToolCallIds.has(functionCall.id)) {
              functionCalls.push(functionCall);
              console.log(`Added function call to processing queue: ${functionCall.name} (ID: ${functionCall.id})`);
            } else {
              console.log(`Skipping already processed function call: ${functionCall.name} (ID: ${functionCall.id})`);
            }
          }
        } catch (error) {
          console.error("Error parsing function call:", error);
        }
      }
      
      // Update the assistant message with proper tool_calls first
      if (functionCalls.length > 0) {
        console.log(`Updating assistant message with ${functionCalls.length} tool calls (version: ${processVersion})`);
        
        // Extract thinking content if present
        let thinkingContent = '';
        const lastMsg = currentMessages[currentMessages.length - 1];
        
        if (lastMsg && lastMsg.role === 'assistant' && typeof lastMsg.content === 'string') {
          // Check for <think> blocks in the content
          const thinkMatch = /<think>([\s\S]*?)<\/think>/g.exec(lastMsg.content);
          if (thinkMatch && thinkMatch[1]) {
            thinkingContent = thinkMatch[1];
            console.log('Extracted thinking content to preserve:', thinkingContent.substring(0, 50) + '...');
          }
          
          // Also check for content before the function_call
          if (!thinkingContent) {
            const contentBeforeFunctionCall = content.split('function_call:')[0].trim();
            if (contentBeforeFunctionCall && contentBeforeFunctionCall.length > 0) {
              // Clean up any potential HTML tags or 'thinking...' messages
              const cleanedThinking = contentBeforeFunctionCall
                .replace(/^Thinking\.\.\./i, '')
                .replace(/^I'm thinking about this\.\.\./i, '')
                .trim();
                
              if (cleanedThinking) {
                thinkingContent = cleanedThinking;
                console.log('Extracted content before function_call:', thinkingContent.substring(0, 50) + '...');
              }
            }
          }
        }
        
        // Update messages with all function calls at once
        setMessages(prev => {
          const newMessages = [...prev];
          const lastAssistantIndex = prev.length - 1;
          
          if (lastAssistantIndex >= 0 && newMessages[lastAssistantIndex].role === 'assistant') {
            // Create the updated assistant message for the tool call
            let updatedAssistantMessage: ExtendedMessage = {
              role: 'assistant' as const,
              content: '', // Clear content since it's a tool call
              tool_calls: functionCalls.map(fc => ({
                id: fc.id,
                name: fc.name,
                arguments: fc.arguments
              }))
            };
            
            // If we extracted thinking content, create a separate message for it
            if (thinkingContent) {
              // Create a separate assistant message with proper think tags
              const thinkingMessage: ExtendedMessage = {
                role: 'assistant' as const,
                content: `${thinkingContent}`
              };
              
              // Replace the current message with thinking content
              newMessages[lastAssistantIndex] = thinkingMessage;
              
              // Add the tool call as a new message
              newMessages.push(updatedAssistantMessage);
            } else {
              // No thinking content, just update with tool calls
              newMessages[lastAssistantIndex] = updatedAssistantMessage;
            }
            
            // Save the updated messages immediately
            if (currentChatId) {
              window.chatSaveVersion = processVersion;
              saveChat(currentChatId, newMessages, false);
            }
          }
          
          return newMessages;
        });
        
        // Wait for state to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Process each tool call sequentially
      for (const functionCall of functionCalls) {
        try {
          // Skip if already processed
          if (processedToolCallIds.has(functionCall.id)) {
            console.log(`Skipping duplicate tool call: ${functionCall.name} (ID: ${functionCall.id})`);
            continue;
          }
          
          // Add to processed set
          processedToolCallIds.add(functionCall.id);
          
          // Set executing flag
          setIsExecutingTool(true);
          console.log(`Executing tool: ${functionCall.name} (ID: ${functionCall.id})`);
          
          // Execute the tool call
            const result = await handleToolCall(functionCall);
            
          // If result is null, error was already handled
            if (result) {
              processedAnyCalls = true;
              
            // Add the tool result to messages
              setMessages(prev => {
              const toolMessage: ExtendedMessage = {
                  ...result,
                role: 'tool',
                  tool_call_id: functionCall.id
                };
                
              const updatedMessages = [...prev, toolMessage];
                
              // Save chat after adding tool result
                if (currentChatId) {
                window.chatSaveVersion = (window.chatSaveVersion || 0) + 1;
                saveChat(currentChatId, updatedMessages, true);
                }
                
                return updatedMessages;
              });
              
            console.log(`Added tool result for ${functionCall.name} (ID: ${functionCall.id})`);
              
            // Wait for state to update
            await new Promise(resolve => setTimeout(resolve, 150));
            } else {
            // Error was already handled
              processedAnyCalls = true;
          }
        } catch (error) {
          console.error(`Error executing tool ${functionCall.name}:`, error);
    } finally {
          // Reset executing flag
          setIsExecutingTool(false);
      }
    }
    } finally {
    // Continue the conversation if we processed any tool calls
    if (processedAnyCalls) {
      console.log("Tool calls processed, continuing conversation...");
      
        // Continue conversation with slight delay
      setTimeout(() => {
        continueLLMConversation();
        }, 300);
    } else {
        console.log("No tool calls processed");
      setIsInToolExecutionChain(false);
      }
    }
    
    return { hasToolCalls: processedAnyCalls };
  };
  
  // Add a continuation method to the LLM conversation
  const continueLLMConversation = async () => {
    console.log("Continuing conversation. Tool execution chain:", isInToolExecutionChain);
    
    try {
      setIsProcessing(true);
      
      // Create a continuation version to track this specific continuation
      const continuationVersion = (window.chatSaveVersion || 0) + 1;
      window.chatSaveVersion = continuationVersion;
      
      console.log(`Starting to process conversation continuation (version: ${continuationVersion})`);
      
      // First, make sure we have the most up-to-date chat data
      if (currentChatId) {
        // Load the chat with fresh data from disk with force reload
        await loadChat(currentChatId, true);
        console.log(`Reloaded chat for continuation (version: ${continuationVersion})`);
        
        // Check if our version is still valid
        if ((window.chatSaveVersion || 0) !== continuationVersion) {
          console.log(`Abandoning continuation - version changed during loading: ${window.chatSaveVersion} != ${continuationVersion}`);
          setIsProcessing(false);
          setIsInToolExecutionChain(false);
          return;
        }
      }
      
      // Don't filter or truncate the messages at all - use ALL messages
      // This ensures we have the complete context with all tool calls and results
      // Get a fresh copy of the messages from state to ensure we have the latest data
      let relevantMessages: ExtendedMessage[] = [];
      setMessages(prev => {
        relevantMessages = [...prev];
        return prev;
      });
      
      // Allow state update to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log(`Including ALL ${relevantMessages.length} messages for context`);
      
      // Get the last user message for the continuation prompt
      const lastUserMessage = [...relevantMessages].reverse().find(msg => msg.role === 'user');
      
      // Add the AFTER_TOOL_CALL_PROMPT as the continuation prompt for better tool call handling
      const continuationPrompt: ExtendedMessage = {
        role: AFTER_TOOL_CALL_PROMPT.role,
        content: AFTER_TOOL_CALL_PROMPT.content
      };
      
      // Prepare conversation context that includes everything the model needs
      const conversationContext: Message[] = [
        ...normalizeConversationHistory(relevantMessages),
        // Add the continuation prompt at the end
        continuationPrompt
      ];
      
      console.log('Complete conversation context:', conversationContext.map(m => ({ 
        role: m.role, 
        content: m.content?.substring(0, 50),
        tool_call_id: m.tool_call_id || undefined
      })));
      
      // Get model configuration
      const modelConfig = await AIFileService.getModelConfigForPurpose('agent');
      const modelId = modelConfig.modelId;
      
      if (!modelId) {
        throw new Error('No model ID configured for agent purpose');
      }
      
      // Log what we're sending to the model
      console.log('Continuing conversation with complete context. Model:', modelId);
      console.log('Full messages being sent to API:', JSON.stringify(conversationContext.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? 
          (m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content) : 
          'Non-string content',
        tool_call_id: m.tool_call_id || undefined
      })), null, 2));
      
      // Format the API config with the full conversation context
      const apiConfig = {
        model: modelId,
        messages: conversationContext,
        temperature: modelConfig.temperature || 0.7,
        ...(modelConfig.maxTokens && modelConfig.maxTokens > 0 ? { max_tokens: modelConfig.maxTokens } : {}),
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
        model: modelConfig.modelId,
        messageCount: apiConfig.messages.length,
        toolsIncluded: apiConfig.tools ? apiConfig.tools.length : 0,
        toolChoice: apiConfig.tool_choice
      }));
      
      console.log("Calling AI with complete context");
      
      // Add timeout mechanism
      const timeoutId = setTimeout(() => {
        console.log("Conversation continuation timed out");
        setIsProcessing(false);
        setIsInToolExecutionChain(false);
        addMessage({
          role: 'assistant',
          content: "I apologize, but I'm having trouble continuing our conversation. Let me try to answer based on what I know already."
        });
      }, 30000); // 30 seconds timeout
      
      // Add the initial empty response message for streaming
      setMessages(prev => {
        const newMessages = [...prev, { 
          role: 'assistant' as const, 
          content: '' 
        }];
        return newMessages;
      });
      
      // Let state update before starting the stream
      await new Promise(resolve => setTimeout(resolve, 50));
      
      let currentContent = '';
      // Add a debounce timeout reference for tool calls
      let toolCallTimeoutRef: ReturnType<typeof setTimeout> | null = null;
      
      // Use streaming API for continuation
        try {
          await lmStudio.createStreamingChatCompletion({
            model: modelId,
            messages: apiConfig.messages as any,
            temperature: modelConfig.temperature || 0.7,
            top_p: modelConfig.topP || 1,
            frequency_penalty: modelConfig.frequencyPenalty || 0,
            presence_penalty: modelConfig.presencePenalty || 0,
            tools: apiConfig.tools,
            tool_choice: apiConfig.tool_choice,
            purpose: 'agent',
          onUpdate: async (content) => {
            currentContent = content;
            
            // Check for function calls in streaming content
            const hasFunctionCall = content.includes('function_call:');
            let newMessage: ExtendedMessage = {
              role: 'assistant',
              content: content
            };
            
            // If we have a function call, try to extract and properly format it
            if (hasFunctionCall) {
              try {
                // Try multiple patterns to extract function calls
                const functionCallMatch = content.match(/function_call:\s*({[\s\S]*?})(?=function_call:|$)/);
                
                if (functionCallMatch && functionCallMatch[1]) {
                  console.log('Detected function call in streaming response:', functionCallMatch[1].substring(0, 50) + '...');
                  
                  try {
                    // Parse the function call
                    const functionCallJson = functionCallMatch[1].trim();
                    const functionCall = JSON.parse(functionCallJson);
                    
                    // Ensure we have a valid ID and other required fields
                    const toolCall = {
                      id: functionCall.id || generateValidToolCallId(),
                      name: functionCall.name || '',
                      arguments: functionCall.arguments || '{}'
                    };
                    
                    if (toolCall.name) {
                      console.log(`Extracted tool call during streaming: ${toolCall.name} with ID ${toolCall.id}`);
                      
                      // Format as a proper tool call message
                      newMessage = {
                        role: 'assistant',
                        content: '',
                        tool_calls: [{
                          id: toolCall.id,
                          name: toolCall.name,
                          arguments: toolCall.arguments
                        }]
                      };
                      
                      console.log('Created properly formatted tool_calls structure for streaming response');
                    }
                  } catch (e) {
                    console.error('Error parsing function call in streaming response:', e);
                    // Continue with regular content if parsing fails
                  }
                }
              } catch (e) {
                console.error('Error processing function call in streaming response:', e);
              }
            }
            
            // Update the messages state with the streaming content
            setMessages(prev => {
              const newMessages = [...prev];
              // Update the last message with the new content
              newMessages[newMessages.length - 1] = newMessage;
              
              // Save chat during streaming with proper tool_calls format
              if (currentChatId && (!window.lastContentLength || 
                  Math.abs(content.length - window.lastContentLength) > 100)) {
                window.lastContentLength = content.length;
                
                // Increment the version to ensure we're not overwritten
                window.chatSaveVersion = (window.chatSaveVersion || 0) + 1;
                const saveVersion = window.chatSaveVersion;
                
                setTimeout(() => {
                  // Only save if our version is still current
                  if ((window.chatSaveVersion || 0) === saveVersion) {
                    saveChat(currentChatId, newMessages, false);
                  }
                }, 100);
              }
              
              return newMessages;
            });
            
            // In agent mode, debounce the tool call processing
            if (hasFunctionCall) {
              // Clear any existing timeout
              if (toolCallTimeoutRef) {
                clearTimeout(toolCallTimeoutRef);
              }
              
              // Set a new timeout to process tool calls after 300ms of no updates
              toolCallTimeoutRef = setTimeout(() => {
                processToolCalls(content);
                toolCallTimeoutRef = null;
              }, 300);
            }
            }
          });
          
          clearTimeout(timeoutId);
        console.log('Final continuation response:', currentContent);
        
        // Set streaming complete flag
        setIsStreamingComplete(true);
        
        // Save the chat with final content
        if (currentChatId) {
          console.log('AI response completed - saving final chat state');
          
          // Get current messages to ensure we have the latest state
          let currentMessages: ExtendedMessage[] = [];
          setMessages(prev => {
            currentMessages = [...prev];
            
            // Update the last message with the complete content
            if (currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role === 'assistant') {
              currentMessages[currentMessages.length - 1].content = currentContent;
            }
            
            return currentMessages;
          });
          
          // Let the state update
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Save chat without reload to prevent flickering
          // Only reload if the message contains tool calls
          const containsToolCalls = currentContent.includes('function_call:') || 
                                   currentContent.includes('<function_calls>');
          await saveChat(currentChatId, currentMessages, containsToolCalls);
        }
        
        // Process any final tool calls after streaming is complete
        if (currentContent.includes('function_call:')) {
          console.log('Processing final tool calls after streaming completion');
          // Cancel any pending timeout
          if (toolCallTimeoutRef) {
            clearTimeout(toolCallTimeoutRef);
            toolCallTimeoutRef = null;
          }
          // Process immediately
          const toolCallResult = await processToolCalls(currentContent);
          
          // If no tool calls were processed, reset tool execution chain
          if (!toolCallResult.hasToolCalls) {
            setIsInToolExecutionChain(false);
          }
        } else {
          // If there are no function calls, process any code blocks
          // Extract and queue code blocks for auto-insert
          const codeBlocks = extractCodeBlocks(currentContent);
          if (codeBlocks.length > 0 && autoInsertEnabled) {
            setPendingInserts(prev => [
              ...prev,
              ...codeBlocks.map(block => ({ filename: block.filename, content: block.content }))
            ]);
            
            setTimeout(() => {
              preloadInsertModel();
            }, 3000);
          }
          
          // Reset tool execution chain state when there are no tool calls
            setIsInToolExecutionChain(false);
          }
          
        } catch (error) {
          console.error('Error in AI continuation:', error);
          clearTimeout(timeoutId);
          
        setMessages(prev => {
          const newMessages = [...prev];
          // Update the last message with an error message
          if (newMessages[newMessages.length - 1].role === 'assistant' && 
              (!newMessages[newMessages.length - 1].content || 
               newMessages[newMessages.length - 1].content.length < 5)) {
            newMessages[newMessages.length - 1] = {
              role: 'assistant' as const,
              content: "I apologize, but I encountered an error while trying to continue our conversation."
            };
          } else {
            // Add a new message if the last one already has content
            newMessages.push({
              role: 'assistant' as const,
              content: "I apologize, but I encountered an error while trying to continue our conversation."
            });
          }
          return newMessages;
          });
          
          setIsInToolExecutionChain(false);
        }
      
      setIsProcessing(false);
      setThinking('');
    } catch (error) {
      console.error('Error setting up conversation continuation:', error);
      setIsProcessing(false);
      setIsInToolExecutionChain(false);
      setThinking('');
      
      addMessage({
        role: 'assistant',
        content: "I apologize, but I'm having trouble processing your request. Please try again."
      });
    }
  };

  // Update the message rendering to handle the new message structure
  const renderMessage = (message: ExtendedMessage, index: number) => {
    // Skip system messages
    if (message.role === 'system') return null;
    
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
    
    // If editing this message
    if (editingMessageIndex === index + 1) {
      return (
        <div
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            autoFocus
            style={{
              width: '85%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              minHeight: '100px',
              resize: 'vertical',
            }}
          />
          <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCancelEdit}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitEdit}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--accent-color)',
                background: 'var(--accent-color)',
                color: 'var(--text-on-accent)',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            </div>
        </div>
      );
    }
    
    // Handle tool role messages
    if (message.role === 'tool') {
      // Parse tool call content to get details
      let content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      let toolName = "Tool";
      const toolCallId = message.tool_call_id || `tool_${index}`;
      const isExpanded = expandedToolCalls.has(toolCallId);
      let toolArgs = null;
      let shortContent = '';
      let detailedTitle = '';
      
      try {
        // Check if the content has the new detailed title format
        if (typeof content === 'string') {
          const firstNewlineIndex = content.indexOf('\n');
          if (firstNewlineIndex > 0) {
            // Extract the detailed title and the rest of the content
            detailedTitle = content.substring(0, firstNewlineIndex).trim();
            content = content.substring(firstNewlineIndex + 1).trim();
          }
        }
        
        // Determine tool type and create appropriate label
        if (message.tool_call_id) {
          const toolCall = messages
            .find(m => m.tool_calls?.some(tc => tc.id === message.tool_call_id))
            ?.tool_calls?.find(tc => tc.id === message.tool_call_id);
            
          if (toolCall) {
            toolName = toolCall.name;
            
            // Store the tool arguments
            toolArgs = typeof toolCall.arguments === 'string' 
              ? toolCall.arguments 
              : JSON.stringify(toolCall.arguments, null, 2);
              
            // Try to parse the arguments if they're a string
            if (typeof toolCall.arguments === 'string') {
              try {
                toolArgs = JSON.stringify(JSON.parse(toolCall.arguments), null, 2);
              } catch (e) {
                // Keep original string if not valid JSON
              }
            }
          }
        } else {
          // Try to extract function call details from the content if tool_call_id is missing
          try {
            // Look for various function_call patterns
            let extractedName = null;
            
            // First try to match the "name":"value" pattern
            const nameMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch && nameMatch[1]) {
              extractedName = nameMatch[1];
            }
            
            // Also try to match function_call pattern
            if (!extractedName) {
              const functionCallMatch = content.match(/function_call:\s*\{.*?"name"\s*:\s*"([^"]+)"/s);
              if (functionCallMatch && functionCallMatch[1]) {
                extractedName = functionCallMatch[1];
              }
            }
            
            // Also look for simpler pattern like list_directory
            if (!extractedName) {
              const simpleCallMatch = content.match(/\b(list_directory|read_file)\b/);
              if (simpleCallMatch) {
                extractedName = simpleCallMatch[1];
              }
            }
            
            if (extractedName) {
              toolName = extractedName;
            }
          } catch (e) {
            // Ignore extraction errors
          }
      }
      
      // Format content for display
      try {
        // Try to clean up the content by removing function call info
        let cleanContent = content;
        const functionCallIndex = content.indexOf('function_call:');
        if (functionCallIndex >= 0) {
          cleanContent = content.substring(0, functionCallIndex).trim();
        }
        
        // If nothing is left, extract useful information from the result
        if (!cleanContent) {
          try {
              // Try to parse the content as JSON
              let resultObj;
              if (typeof content === 'string') {
                resultObj = JSON.parse(content);
              } else {
                resultObj = content;
              }
            
            // Create a simplified preview for collapsed state
            if (typeof resultObj === 'object') {
              if (resultObj.success !== undefined) {
                shortContent = resultObj.success ? 'Operation successful' : 'Operation failed';
              } else if (resultObj.contents) {
                const contentStr = resultObj.contents.toString() || '';
                shortContent = `${contentStr.slice(0, 60)}${contentStr.length > 60 ? '...' : ''}`;
              } else if (Array.isArray(resultObj)) {
                shortContent = `${resultObj.length} items found`;
              } else {
                // Don't show generic text, the dropdown icon is enough
                shortContent = '';
              }
            } else {
              // Don't show generic text, the dropdown icon is enough
              shortContent = '';
            }
          } catch (error) {
            // If not JSON or parsing fails, use the clean content
            shortContent = cleanContent || '';
          }
        } else {
          // Use the cleaned content
          shortContent = cleanContent.split('\n')[0].slice(0, 60) + (cleanContent.length > 60 ? '...' : '');
        }
      } catch (error) {
        // If anything fails, take the first line only
        shortContent = content.split('\n')[0].slice(0, 60) + (content.length > 60 ? '...' : '');
        }
      } catch (e) {
        // Use default if parsing fails
        console.error("Error parsing tool result:", e);
        shortContent = typeof content === 'string' ? 
          content.split('\n')[0].slice(0, 60) + (content.length > 60 ? '...' : '') : 
          'Unknown tool result';
      }
      
      return (
        <div
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            position: 'relative',
            width: '100%',
            opacity: shouldBeFaded ? 0.5 : 1,
            transition: 'opacity 0.2s ease',
            marginTop: '4px', // Reduced from default to minimize space after thoughts
          }}
        >
          <div
            className={`message tool`}
            style={{
              padding: '8px 12px', // Reduced padding for more compact display
              borderRadius: '8px',
              border: '1px solid var(--border-secondary)',
              width: '100%', // Add width to prevent overflow
              boxSizing: 'border-box', // Ensure padding is included in width
              //    boxShadow: index > 0 && messages[index-1]?.role === 'assistant' && messages[index-1]?.content?.includes('<think>') ? '0 2px 6px rgba(0, 0, 0, 0.2)' : 'none', // Add shadow for better separation after thinking blocks
            }}
          >
            <div className="tool-header" onClick={() => toggleToolCallExpansion(toolCallId)}
                 style={{
                   display: 'flex',
                   justifyContent: 'space-between',
                   alignItems: 'center',
                   cursor: 'pointer',
                   padding: '0', // Removed padding for more compact look
                 }}>
              <div className="tool-header-content"
                     style={{
                       display: 'flex',
                       alignItems: 'center',
                       gap: '6px',
                     }}>
                  <span className="tool-icon"
                        style={{
                          display: 'inline-flex',
                          width: '20px',
                          height: '20px',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}>
                    {toolName && toolName === 'read_file' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>}
                  
                    {toolName && toolName === 'list_directory' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>}
                  
                    {toolName && toolName === 'web_search' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>}
                  
                    {toolName && !['read_file', 'list_directory', 'web_search'].includes(toolName) && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>}
                </span>
                  <span style={{ fontSize: '12px' }}>
                    {detailedTitle || (() => {
                      // Try to extract the path from arguments
                      let pathInfo = '';
                      if (toolArgs) {
                        try {
                          // For list_directory, extract directory_path
                          if (toolName === 'list_directory') {
                            const args = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
                            if (args.directory_path) {
                              // Extract just the last part of the path for cleaner display
                              const pathParts = args.directory_path.split(/[/\\]/);
                              const dirName = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || args.directory_path;
                              pathInfo = dirName;
                            }
                          }
                          // For read_file, extract file_path
                          else if (toolName === 'read_file') {
                            const args = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
                            if (args.file_path) {
                              // Extract just the filename for cleaner display
                              const pathParts = args.file_path.split(/[/\\]/);
                              const fileName = pathParts[pathParts.length - 1];
                              pathInfo = fileName;
                            }
                          }
                          // For web_search, extract query
                          else if (toolName === 'web_search') {
                            const args = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
                            if (args.query || args.search_term) {
                              pathInfo = args.query || args.search_term;
                            }
                          }
                        } catch (e) {
                          // Ignore parsing errors
                        }
                      }

                      // Generate human-friendly descriptions
                      if (toolName === 'read_file') {
                        return `Read file${pathInfo ? `: ${pathInfo}` : ''}`;
                      } else if (toolName === 'list_directory') {
                        return `Listed directory${pathInfo ? `: ${pathInfo}` : ''}`;
                      } else if (toolName === 'web_search') {
                        return `Searched web${pathInfo ? ` for "${pathInfo}"` : ''}`;
                      } else if (toolName) {
                        // Default for other tool types
                        return toolName.replace(/_/g, ' ') + (shortContent ? `: ${shortContent}` : '');
                      } else {
                        return 'Used tool' + (shortContent ? `: ${shortContent}` : '');
                      }
                    })()}
                  </span>
              </div>
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                style={{
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>

            {!isExpanded && !shortContent && (
              <div style={{
                padding: '2px 0',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}>
                {/* Empty div for spacing when no content to show */}
            </div>
          )}
            
            {isExpanded && toolArgs && (
              <div style={{
                marginTop: '8px',
                padding: '8px',
                background: 'var(--bg-tertiary)',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                overflowX: 'auto',
              }}>
                <div style={{
                  marginBottom: '4px',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}>Arguments Used:</div>
                {toolArgs}
        </div>
            )}
            
            {isExpanded && (
              <>
                <div style={{
                  marginTop: '8px',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}>Result:</div>
                <pre style={{
                  marginTop: '4px',
                  padding: '8px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre-wrap',
                  overflowX: 'auto',
                  maxHeight: isExpanded ? 'none' : '80px',
                  overflow: isExpanded ? 'auto' : 'hidden',
                }}>
              {content}
            </pre>
              </>
            )}
          </div>
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
          alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
          position: 'relative',
          width: '100%',
          opacity: shouldBeFaded ? 0.5 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        <div
          className={`message ${message.role}`}
          style={{
            background: message.role === 'user' ? 'var(--bg-primary)' : 'var(--bg-secondary)',
            padding: '12px',
            borderRadius: '8px',
            maxWidth: '85%',
            border: message.role === 'user' ? '1px solid var(--border-primary)' : 'none',
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
  };

  // Add a function to restart the conversation with fresh data
  const restartConversation = async () => {
    if (!currentChatId) return;
    
    console.log("Restarting conversation with fresh data");
    setIsProcessing(true);
    
    try {
      // Force reload the chat from disk when switching chats
      // Remove the conditional that skips loading when messages exist
      await loadChat(currentChatId, true);
      
      // Reset tool execution state
      setIsInToolExecutionChain(false);
      setIsExecutingTool(false);
      
      // Clear any thinking state
      setThinking('');
      
      console.log("Conversation restarted successfully");
    } catch (error) {
      console.error("Error restarting conversation:", error);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Add an automatic recovery mechanism for stuck tool chains
  useEffect(() => {
    if (isInToolExecutionChain) {
      // Set a timeout to auto-recover from stuck tool chains
      const recoveryTimeout = setTimeout(() => {
        if (isInToolExecutionChain) {
          console.log("Tool execution chain possibly stuck, attempting auto-recovery");
          restartConversation();
        }
      }, 30000); // 30 seconds timeout
      
      return () => clearTimeout(recoveryTimeout);
    }
  }, [isInToolExecutionChain, currentChatId]);
  
  // Also restart when changing chats
  useEffect(() => {
    if (currentChatId) {
      restartConversation();
          }
    }, [currentChatId]);

  if (!isVisible) return null;

  return (
    <div 
      ref={containerRef}
      className="llm-chat"
      data-chat-container="true"
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
          {/* Remove Refresh Knowledge button since it's always included now */}
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
          gap: '12px', // Changed from 16px to 12px for tighter spacing
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
            {messages.slice(1).map((message, index) => renderMessage(message, index))}
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
      {autoInsertEnabled && (
      <AutoInsertIndicator 
        count={pendingInserts.length} 
        isProcessing={autoInsertInProgress} 
      />
      )}
    </div>
  );
} 