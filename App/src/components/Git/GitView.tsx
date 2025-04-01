import React, { useState, useEffect } from 'react';
import { GitService, GitStatus, GitLogEntry } from '../../services/gitService';
import { FileSystemService } from '../../services/FileSystemService';
import GitStatusView from './GitStatusView';
import GitLogView from './GitLogView';
import GitBranchView from './GitBranchView';
import GitStashView from './GitStashView';
import GitPullRequestView from './GitPullRequestView';

// CSS styles for the GitView
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    borderRight: '1px solid var(--border-color)',
  },
  header: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color)',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-secondary, #1e1e2e)',
  },
  title: {
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    letterSpacing: '1px',
    color: '#bbbbbb',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  iconButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    ':hover': {
      backgroundColor: 'var(--bg-hover)',
    },
  },
  navBar: {
    display: 'flex',
    flexDirection: 'column' as const,
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary, #1e1e2e)',
    padding: '4px 0',
  },
  navButton: {
    background: 'var(--bg-secondary, #1e1e2e)',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px 8px',
    margin: '2px 4px',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    position: 'relative' as const,
    borderRadius: '0',
    transition: 'all 0.1s ease',
    textAlign: 'left' as const,
    height: '24px',
  },
  activeNavButton: {
    color: 'var(--accent-color)',
    backgroundColor: 'var(--bg-selected, #282838)',
    fontWeight: 500,
    borderLeft: '2px solid var(--accent-color)',
    marginLeft: '2px',
  },
  navButtonIcon: {
    width: '16px',
    height: '16px',
    marginRight: '8px',
    flexShrink: 0,
  },
  navButtonLabel: {
    fontSize: '13px',
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
    backgroundColor: 'var(--bg-primary, #282838)',
  },
  notGitRepo: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    textAlign: 'center' as const,
    padding: '20px',
  },
  initButton: {
    background: 'var(--accent-color)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    cursor: 'pointer',
    marginTop: '16px',
    fontSize: '13px',
  },
  dialog: {
    position: 'fixed' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'var(--bg-primary)',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    width: '400px',
    zIndex: 1000,
  },
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  dialogTitle: {
    margin: '0 0 16px 0',
    fontSize: '18px',
    color: 'var(--text-primary)',
  },
  input: {
    width: '100%',
    padding: '8px',
    marginBottom: '12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '16px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: 'var(--accent-color)',
    color: 'white',
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
  cancelButton: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
  },
  statusMessage: {
    position: 'fixed' as const,
    bottom: '20px',
    right: '20px',
    padding: '12px 16px',
    borderRadius: '4px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    zIndex: 1000,
    maxWidth: '400px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusIcon: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
  },
  statusClose: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '4px',
    marginLeft: '8px',
  },
};

// Types of views in the Git panel
type GitViewType = 'status' | 'log' | 'branches' | 'stash' | 'pr';

interface GitViewProps {
  onBack?: () => void;
}

