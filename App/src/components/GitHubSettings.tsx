import React, { useState } from 'react';

interface GitHubSettingsProps {
  onClose: () => void;
}

const GitHubSettings: React.FC<GitHubSettingsProps> = ({ onClose }) => {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveToken = async () => {
    if (!token.trim()) {
      setMessage({
        text: 'Please enter a valid GitHub token',
        type: 'error'
      });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('http://localhost:23816/github/save-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: token.trim() })
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          text: data.message || 'Token saved successfully',
          type: 'success'
        });
        
        // Clear token input after success
        setToken('');
      } else {
        setMessage({
          text: data.message || 'Failed to validate token',
          type: 'error'
        });
      }
    } catch (error) {
      setMessage({
        text: 'An error occurred while saving the token',
        type: 'error'
      });
      console.error('Error saving GitHub token:', error);
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
          <label className="modal-label" htmlFor="github-token">
            Personal Access Token
          </label>
          <input
            id="github-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            className="modal-input"
          />
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Create a personal access token with repo scope at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)' }}>github.com/settings/tokens</a>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            className="modal-button modal-button-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveToken}
            disabled={isLoading}
            className="modal-button modal-button-primary"
            style={{ opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? 'Saving...' : 'Save Token'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GitHubSettings; 