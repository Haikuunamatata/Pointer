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
  onToggleGitView?: () => void;
  isGitViewActive?: boolean;
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

const Titlebar: React.FC<TitlebarProps> = ({ 
  onOpenFolder, 
  onOpenFile,
  onToggleGitView,
  isGitViewActive
}) => {
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
        {onToggleGitView && (
          <button 
            className="titlebar-action-button" 
            onClick={onToggleGitView}
            style={isGitViewActive ? { backgroundColor: 'var(--accent-color)', color: 'white' } : {}}
            title="Git"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.698 7.287L8.712 0.302C8.51 0.1 8.255 0 7.986 0C7.717 0 7.463 0.099 7.26 0.302L5.809 1.753L7.644 3.588C7.954 3.491 8.308 3.552 8.552 3.795C8.798 4.041 8.858 4.398 8.757 4.709L10.524 6.476C10.835 6.375 11.193 6.434 11.438 6.681C11.775 7.018 11.775 7.564 11.438 7.901C11.101 8.238 10.555 8.238 10.218 7.901C9.958 7.641 9.904 7.253 10.033 6.929L8.382 5.278V10.795C8.465 10.837 8.546 10.891 8.614 10.959C8.951 11.296 8.951 11.842 8.614 12.179C8.277 12.516 7.73 12.516 7.394 12.179C7.057 11.842 7.057 11.296 7.394 10.959C7.478 10.875 7.576 10.814 7.678 10.776V5.215C7.576 5.177 7.478 5.118 7.394 5.032C7.131 4.769 7.08 4.376 7.213 4.05L5.406 2.244L0.302 7.347C0.099 7.551 0 7.805 0 8.074C0 8.343 0.099 8.597 0.302 8.801L7.288 15.786C7.491 15.988 7.745 16.088 8.014 16.088C8.283 16.088 8.537 15.989 8.74 15.786L15.698 8.827C15.9 8.624 16 8.37 16 8.101C16 7.832 15.901 7.578 15.698 7.374V7.287Z" fill="currentColor"/>
            </svg>
          </button>
        )}
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