import React, { useState } from 'react';
import { GitStatus, GitService } from '../../services/gitService';
import { FileSystemService } from '../../services/FileSystemService';

interface GitStatusViewProps {
  gitStatus: GitStatus | null;
  refreshStatus: (newGitStatus?: GitStatus) => Promise<void>;
  onPush?: () => Promise<void>;
}

const styles = {
  container: {
    padding: '0 8px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    padding: '4px 0',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: '13px',
    borderRadius: '4px',
    marginBottom: '4px',
    cursor: 'pointer',
  },
  staged: {
    backgroundColor: 'rgba(0, 170, 0, 0.1)',
  },
  unstaged: {
    backgroundColor: 'rgba(212, 63, 58, 0.1)',
  },
  untracked: {
    backgroundColor: 'rgba(97, 175, 239, 0.1)',
  },
  fileIcon: {
    marginRight: '8px',
    fontSize: '14px',
    width: '14px',
    display: 'inline-block',
    textAlign: 'center' as const,
  },
  button: {
    background: 'var(--bg-accent)',
    color: 'var(--text-primary)',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    marginRight: '8px',
  },
  commitContainer: {
    marginTop: '20px',
    padding: '12px',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '4px',
  },
  commitInput: {
    width: '100%',
    padding: '8px',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    marginBottom: '8px',
    fontSize: '13px',
  },
  noChanges: {
    padding: '12px',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  branchInfo: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '16px',
    padding: '8px 12px',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '4px',
  },
  branchName: {
    fontWeight: 'bold',
    marginLeft: '8px',
  },
  error: {
    color: 'var(--error-color)',
    padding: '8px',
    marginTop: '8px',
    backgroundColor: 'rgba(244, 135, 113, 0.1)',
    borderRadius: '4px',
  },
};

