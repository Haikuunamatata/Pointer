import React, { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  duration?: number;
  onClose: () => void;
  type?: 'info' | 'success' | 'error';
}

const Toast: React.FC<ToastProps> = ({
  message,
  duration = 5000,
  onClose,
  type = 'info'
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Allow time for fade-out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'var(--success-color, #4caf50)';
      case 'error':
        return 'var(--error-color, #f44336)';
      case 'info':
      default:
        return 'var(--accent-color, #007acc)';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '12px 16px',
        background: getBackgroundColor(),
        color: 'white',
        borderRadius: '4px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
        maxWidth: '400px',
        zIndex: 1100,
        transition: 'opacity 0.3s ease',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        wordBreak: 'break-word',
        fontSize: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>{message}</div>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            marginLeft: '12px',
            padding: '0',
            fontSize: '18px',
            opacity: 0.8,
          }}
          onMouseOver={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseOut={(e) => { e.currentTarget.style.opacity = '0.8'; }}
        >
          ×
        </button>
      </div>
    </div>
  );
};

// Toast manager to handle multiple toasts
export class ToastManager {
  private static listeners: ((toast: { message: string; type?: 'info' | 'success' | 'error' }) => void)[] = [];
  
  static subscribe(listener: (toast: { message: string; type?: 'info' | 'success' | 'error' }) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  static show(message: string, type: 'info' | 'success' | 'error' = 'info') {
    this.listeners.forEach(listener => listener({ message, type }));
  }
}

export default Toast; 