const GitView: React.FC<GitViewProps> = ({ onBack }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [activeView, setActiveView] = useState<GitViewType>('status');
  const [currentDirectory, setCurrentDirectory] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isIdentityDialogOpen, setIsIdentityDialogOpen] = useState(false);
  const [identityName, setIdentityName] = useState('');
  const [identityEmail, setIdentityEmail] = useState('');
  const [isSettingIdentity, setIsSettingIdentity] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'info' | 'success' | 'error';
    id: number;
  } | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  // Add auto-refresh effect
  useEffect(() => {
    let refreshInterval: ReturnType<typeof setInterval>;

    if (isGitRepo && !isLoading) {
      // Check for changes every 2 seconds
      refreshInterval = setInterval(async () => {
        try {
          const status = await GitService.getStatus(currentDirectory);
          // Only refresh if there are changes
          if (status.changes.staged.length > 0 || 
              status.changes.unstaged.length > 0 || 
              status.changes.untracked.length > 0 ||
              status.changes.hasCommitsToPush) {
            setGitStatus(status);
          }
        } catch (err) {
          console.error('Error checking for changes:', err);
        }
      }, 2000);
    }

    // Cleanup interval on unmount or when dependencies change
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [isGitRepo, isLoading, currentDirectory]);

  useEffect(() => {
    const initGitView = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const dir = FileSystemService.getCurrentDirectory();
        if (!dir) {
          setError('No current directory selected');
          setIsLoading(false);
          return;
        }
        
        setCurrentDirectory(dir);
        
        // Check if the current directory is a Git repository
        const isRepo = await GitService.isGitRepository(dir);
        setIsGitRepo(isRepo);
        
        if (isRepo) {
          // Get the Git status
          const status = await GitService.getStatus(dir);
          setGitStatus(status);
        }
      } catch (err) {
        console.error('Error initializing Git view:', err);
        setError(`Error initializing Git view: ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    initGitView();
  }, []);

  const handleInitRepo = async () => {
    if (!currentDirectory) return;
    
    setIsLoading(true);
    try {
      const result = await GitService.initRepo(currentDirectory);
      if (result.success) {
        setIsGitRepo(true);
        const status = await GitService.getStatus(currentDirectory);
        setGitStatus(status);
      } else {
        setError(`Failed to initialize repository: ${result.error}`);
      }
    } catch (err) {
      console.error('Error initializing Git repository:', err);
      setError(`Error initializing Git repository: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const showStatus = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now();
    setStatusMessage({ text, type, id });
    setDebugInfo(prev => [`${new Date().toISOString()} - ${type}: ${text}`, ...prev.slice(0, 49)]);
    
    if (type !== 'error') {  // Don't auto-hide errors
      setTimeout(() => {
        setStatusMessage(current => current?.id === id ? null : current);
      }, 3000);
    }
  };

  const refreshStatus = async (newGitStatus?: GitStatus) => {
    if (!currentDirectory || !isGitRepo) return;
    
    if (newGitStatus) {
      setGitStatus(newGitStatus);
      return;
    }
    
    setIsLoading(true);
    showStatus('Refreshing Git status...', 'info');
    
    try {
      const status = await GitService.getStatus(currentDirectory);
      setGitStatus(status);
      // Only show success message if we're not in a loading state
      if (!isLoading) {
        showStatus('Git status refreshed', 'success');
      }
    } catch (err) {
      const errorMsg = `Error refreshing Git status: ${err}`;
      console.error(errorMsg);
      setError(errorMsg);
      showStatus(errorMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async (message: string) => {
    setCommitMessage(message);
    if (!message.trim()) return;
    
    showStatus('Committing changes...', 'info');
    const result = await GitService.commit(currentDirectory, message);
    
    if (!result.success && result.error === 'IDENTITY_NOT_CONFIGURED') {
      showStatus('Git identity not configured, opening setup...', 'info');
      setIdentityName(result.userName || '');
      setIdentityEmail(result.userEmail || '');
      setIsIdentityDialogOpen(true);
      return;
    }
    
    if (result.success) {
      showStatus('Changes committed successfully', 'success');
      refreshStatus();
    } else {
      const errorMsg = `Commit failed: ${result.error}`;
      console.error(errorMsg);
      showStatus(errorMsg, 'error');
    }
  };

  const handleSetIdentity = async () => {
    if (!identityName.trim() || !identityEmail.trim()) return;
    
    setIsSettingIdentity(true);
    const result = await GitService.setIdentityConfig(currentDirectory, identityName, identityEmail);
    setIsSettingIdentity(false);
    
    if (result.success) {
      setIsIdentityDialogOpen(false);
      // Retry the commit if it was triggered by a commit attempt
      if (commitMessage) {
        handleCommit(commitMessage);
      }
    } else {
      console.error('Failed to set identity:', result.error);
    }
  };

  const handlePush = async () => {
    if (!currentDirectory || !isGitRepo) return;
    
    showStatus('Pushing changes...', 'info');
    const result = await GitService.push(currentDirectory);
    
    if (result.success) {
      showStatus(result.data, 'success');
      refreshStatus();
    } else {
      const errorMsg = `Push failed: ${result.error}`;
      console.error(errorMsg);
      showStatus(errorMsg, 'error');
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <div style={{ padding: '20px', textAlign: 'center' }}>Loading Git information...</div>;
    }

    if (error) {
      return (
        <div style={{ padding: '20px', color: 'var(--error-color)' }}>
          <p>{error}</p>
          <button onClick={() => setError(null)} style={{ marginTop: '10px' }}>
            Dismiss
          </button>
        </div>
      );
    }

    if (!isGitRepo) {
      return (
        <div style={styles.notGitRepo}>
          <p>Current directory is not a Git repository</p>
          <button onClick={handleInitRepo} style={styles.initButton}>
            Initialize Git Repository
          </button>
        </div>
      );
    }

    switch (activeView) {
      case 'status':
        return <GitStatusView gitStatus={gitStatus} refreshStatus={refreshStatus} onPush={handlePush} />;
      case 'log':
        return <GitLogView />;
      case 'branches':
        return <GitBranchView refreshStatus={refreshStatus} />;
      case 'stash':
        return <GitStashView refreshStatus={refreshStatus} />;
      case 'pr':
        return <GitPullRequestView />;
      default:
        return <GitStatusView gitStatus={gitStatus} refreshStatus={refreshStatus} />;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>GIT</h3>
        <div style={styles.headerActions}>
          <button 
            onClick={() => refreshStatus()} 
            style={styles.iconButton}
            title="Refresh"
            disabled={isLoading || !isGitRepo}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
          {onBack && (
            <button onClick={onBack} style={styles.iconButton} title="Close Git">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18"/>
                <path d="M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      
      {isGitRepo && !isLoading && (
        <div style={styles.navBar}>
          <button 
            style={{
              ...styles.navButton,
              backgroundColor: activeView === 'status' ? 'var(--bg-selected, #282838)' : 'var(--bg-secondary, #1e1e2e)',
              color: activeView === 'status' ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontWeight: activeView === 'status' ? 500 : 'normal',
              borderLeft: activeView === 'status' ? '2px solid var(--accent-color)' : 'none',
              marginLeft: activeView === 'status' ? '2px' : '4px'
            }}
            onClick={() => setActiveView('status')}
            title="Status"
          >
            <div style={styles.iconContainer}>
              <svg style={styles.navButtonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <span style={styles.navButtonLabel}>Status</span>
          </button>
          <button 
            style={{
              ...styles.navButton,
              backgroundColor: activeView === 'log' ? 'var(--bg-selected, #282838)' : 'var(--bg-secondary, #1e1e2e)',
              color: activeView === 'log' ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontWeight: activeView === 'log' ? 500 : 'normal',
              borderLeft: activeView === 'log' ? '2px solid var(--accent-color)' : 'none',
              marginLeft: activeView === 'log' ? '2px' : '4px'
            }}
            onClick={() => setActiveView('log')}
            title="Log"
          >
            <div style={styles.iconContainer}>
              <svg style={styles.navButtonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <span style={styles.navButtonLabel}>Log</span>
          </button>
          <button 
            style={{
              ...styles.navButton,
              backgroundColor: activeView === 'branches' ? 'var(--bg-selected, #282838)' : 'var(--bg-secondary, #1e1e2e)',
              color: activeView === 'branches' ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontWeight: activeView === 'branches' ? 500 : 'normal',
              borderLeft: activeView === 'branches' ? '2px solid var(--accent-color)' : 'none',
              marginLeft: activeView === 'branches' ? '2px' : '4px'
            }}
            onClick={() => setActiveView('branches')}
            title="Branches"
          >
            <div style={styles.iconContainer}>
              <svg style={styles.navButtonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15"/>
                <circle cx="18" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/>
                <path d="M18 9a9 9 0 0 1-9 9"/>
              </svg>
            </div>
            <span style={styles.navButtonLabel}>Branches</span>
          </button>
          <button 
            style={{
              ...styles.navButton,
              backgroundColor: activeView === 'stash' ? 'var(--bg-selected, #282838)' : 'var(--bg-secondary, #1e1e2e)',
              color: activeView === 'stash' ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontWeight: activeView === 'stash' ? 500 : 'normal',
              borderLeft: activeView === 'stash' ? '2px solid var(--accent-color)' : 'none',
              marginLeft: activeView === 'stash' ? '2px' : '4px'
            }}
            onClick={() => setActiveView('stash')}
            title="Stash"
          >
            <div style={styles.iconContainer}>
              <svg style={styles.navButtonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <span style={styles.navButtonLabel}>Stash</span>
          </button>
          <button 
            style={{
              ...styles.navButton,
              backgroundColor: activeView === 'pr' ? 'var(--bg-selected, #282838)' : 'var(--bg-secondary, #1e1e2e)',
              color: activeView === 'pr' ? 'var(--accent-color)' : 'var(--text-secondary)',
              fontWeight: activeView === 'pr' ? 500 : 'normal',
              borderLeft: activeView === 'pr' ? '2px solid var(--accent-color)' : 'none',
              marginLeft: activeView === 'pr' ? '2px' : '4px'
            }}
            onClick={() => setActiveView('pr')}
            title="Pull Requests"
          >
            <div style={styles.iconContainer}>
              <svg style={styles.navButtonIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="18" r="3"/>
                <circle cx="6" cy="6" r="3"/>
                <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
                <line x1="6" y1="9" x2="6" y2="21"/>
              </svg>
            </div>
            <span style={styles.navButtonLabel}>Pull Requests</span>
          </button>
        </div>
      )}
      
      <div style={styles.content}>
        {renderContent()}
      </div>
      
      {statusMessage && (
        <div style={styles.statusMessage}>
          {statusMessage.type === 'info' && (
            <svg style={styles.statusIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12" y2="8"/>
            </svg>
          )}
          {statusMessage.type === 'success' && (
            <svg style={styles.statusIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          )}
          {statusMessage.type === 'error' && (
            <svg style={styles.statusIcon} viewBox="0 0 24 24" fill="none" stroke="var(--error-color)" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          )}
          <span>{statusMessage.text}</span>
          <button 
            style={styles.statusClose}
            onClick={() => setStatusMessage(null)}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default GitView; 