const GitStatusView: React.FC<GitStatusViewProps> = ({ gitStatus, refreshStatus, onPush }) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStaging, setIsStaging] = useState(false);
  const [isUnstaging, setIsUnstaging] = useState(false);

  if (!gitStatus) {
    return <div style={styles.noChanges}>No git repository information available.</div>;
  }

  const hasChanges = gitStatus.changes.staged.length > 0 || 
                    gitStatus.changes.unstaged.length > 0 || 
                    gitStatus.changes.untracked.length > 0 ||
                    gitStatus.changes.hasCommitsToPush;

  const currentDirectory = FileSystemService.getCurrentDirectory();

  const handleStageFile = async (file: string) => {
    if (!currentDirectory) return;
    
    setIsStaging(true);
    setError(null);
    
    try {
      const result = await GitService.addFiles(currentDirectory, [file]);
      
      if (!result.success) {
        setError(`Failed to stage file: ${result.error}`);
      } else {
        if (gitStatus) {
          const newGitStatus = {
            ...gitStatus,
            changes: {
              ...gitStatus.changes,
              staged: [...gitStatus.changes.staged, file],
              unstaged: gitStatus.changes.unstaged.filter(f => f !== file),
              untracked: gitStatus.changes.untracked.filter(f => f !== file)
            }
          };
          refreshStatus(newGitStatus);
        }
      }
    } catch (err) {
      console.error('Error staging file:', err);
      setError(`Error staging file: ${err}`);
    } finally {
      setIsStaging(false);
    }
  };

  const handleUnstageFile = async (file: string) => {
    if (!currentDirectory) return;
    
    setIsUnstaging(true);
    setError(null);
    
    try {
      const result = await GitService.resetFiles(currentDirectory, [file]);
      
      if (!result.success) {
        setError(`Failed to unstage file: ${result.error}`);
      } else {
        if (gitStatus) {
          const newGitStatus = {
            ...gitStatus,
            changes: {
              ...gitStatus.changes,
              staged: gitStatus.changes.staged.filter(f => f !== file),
              unstaged: [...gitStatus.changes.unstaged, file]
            }
          };
          refreshStatus(newGitStatus);
        }
      }
    } catch (err) {
      console.error('Error unstaging file:', err);
      setError(`Error unstaging file: ${err}`);
    } finally {
      setIsUnstaging(false);
    }
  };

  const handleStageAll = async () => {
    if (!currentDirectory) return;
    
    const allFiles = [
      ...gitStatus.changes.unstaged,
      ...gitStatus.changes.untracked
    ];
    
    if (allFiles.length === 0) return;
    
    setIsStaging(true);
    setError(null);
    
    try {
      const result = await GitService.addFiles(currentDirectory, allFiles);
      
      if (!result.success) {
        setError(`Failed to stage all files: ${result.error}`);
      } else {
        await refreshStatus();
      }
    } catch (err) {
      console.error('Error staging all files:', err);
      setError(`Error staging all files: ${err}`);
    } finally {
      setIsStaging(false);
    }
  };

  const handleUnstageAll = async () => {
    if (!currentDirectory || gitStatus.changes.staged.length === 0) return;
    
    setIsUnstaging(true);
    setError(null);
    
    try {
      const result = await GitService.resetFiles(currentDirectory, gitStatus.changes.staged);
      
      if (!result.success) {
        setError(`Failed to unstage all files: ${result.error}`);
      } else {
        await refreshStatus();
      }
    } catch (err) {
      console.error('Error unstaging all files:', err);
      setError(`Error unstaging all files: ${err}`);
    } finally {
      setIsUnstaging(false);
    }
  };

  const handleCommit = async () => {
    if (!currentDirectory || !commitMessage.trim() || gitStatus.changes.staged.length === 0) return;
    
    setIsCommitting(true);
    setError(null);
    
    try {
      const result = await GitService.commit(currentDirectory, commitMessage);
      
      if (!result.success) {
        setError(`Failed to commit changes: ${result.error}`);
      } else {
        setCommitMessage('');
        await refreshStatus();
      }
    } catch (err) {
      console.error('Error committing changes:', err);
      setError(`Error committing changes: ${err}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePush = async () => {
    if (!onPush) return;
    
    setIsPushing(true);
    setError(null);
    
    try {
      await onPush();
    } catch (err) {
      console.error('Error pushing changes:', err);
      setError(`Error pushing changes: ${err}`);
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.branchInfo}>
        <span>Current branch:</span>
        <span style={styles.branchName}>{gitStatus.branch}</span>
      </div>
      
      {!hasChanges ? (
        <div style={styles.noChanges}>No changes detected in the repository.</div>
      ) : (
        <>
          {/* Staged Changes Section */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Staged Changes ({gitStatus.changes.staged.length})
              {gitStatus.changes.staged.length > 0 && (
                <button 
                  onClick={handleUnstageAll}
                  style={{ float: 'right', fontSize: '11px', marginTop: '-2px' }}
                  disabled={isUnstaging}
                >
                  {isUnstaging ? 'Unstaging...' : 'Unstage All'}
                </button>
              )}
            </div>
            {gitStatus.changes.staged.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: '4px 8px', fontSize: '12px' }}>
                No staged changes
              </div>
            ) : (
              gitStatus.changes.staged.map((file) => (
                <div 
                  key={file} 
                  style={{ ...styles.fileItem, ...styles.staged }}
                  onClick={() => handleUnstageFile(file)}
                >
                  <span style={styles.fileIcon}>✓</span>
                  <span>{file}</span>
                </div>
              ))
            )}
          </div>

          {/* Unstaged Changes Section */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Unstaged Changes ({gitStatus.changes.unstaged.length})
              {gitStatus.changes.unstaged.length > 0 && (
                <button 
                  onClick={() => handleStageAll()}
                  style={{ float: 'right', fontSize: '11px', marginTop: '-2px' }}
                  disabled={isStaging}
                >
                  {isStaging ? 'Staging...' : 'Stage All'}
                </button>
              )}
            </div>
            {gitStatus.changes.unstaged.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: '4px 8px', fontSize: '12px' }}>
                No unstaged changes
              </div>
            ) : (
              gitStatus.changes.unstaged.map((file) => (
                <div 
                  key={file} 
                  style={{ ...styles.fileItem, ...styles.unstaged }}
                  onClick={() => handleStageFile(file)}
                >
                  <span style={styles.fileIcon}>M</span>
                  <span>{file}</span>
                </div>
              ))
            )}
          </div>

          {/* Untracked Files Section */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Untracked Files ({gitStatus.changes.untracked.length})
              {gitStatus.changes.untracked.length > 0 && (
                <button 
                  onClick={() => handleStageAll()}
                  style={{ float: 'right', fontSize: '11px', marginTop: '-2px' }}
                  disabled={isStaging}
                >
                  {isStaging ? 'Staging...' : 'Stage All'}
                </button>
              )}
            </div>
            {gitStatus.changes.untracked.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', padding: '4px 8px', fontSize: '12px' }}>
                No untracked files
              </div>
            ) : (
              gitStatus.changes.untracked.map((file) => (
                <div 
                  key={file} 
                  style={{ ...styles.fileItem, ...styles.untracked }}
                  onClick={() => handleStageFile(file)}
                >
                  <span style={styles.fileIcon}>+</span>
                  <span>{file}</span>
                </div>
              ))
            )}
          </div>

          {/* Commit Section */}
          <div style={styles.commitContainer}>
            <textarea
              style={styles.commitInput}
              placeholder="Enter commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={isCommitting}
            />
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
              <button
                style={styles.button}
                onClick={handleCommit}
                disabled={!commitMessage.trim() || isCommitting}
              >
                {isCommitting ? 'Committing...' : 'Commit Changes'}
              </button>
              {onPush && gitStatus.changes.hasCommitsToPush && (
                <button
                  style={{
                    ...styles.button,
                    backgroundColor: 'var(--accent-color)',
                    color: 'white',
                  }}
                  onClick={handlePush}
                  disabled={isPushing}
                >
                  {isPushing ? 'Pushing...' : 'Push Changes'}
                </button>
              )}
            </div>
            
            {gitStatus.changes.staged.length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Stage changes before committing
              </span>
            )}
          </div>
        </>
      )}
      
      {error && (
        <div style={styles.error}>
          {error}
          <button 
            onClick={() => setError(null)}
            style={{ float: 'right', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default GitStatusView; 