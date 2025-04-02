import React, { useState, useEffect } from 'react';

interface GitHubSettingsProps {
  onClose: () => void;
}

const GitHubSettings: React.FC<GitHubSettingsProps> = ({ onClose }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [message, setMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('http://localhost:23816/github/auth-status');
      const data = await response.json();
      setIsAuthenticated(data.authenticated);
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    setMessage(null);
    
    try {
      // Redirect to GitHub OAuth page
      window.location.href = 'http://localhost:23816/github/auth';
    } catch (error) {
      setMessage({
        text: 'Failed to start GitHub authentication',
        type: 'error'
      });
      console.error('Error starting GitHub auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('http://localhost:23816/github/logout', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          text: 'Successfully logged out from GitHub',
          type: 'success'
        });
        setIsAuthenticated(false);
      } else {
        setMessage({
          text: data.message || 'Failed to log out',
          type: 'error'
        });
      }
    } catch (error) {
      setMessage({
        text: 'An error occurred while logging out',
        type: 'error'
      });
      console.error('Error logging out:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '500px', padding: '20px' }}>
        <h2 style={{ marginBottom: '16px', fontSize: '18px', color: 'var(--text-primary)' }}>
          GitHub Settings
        </h2>

        {message && (
          <div style={{ 
            padding: '8px 12px', 
            marginBottom: '16px', 
            backgroundColor: message.type === 'success' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)', 
            color: message.type === 'success' ? 'var(--success-color)' : 'var(--error-color)',
            borderRadius: '4px',
            fontSize: '13px'
          }}>
            {message.text}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          {isAuthenticated ? (
            <div>
              <div style={{ 
                padding: '12px', 
                backgroundColor: 'rgba(76, 175, 80, 0.1)', 
                color: 'var(--success-color)',
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                ✓ Connected to GitHub
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoading}
                className="modal-button modal-button-secondary"
                style={{ width: '100%' }}
              >
                {isLoading ? 'Logging out...' : 'Log out from GitHub'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ 
                padding: '12px', 
                backgroundColor: 'rgba(244, 67, 54, 0.1)', 
                color: 'var(--error-color)',
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                Not connected to GitHub
              </div>
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="modal-button modal-button-primary"
                style={{ width: '100%' }}
              >
                {isLoading ? 'Connecting...' : 'Connect with GitHub'}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            className="modal-button modal-button-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default GitHubSettings; 