import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ExtendedMessage } from '../config/chatConfig';

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface ChatMessageProps {
  message: ExtendedMessage;
  index: number;
  isAnyProcessing?: boolean;
  onEditMessage?: (index: number) => void;
}

const ChatMessage = memo(({ message, index, isAnyProcessing = false, onEditMessage }: ChatMessageProps) => {
  const handleEdit = () => {
    if (onEditMessage) {
      onEditMessage(index);
    }
  };

  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      components={{
        code({ className, children, ...props }: CodeProps) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          const code = String(children).replace(/\n$/, '');
          
          if (!props.inline && language) {
            return (
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={language}
                PreTag="div"
                customStyle={{
                  margin: '0',
                  borderRadius: '4px',
                  fontSize: '13px',
                }}
              >
                {code}
              </SyntaxHighlighter>
            );
          }
          
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-color)',
        background: message.role === 'user' ? 'var(--bg-secondary)' : 'var(--bg-primary)',
      }}
    >
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '8px' 
      }}>
        <div style={{
          fontSize: '12px',
          fontWeight: 'bold',
          color: message.role === 'user' ? 'var(--accent-color)' : 'var(--success-color)',
          textTransform: 'uppercase',
        }}>
          {message.role === 'user' ? 'You' : 'Assistant'}
        </div>
        {message.role === 'user' && onEditMessage && (
          <button
            onClick={handleEdit}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '11px',
            }}
            title="Edit message"
          >
            Edit
          </button>
        )}
      </div>
      <div style={{ 
        color: 'var(--text-primary)', 
        lineHeight: '1.5',
        fontSize: '14px',
      }}>
        {renderMarkdown(message.content)}
      </div>
      {message.timestamp && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          marginTop: '8px',
        }}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage; 