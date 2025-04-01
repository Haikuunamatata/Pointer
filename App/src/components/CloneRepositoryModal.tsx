import React, { useState, useEffect } from 'react';
import { GitService } from '../services/gitService';
import { GitHubService, UserRepository, PopularRepository } from '../services/GitHubService';
import GitHubSettings from './GitHubSettings';

interface CloneRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClone: (url: string, directory: string) => Promise<void>;
}

const CloneRepositoryModal: React.FC<CloneRepositoryModalProps> = ({ isOpen, onClose, onClone }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [cloneLocation, setCloneLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [popularRepos, setPopularRepos] = useState<PopularRepository[]>([]);
  const [userRepos, setUserRepos] = useState<UserRepository[]>([]);
  const [activeTab, setActiveTab] = useState<'url' | 'popular' | 'user'>('url');
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isGitHubSettingsOpen, setIsGitHubSettingsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'popular') {
        fetchPopularRepos();
      } else if (activeTab === 'user') {
        fetchUserRepos();
      }
    }
  }, [isOpen, activeTab]);

  const fetchPopularRepos = async () => {
    try {
      setIsLoadingRepos(true);
      const repos = await GitHubService.getPopularRepositories();
      setPopularRepos(repos);
    } catch (err) {
      console.error('Error fetching popular repositories:', err);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const fetchUserRepos = async () => {
    try {
      setIsLoadingRepos(true);
      const repos = await GitHubService.getUserRepositories();
      setUserRepos(repos);
    } catch (err) {
      console.error('Error fetching user repositories:', err);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!repoUrl.trim()) {
      setError('Repository URL is required');
      return;
    }
    
    if (!cloneLocation.trim()) {
      setError('Clone location is required');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      await onClone(repoUrl.trim(), cloneLocation.trim());
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to clone repository');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setRepoUrl('');
    setCloneLocation('');
    setError('');
    setActiveTab('url');
    onClose();
  };

  const handleBrowse = async () => {
    try {
      // Use the backend.py /open-directory endpoint instead of Electron dialog
      const response = await fetch('http://localhost:23816/open-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to open directory: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data && data.path) {
        setCloneLocation(data.path);
      }
    } catch (err) {
      console.error('Error selecting directory:', err);
      setError('Failed to select directory. Please try again or enter the path manually.');
    }
  };

  const selectRepository = (repo: UserRepository | PopularRepository) => {
    setRepoUrl(repo.url);
    setActiveTab('url');
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay">
        <div className="modal-content" style={{ width: '650px', padding: '20px' }}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px', color: 'var(--text-primary)' }}>
            Clone Repository
          </h2>
          
          {error && (
            <div style={{ 
              padding: '8px 12px', 
              marginBottom: '16px', 
              backgroundColor: 'rgba(244, 67, 54, 0.1)', 
              color: 'var(--error-color)',
              borderRadius: '4px',
              fontSize: '13px'
            }}>
              {error}
            </div>
          )}
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
              <button
                type="button"
                onClick={() => setActiveTab('url')}
                className={`modal-tab ${activeTab === 'url' ? 'modal-tab-active' : ''}`}
              >
                Repository URL
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('popular')}
                className={`modal-tab ${activeTab === 'popular' ? 'modal-tab-active' : ''}`}
              >
                Popular Repositories
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('user')}
                className={`modal-tab ${activeTab === 'user' ? 'modal-tab-active' : ''}`}
              >
                My Repositories
              </button>
              <div style={{ flex: 1 }}></div>
              <button
                type="button"
                onClick={() => setIsGitHubSettingsOpen(true)}
                className="modal-button modal-button-secondary"
                style={{ 
                  fontSize: '12px', 
                  padding: '2px 8px', 
                  height: '24px',
                  marginBottom: '1px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight: '4px' }}>
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.207 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.608-4.042-1.608-.546-1.386-1.332-1.754-1.332-1.754-1.09-.744.083-.73.083-.73 1.205.085 1.838 1.236 1.838 1.236 1.07 1.835 2.807 1.305 3.492.998.108-.775.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.468-2.38 1.235-3.22-.124-.303-.535-1.524.118-3.176 0 0 1.006-.322 3.3 1.23.956-.266 1.983-.4 3.003-.404 1.02.005 2.046.138 3.005.404 2.29-1.552 3.295-1.23 3.295-1.23.655 1.652.243 2.873.12 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.806 5.625-5.478 5.92.43.37.814 1.103.814 2.223 0 1.604-.015 2.898-.015 3.292 0 .32.217.695.825.577C20.565 21.795 24 17.298 24 12c0-6.63-5.37-12-12-12z" fill="currentColor" />
                </svg>
                GitHub Settings
              </button>
            </div>
          </div>
          
          <form onSubmit={handleSubmit}>
            {activeTab === 'url' && (
              <div style={{ marginBottom: '16px' }}>
                <label className="modal-label" htmlFor="repo-url">
                  Repository URL
                </label>
                <input
                  id="repo-url"
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/username/repository.git"
                  className="modal-input"
                />
              </div>
            )}
            
            {activeTab === 'popular' && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Popular Repositories
                </div>
                <div style={{ 
                  maxHeight: '250px', 
                  overflowY: 'auto', 
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px'
                }}>
                  {isLoadingRepos ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Loading repositories...
                    </div>
                  ) : popularRepos.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No repositories found
                    </div>
                  ) : (
                    popularRepos.map(repo => (
                      <div 
                        key={repo.name}
                        onClick={() => selectRepository(repo)}
                        className="repo-list-item"
                      >
                        <div className="repo-title">
                          <img 
                            src={repo.ownerAvatar}
                            alt={repo.owner}
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              marginRight: '8px',
                              verticalAlign: 'middle'
                            }}
                          />
                          {repo.owner}/{repo.name}
                        </div>
                        <div className="repo-description">{repo.description}</div>
                        <div className="repo-meta">
                          <span>⭐ {repo.stars.toLocaleString()}</span>
                          <span style={{ color: 'var(--accent-color)', fontSize: '11px' }}>
                            {repo.url}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            
            {activeTab === 'user' && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  My Repositories
                </div>
                <div style={{ 
                  maxHeight: '250px', 
                  overflowY: 'auto', 
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px'
                }}>
                  {isLoadingRepos ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Loading repositories...
                    </div>
                  ) : userRepos.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No repositories found
                    </div>
                  ) : (
                    userRepos.map(repo => (
                      <div 
                        key={repo.name}
                        onClick={() => selectRepository(repo)}
                        className="repo-list-item"
                      >
                        <div className="repo-title">
                          <img 
                            src={repo.ownerAvatar}
                            alt={repo.owner}
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              marginRight: '8px',
                              verticalAlign: 'middle'
                            }}
                          />
                          {repo.name}
                          {repo.isPrivate && (
                            <span style={{ 
                              marginLeft: '8px', 
                              fontSize: '10px', 
                              padding: '2px 5px', 
                              backgroundColor: 'var(--bg-tertiary)', 
                              borderRadius: '3px',
                              color: 'var(--text-secondary)'
                            }}>
                              Private
                            </span>
                          )}
                        </div>
                        <div className="repo-description">{repo.description}</div>
                        <div className="repo-meta">
                          <span>Last updated: {repo.lastUpdated}</span>
                          <span style={{ color: 'var(--accent-color)', fontSize: '11px' }}>
                            {repo.url}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            
            <div style={{ marginBottom: '24px' }}>
              <label className="modal-label" htmlFor="clone-location">
                Clone Location
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="clone-location"
                  type="text"
                  value={cloneLocation}
                  onChange={(e) => setCloneLocation(e.target.value)}
                  placeholder="Select a directory"
                  className="modal-input"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleBrowse}
                  className="modal-button modal-button-secondary"
                >
                  Browse
                </button>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={handleClose}
                className="modal-button modal-button-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="modal-button modal-button-primary"
                style={{ opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading ? 'Cloning...' : 'Clone'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {isGitHubSettingsOpen && (
        <GitHubSettings onClose={() => setIsGitHubSettingsOpen(false)} />
      )}
    </>
  );
};

export default CloneRepositoryModal; 