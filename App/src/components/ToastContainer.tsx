import React, { useEffect, useState } from 'react';
import Toast, { ToastManager } from './Toast';

interface ToastItem {
  id: number;
  message: string;
  type?: 'info' | 'success' | 'error';
}

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  let nextId = 0;

  useEffect(() => {
    const unsubscribe = ToastManager.subscribe(({ message, type }) => {
      const id = nextId++;
      setToasts(prev => [...prev, { id, message, type }]);
    });

    return () => unsubscribe();
  }, []);

  const handleClose = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <div>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => handleClose(toast.id)}
        />
      ))}
    </div>
  );
};

export default ToastContainer; 