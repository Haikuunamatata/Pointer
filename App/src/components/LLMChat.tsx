import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { lmStudio } from '../services/LMStudioService';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { v4 as uuidv4 } from 'uuid';
import '../styles/LLMChat.css';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  name: string;
  createdAt: string;
  messages: Message[];
}

interface LLMChatProps {
  isVisible: boolean;
  onClose: () => void;
  onResize?: (width: number) => void;
  currentChatId: string;
  onSelectChat: (chatId: string) => void;
}

// Simplified system message
const INITIAL_SYSTEM_MESSAGE: Message = {
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

This will display the filename above the code block to provide better context.`
};

// Copy button component for code blocks
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
        right: '10px',
        top: '10px',
        background: copied ? 'var(--accent-color-transparent)' : 'rgba(30, 30, 30, 0.7)',
        border: 'none',
        borderRadius: '4px',
        padding: '6px 10px',
        color: copied ? 'var(--accent-color)' : 'var(--text-secondary)',
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
        transform: copied ? 'scale(1.05)' : 'scale(1)',
        zIndex: 5,
      }}
      title={copied ? 'Copied!' : 'Copy code'}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
};

// Language badge component for code blocks
const LanguageBadge: React.FC<{ language: string }> = ({ language }) => {
  if (!language) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: '10px',
        top: '10px',
        background: 'rgba(30, 30, 30, 0.7)',
        borderRadius: '4px',
        padding: '3px 8px',
        color: 'var(--text-secondary)',
        fontSize: '11px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        backdropFilter: 'blur(3px)',
        zIndex: 5,
      }}
    >
      {language}
    </div>
  );
};

// Filename display component for code blocks
const FilenameBar: React.FC<{ filename: string }> = ({ filename }) => {
  if (!filename) return null;

  return (
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
      {filename}
    </div>
  );
};

// Add this near the top with other component definitions
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
          position: 'absolute',
          right: '10px',
          top: '10px',
          display: 'flex',
          gap: '8px',
          zIndex: 5,
        }}
      >
        <CopyButton content={content} />
            </div>
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

// Add this near the top with other interfaces
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
const MessageRenderer: React.FC<{ message: Message }> = ({ message }) => {
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
  }, [hasIncompleteThink, message.content]);

  // If we have an incomplete think, extract the content after <think>
  if (hasIncompleteThink) {
    const parts = message.content.split('<think>');
    return (
      <>
        {/* Render content before <think> tag */}
        {parts[0] && (
          <div className="message-content">
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
                  const content = String(children).replace(/\n$/, '');
                  
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
                  const content = String(children).replace(/\n$/, '');
                  
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

export function LLMChat({ isVisible, onClose, onResize, currentChatId, onSelectChat }: LLMChatProps) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_SYSTEM_MESSAGE]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [width, setWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [isChatListVisible, setIsChatListVisible] = useState(false);
  const [chatTitle, setChatTitle] = useState<string>('');
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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
  const generateChatTitle = (messages: Message[]): string => {
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
  const generateAISummary = async (messages: Message[]): Promise<string> => {
    try {
      if (messages.length <= 1) return "New Chat";
      
      // Get model configuration from localStorage
      const modelConfigStr = localStorage.getItem('modelConfig');
      const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : {
        id: 'default-model',
        name: 'Default Model',
        temperature: 0.7,
        maxTokens: 15, // Limit tokens for brief summary
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      };
      
      // Create a summary prompt with the conversation
      const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join("\n");
      
      const summaryPrompt: Message[] = [
        { 
          role: 'system', 
          content: 'You are a helpful assistant that generates extremely concise chat titles. Respond with ONLY 3-4 words that summarize the following user messages. No punctuation at the end.'
        },
        { role: 'user', content: userMessages.slice(0, 500) } // Limit input size
      ];
      
      // Make the API call to get a summary
      const response = await fetch('http://localhost:23816/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelConfig.id || modelConfig.name,
          messages: summaryPrompt,
          temperature: 0.7,
          max_tokens: 15,
          top_p: 1,
          stream: false
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate AI summary');
      }
      
      const result = await response.json();
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
  const saveChat = async (chatId: string, messages: Message[]) => {
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
      if (!response.ok) {
        throw new Error('Failed to load chat');
      }
      
      const chat = await response.json();
      if (chat && Array.isArray(chat.messages)) {
        // Ensure system message exists
        const systemMessage = chat.messages.find((m: Message) => m.role === 'system');
        const updatedMessages = systemMessage 
          ? chat.messages 
          : [INITIAL_SYSTEM_MESSAGE, ...chat.messages];
        
        setMessages(updatedMessages);
        // Set chat title from loaded chat
        setChatTitle(chat.name || '');
        console.log('Chat loaded successfully');
      } else {
        // If invalid data, start a new chat with system message
        setMessages([INITIAL_SYSTEM_MESSAGE]);
        setChatTitle('');
      }
    } catch (error) {
      console.error('Error loading chat:', error);
      // On error, start a new chat with system message
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

  // Handle submission of messages
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      // Add user message
      const userMessage: Message = { role: 'user', content: input };
      setMessages(prev => [...prev, userMessage]);
      setInput('');

      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController();

      // Add a temporary message for streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Get model configuration from localStorage
      const modelConfigStr = localStorage.getItem('modelConfig');
      const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : {
        id: 'default-model',
        name: 'Default Model',
        temperature: 0.7,
        maxTokens: -1,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      };

      // Prepare messages for API
      const messagesForAPI = messages
        .concat(userMessage)
        .map(msg => ({ role: msg.role, content: msg.content }));
      
      // Call the LMStudio API
      await lmStudio.createStreamingChatCompletion({
        model: modelConfig.id || modelConfig.name,
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

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isProcessing || editingMessageIndex === null) return;
    
    try {
      setIsProcessing(true);
      
      // Update the edited message
      const updatedMessages = [...messages];
      updatedMessages[editingMessageIndex] = { role: 'user', content: input };
      
      // Remove all messages after the edited message
      updatedMessages.splice(editingMessageIndex + 1);
      
      setMessages(updatedMessages);
      setInput('');
      setEditingMessageIndex(null);

      // Add a temporary message for streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      // Get model configuration from localStorage
      const modelConfigStr = localStorage.getItem('modelConfig');
      const modelConfig = modelConfigStr ? JSON.parse(modelConfigStr) : {
        id: 'default-model',
        name: 'Default Model',
        temperature: 0.7,
        maxTokens: -1,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      };

      // Prepare messages for API
      const messagesForAPI = updatedMessages
        .map(msg => ({ role: msg.role, content: msg.content }));
      
      // Call the LMStudio API
      await lmStudio.createStreamingChatCompletion({
        model: modelConfig.id || modelConfig.name,
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
      console.error('Error in handleSubmitEdit:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
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
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '6px',
          cursor: 'col-resize',
          backgroundColor: isResizing ? 'var(--accent-color)' : 'transparent',
          opacity: isResizing ? 0.8 : 0,
          transition: 'opacity 0.2s',
          zIndex: 20,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.4';
          e.currentTarget.style.backgroundColor = 'var(--accent-color)';
        }}
        onMouseLeave={(e) => {
          if (!isResizing) {
            e.currentTarget.style.opacity = '0';
            e.currentTarget.style.backgroundColor = 'transparent';
          }
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
            onClick={handleNewChat}
            className="settings-button"
            title="New Chat"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        <button
          onClick={onClose}
            className="settings-button"
            title="Close"
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
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
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={editingMessageIndex !== null ? handleSubmitEdit : handleSubmit}
        style={{
          borderTop: '1px solid var(--border-primary)',
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
            onChange={(e) => setInput(e.target.value)}
            placeholder={editingMessageIndex !== null ? "Edit your message..." : "Type your message..."}
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
              }
            }}
            disabled={isProcessing}
          />
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
                {editingMessageIndex !== null ? 'Update' : 'Send'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
} 