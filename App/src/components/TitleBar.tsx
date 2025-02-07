import React from 'react';

const TitleBar: React.FC = () => {
  const handleMinimize = () => {
    if (window.electron) {
      window.electron.send('minimize-window');
    }
  };

  const handleMaximize = () => {
    if (window.electron) {
      window.electron.send('maximize-window');
    }
  };

  const handleClose = () => {
    if (window.electron) {
      window.electron.send('close-window');
    }
  };

  return (
    <div
      style={{
        height: '32px',
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-primary)',
        WebkitAppRegion: 'drag',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img
          src="/icon.png"
          alt="Pointer"
          style={{ width: '16px', height: '16px' }}
        />
        <span style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
          Pointer
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          WebkitAppRegion: 'no-drag',
        }}
      >
        <button
          onClick={handleMinimize}
          style={{
            width: '46px',
            height: '32px',
            border: 'none',
            background: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          ─
        </button>
        <button
          onClick={handleMaximize}
          style={{
            width: '46px',
            height: '32px',
            border: 'none',
            background: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '18px',
          }}
        >
          □
        </button>
        <button
          onClick={handleClose}
          style={{
            width: '46px',
            height: '32px',
            border: 'none',
            background: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '16px',
            '&:hover': {
              background: 'var(--text-error)',
              color: 'white',
            },
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default TitleBar; 