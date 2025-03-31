import React, { useState, useEffect } from 'react';
import logo from '../assets/logo.png';

declare global {
  interface Window {
    electron?: {
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
      };
    };
  }
}

interface TitlebarProps {
  onOpenFolder?: () => void;
  onOpenFile?: () => void;
}

interface SystemInfo {
  os: {
    system: string;
    release: string;
    version: string;
    machine: string;
    processor: string;
  };
  ram: {
    total: number;
    available: number;
    percent: number;
    used: number;
    free: number;
  };
  cpu: {
    physical_cores: number;
    total_cores: number;
    cpu_freq: any;
    cpu_percent: number;
  };
  gpu: Array<{
    id: number;
    name: string;
    load: number;
    memory_total: number;
    memory_used: number;
    memory_free: number;
    temperature: number;
  }>;
}

const Titlebar: React.FC<TitlebarProps> = ({ onOpenFolder, onOpenFile }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.electron?.window) {
        const maximized = await window.electron.window.isMaximized();
        setIsMaximized(maximized);
      }
    };
    checkMaximized();

    // Add window event listeners
    window.addEventListener('resize', checkMaximized);
    return () => window.removeEventListener('resize', checkMaximized);
  }, []);

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const response = await fetch('http://127.0.0.1:23816/system-information');
        if (response.ok) {
          const data = await response.json();
          setSystemInfo(data);
        }
      } catch (error) {
        console.error('Error fetching system information:', error);
      }
    };

    fetchSystemInfo();
  }, []);

  const handleMinimize = () => {
    window.electron?.window.minimize();
  };

  const handleMaximize = () => {
    window.electron?.window.maximize();
  };

  const handleClose = () => {
    window.electron?.window.close();
  };

  const handleTitleClick = () => {
    window.open('https://pointer.f1shy312.com', '_blank');
  };

  const isWindows = systemInfo?.os.system === 'Windows';

  return (
    <div className={`titlebar ${isWindows ? 'windows' : 'macos'}`}>
      <div className="titlebar-left">
        <img src={logo} alt="Pointer Logo" className="titlebar-logo" />
        <div className="titlebar-divider" />
        <button className="titlebar-action-button" onClick={onOpenFolder}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 2.5A1.5 1.5 0 0 1 3 1h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.12 3H13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12.5v-10z" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
        <button className="titlebar-action-button" onClick={onOpenFile}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h4.379a1.5 1.5 0 0 1 1.06.44l2.122 2.12A1.5 1.5 0 0 1 12.5 3.62V14.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2.5 14.5v-13A1.5 1.5 0 0 1 4 0z" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
      </div>
      <div className="titlebar-title">
        Pointer
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-button" onClick={handleMinimize}>
          &#x2212;
        </button>
        <button className="titlebar-button" onClick={handleMaximize}>
          {isMaximized ? '❐' : '□'}
        </button>
        <button className="titlebar-button close" onClick={handleClose}>
          ✕
        </button>
      </div>
    </div>
  );
};

export default Titlebar; 