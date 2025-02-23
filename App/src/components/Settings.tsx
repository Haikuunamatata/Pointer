import React, { useState, useEffect } from 'react';

interface SettingsProps {
  isVisible: boolean;
  onClose: () => void;
}

interface ModelConfig {
  name: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

const defaultConfig: ModelConfig = {
  name: 'deepseek-coder-v2-lite-instruct',
  temperature: 0.7,
  maxTokens: -1,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

export function Settings({ isVisible, onClose }: SettingsProps) {
  const [config, setConfig] = useState<ModelConfig>(defaultConfig);
  const [savedConfig, setSavedConfig] = useState<ModelConfig>(defaultConfig);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    // Load saved config from localStorage
    const savedConfigStr = localStorage.getItem('modelConfig');
    if (savedConfigStr) {
      const parsed = JSON.parse(savedConfigStr);
      setConfig(parsed);
      setSavedConfig(parsed);
    }
  }, []);

  const handleChange = (field: keyof ModelConfig, value: string | number) => {
    setConfig(prev => {
      const newConfig = { ...prev, [field]: value };
      setIsDirty(JSON.stringify(newConfig) !== JSON.stringify(savedConfig));
      return newConfig;
    });
  };

  const handleSave = () => {
    localStorage.setItem('modelConfig', JSON.stringify(config));
    setSavedConfig(config);
    setIsDirty(false);
    onClose();
  };

  const handleCancel = () => {
    setConfig(savedConfig);
    setIsDirty(false);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '500px', maxWidth: '90vw' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Model Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '18px',
              padding: '4px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
              Model Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => handleChange('name', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
              Temperature ({config.temperature})
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
              Max Tokens ({config.maxTokens})
            </label>
            <input
              type="number"
              value={config.maxTokens}
              onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
              Top P ({config.topP})
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.topP}
              onChange={(e) => handleChange('topP', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
              Frequency Penalty ({config.frequencyPenalty})
            </label>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.1"
              value={config.frequencyPenalty}
              onChange={(e) => handleChange('frequencyPenalty', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
              Presence Penalty ({config.presencePenalty})
            </label>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.1"
              value={config.presencePenalty}
              onChange={(e) => handleChange('presencePenalty', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ 
          marginTop: '24px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid var(--border-primary)',
              background: isDirty ? 'var(--accent-color)' : 'var(--bg-secondary)',
              color: isDirty ? 'white' : 'var(--text-secondary)',
              cursor: isDirty ? 'pointer' : 'not-allowed',
              fontSize: '13px',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
} 