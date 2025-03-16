import React, { useState, useEffect } from 'react';
import { FileSystemService } from '../services/FileSystemService';
import { ModelConfig, EditorSettings, ThemeSettings, AppSettings, ModelAssignments, DiscordRpcSettings } from '../types';
import * as monaco from 'monaco-editor';

interface SettingsProps {
  isVisible: boolean;
  onClose: () => void;
  initialSettings?: {
    discordRpc?: DiscordRpcSettings;
    onDiscordSettingsChange?: (settings: Partial<DiscordRpcSettings>) => void;
    [key: string]: any;
  };
}

const defaultConfig: ModelConfig = {
  id: 'deepseek-coder-v2-lite-instruct',
  name: 'Default Model',
  temperature: 0.7,
  maxTokens: -1,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  systemPrompt: '',
  contextLength: 8192,
  stopSequences: [],
  modelProvider: 'local',
  apiEndpoint: 'http://localhost:11434/v1',
  apiKey: '',
  purpose: 'general',
};

const defaultModelAssignments: ModelAssignments = {
  chat: 'default',
  insert: 'default',
  autocompletion: 'default',
  summary: 'default',
};

const defaultDiscordRpcSettings: DiscordRpcSettings = {
  enabled: true,
  details: 'Editing {file}',
  state: 'Workspace: {workspace}',
  largeImageKey: 'pointer_logo',
  largeImageText: 'Pointer - Code Editor',
  smallImageKey: 'code',
  smallImageText: '{languageId} | Line {line}:{column}',
  button1Label: 'Download Pointer',
  button1Url: 'https://pointer.f1shy312.com',
  button2Label: '',
  button2Url: '',
};

// List of available models
const availableModels = [
  { id: 'deepseek-coder-v2-lite-instruct', name: 'DeepSeek Coder Lite', provider: 'local' },
  { id: 'llama3-8b-instruct', name: 'Llama 3 8B Instruct', provider: 'local' },
  { id: 'codellama-7b-instruct', name: 'CodeLlama 7B Instruct', provider: 'local' },
  { id: 'mistral-7b-instruct-v0.2', name: 'Mistral 7B Instruct', provider: 'local' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic' },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic' },
  { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google' },
  { id: 'gemini-ultra', name: 'Gemini Ultra', provider: 'google' },
  { id: 'custom', name: 'Custom Model', provider: 'custom' },
];

// List of model providers
const modelProviders = [
  { id: 'local', name: 'Local (Ollama)' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google AI' },
  { id: 'custom', name: 'Custom Provider' },
];

// Categories for sidebar
const settingsCategories = [
  { id: 'models', name: 'LLM Models' },
  { id: 'editor', name: 'Editor' },
  { id: 'theme', name: 'Theme' },
  { id: 'discord', name: 'Discord Rich Presence' },
  { id: 'keybindings', name: 'Keybindings' },
  { id: 'terminal', name: 'Terminal' },
  { id: 'advanced', name: 'Advanced' },
];

export function Settings({ isVisible, onClose, initialSettings }: SettingsProps) {
  // State for various settings
  const [activeCategory, setActiveCategory] = useState('models');
  const [activeTab, setActiveTab] = useState('default');
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>({
    'default': { ...defaultConfig },
  });
  const [modelAssignments, setModelAssignments] = useState<ModelAssignments>({...defaultModelAssignments});
  const [editorSettings, setEditorSettings] = useState({
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 1.5,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: true,
    rulers: [],
    formatOnSave: true,
    formatOnPaste: false,
    autoSave: true,
  });
  const [themeSettings, setThemeSettings] = useState({
    name: 'vs-dark',
    customColors: {},
  });
  const [discordRpcSettings, setDiscordRpcSettings] = useState<DiscordRpcSettings>(
    // Initialize with initialSettings if available, otherwise use default
    initialSettings?.discordRpc || {...defaultDiscordRpcSettings}
  );
  const [isLoading, setIsLoading] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);
  
  // Populate settings from initialSettings if available
  useEffect(() => {
    if (initialSettings) {
      if (initialSettings.discordRpc) {
        setDiscordRpcSettings(prev => ({ ...prev, ...initialSettings.discordRpc }));
      }
      // Add similar logic for other settings as needed
    }
  }, [initialSettings]);

  // Function to handle changes to Discord RPC settings
  const handleDiscordRpcSettingChange = (field: keyof DiscordRpcSettings, value: any) => {
    setDiscordRpcSettings(prev => {
      const newSettings = { ...prev, [field]: value };
      setSettingsChanged(true);
      
      // Call the onDiscordSettingsChange callback if it exists
      if (initialSettings?.onDiscordSettingsChange) {
        initialSettings.onDiscordSettingsChange(newSettings);
      }
      
      return newSettings;
    });
  };

  // Function to save all settings
  const saveSettings = () => {
    // Save Discord RPC settings if the initialSettings has a callback
    if (initialSettings?.onDiscordSettingsChange) {
      initialSettings.onDiscordSettingsChange(discordRpcSettings);
    }
    
    // Call existing save function that handles other settings
    saveAllSettings();
  };

  // Function to handle cancel
  const handleCancel = () => {
    // Reset any changes
    if (initialSettings?.discordRpc) {
      setDiscordRpcSettings(initialSettings.discordRpc);
    }
    setSettingsChanged(false);
    onClose();
  };

  // Load the settings
  useEffect(() => {
    if (isVisible) {
      loadAllSettings();
    }
  }, [isVisible]);

  // Load settings from localStorage and from the settings directory
  const loadAllSettings = async () => {
    setIsLoading(true);
    try {
      // First try to load from localStorage for backward compatibility
      const localStorageConfig = localStorage.getItem('modelConfig');
      if (localStorageConfig) {
        const parsed = JSON.parse(localStorageConfig);
        setModelConfigs(prev => ({
          ...prev,
          'default': {
            ...prev.default,
            ...parsed,
            // Ensure the default model has a valid ID 
            id: parsed.id && parsed.id !== 'default-model' ? parsed.id : 'deepseek-coder-v2-lite-instruct'
          }
        }));
      }

      // Load settings from the settings directory
      const result = await FileSystemService.readSettingsFiles('C:/ProgramData/Pointer/data/settings');
      if (result && result.success) {
        // Process model configs
        if (result.settings.models) {
          // Make sure all models have valid IDs
          const validatedModels = { ...result.settings.models };
          Object.keys(validatedModels).forEach(key => {
            if (!validatedModels[key].id || validatedModels[key].id === 'default-model') {
              validatedModels[key].id = 'deepseek-coder-v2-lite-instruct';
            }
          });
          
          setModelConfigs(prev => ({
            ...prev,
            ...validatedModels
          }));
        }

        // Process model assignments with defaults for any missing ones
        if (result.settings.modelAssignments) {
          const assignments = { ...defaultModelAssignments };
          
          // Only update the assignments that exist in the settings
          Object.keys(result.settings.modelAssignments).forEach(key => {
            // Check if the key is a valid assignment type
            if (key === 'chat' || key === 'insert' || key === 'autocompletion' || key === 'summary') {
              assignments[key as keyof ModelAssignments] = result.settings.modelAssignments[key];
            }
          });
          
          setModelAssignments(assignments);
        } else {
          // No model assignments in settings, use defaults
          setModelAssignments({...defaultModelAssignments});
        }

        // Process editor settings
        if (result.settings.editor) {
          setEditorSettings(prev => ({
            ...prev,
            ...result.settings.editor
          }));
        }

        // Process theme settings
        if (result.settings.theme) {
          setThemeSettings(prev => ({
            ...prev,
            ...result.settings.theme
          }));
        }

        // Process Discord RPC settings
        if (result.settings.discordRpc) {
          setDiscordRpcSettings(prev => ({
            ...prev,
            ...result.settings.discordRpc
          }));
        }
        
        // Load from props if provided
        if (initialSettings?.discordRpc) {
          setDiscordRpcSettings(prev => ({
            ...prev,
            ...initialSettings.discordRpc
          }));
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Save all settings
  const saveAllSettings = async () => {
    setIsLoading(true);
    try {
      // Save to localStorage for backward compatibility
      localStorage.setItem('modelConfig', JSON.stringify(modelConfigs.default));
      localStorage.setItem('modelAssignments', JSON.stringify(modelAssignments));
      
      // Apply the theme settings
      applyThemeSettings();
      
      // Save to the settings directory
      const settings = {
        models: modelConfigs,
        modelAssignments: modelAssignments,
        editor: editorSettings,
        theme: themeSettings,
        discordRpc: discordRpcSettings,
      };

      // Save settings to the backend
      const result = await FileSystemService.saveSettingsFiles('C:/ProgramData/Pointer/data/settings', settings);
      
      if (result.success) {
        console.log('Settings saved successfully');
      } else {
        console.error('Failed to save settings');
      }
      
    onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Apply theme settings to Monaco editor
  const applyThemeSettings = () => {
    try {
      // Apply theme to Monaco editor
      const currentTheme = themeSettings.name;
      if (window.editor) {
        monaco.editor.setTheme(currentTheme);
      }
    } catch (error) {
      console.error('Error applying theme settings:', error);
    }
  };

  // Handle change for model configuration
  const handleModelConfigChange = (modelId: string, field: keyof ModelConfig, value: any) => {
    setModelConfigs(prev => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        [field]: value
      }
    }));
  };

  // Handle change for editor settings
  const handleEditorSettingChange = (field: string, value: any) => {
    setEditorSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle change for theme settings
  const handleThemeSettingChange = (field: string, value: any) => {
    setThemeSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Add a new model configuration
  const addModelConfig = () => {
    const newId = `model_${Object.keys(modelConfigs).length}`;
    setModelConfigs(prev => ({
      ...prev,
      [newId]: { 
        ...defaultConfig, 
        id: newId,
        name: `Custom Model ${Object.keys(modelConfigs).length}` 
      }
    }));
    setActiveTab(newId);
  };

  // Delete a model configuration
  const deleteModelConfig = (modelId: string) => {
    if (modelId === 'default') {
      alert('Cannot delete the default model configuration');
      return;
    }

    setModelConfigs(prev => {
      const newConfigs = { ...prev };
      delete newConfigs[modelId];
      return newConfigs;
    });

    setActiveTab('default');
  };

  if (!isVisible) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
    }}>
      <div className="modal-content" style={{ 
        width: '850px', 
        height: '80vh',
        maxWidth: '90vw',
        maxHeight: '90vh',
        background: 'var(--bg-primary)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-primary)',
        }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Settings</h2>
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

        {/* Main content with sidebar */}
        <div style={{ 
          display: 'flex', 
          flex: 1, 
          overflow: 'hidden',
        }}>
          {/* Sidebar */}
          <div style={{ 
            width: '200px', 
            borderRight: '1px solid var(--border-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}>
            {settingsCategories.map(category => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                style={{
                  padding: '10px 16px',
                  textAlign: 'left',
                  background: activeCategory === category.id ? 'var(--bg-hover)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-secondary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                Loading settings...
              </div>
            ) : (
              <>
                {/* LLM Models */}
                {activeCategory === 'models' && (
                  <div>
                    {/* Tabs for model configurations */}
                    <div style={{ 
                      display: 'flex', 
                      borderBottom: '1px solid var(--border-primary)',
                      marginBottom: '16px',
                      overflowX: 'auto',
                    }}>
                      {Object.keys(modelConfigs).map(modelId => (
                        <button
                          key={modelId}
                          onClick={() => setActiveTab(modelId)}
                          style={{
                            padding: '8px 16px',
                            background: activeTab === modelId ? 'var(--bg-hover)' : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === modelId ? '2px solid var(--accent-color)' : 'none',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {modelConfigs[modelId].name || modelId}
                        </button>
                      ))}
                      <button
                        onClick={addModelConfig}
                        style={{
                          padding: '8px 16px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        + Add Model
                      </button>
                    </div>

                    {/* Model assignments section */}
                    <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Model Assignments</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Assign specific models to different purposes in the application
                      </p>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                            Chat Model
                          </label>
                          <select
                            value={modelAssignments.chat}
                            onChange={(e) => setModelAssignments(prev => ({
                              ...prev,
                              chat: e.target.value
                            }))}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {Object.keys(modelConfigs).map(modelId => (
                              <option key={modelId} value={modelId}>
                                {modelConfigs[modelId].name || modelId}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                            Insert Model
                          </label>
                          <select
                            value={modelAssignments.insert}
                            onChange={(e) => setModelAssignments(prev => ({
                              ...prev,
                              insert: e.target.value
                            }))}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {Object.keys(modelConfigs).map(modelId => (
                              <option key={modelId} value={modelId}>
                                {modelConfigs[modelId].name || modelId}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                            Autocompletion Model
                          </label>
                          <select
                            value={modelAssignments.autocompletion}
                            onChange={(e) => setModelAssignments(prev => ({
                              ...prev,
                              autocompletion: e.target.value
                            }))}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {Object.keys(modelConfigs).map(modelId => (
                              <option key={modelId} value={modelId}>
                                {modelConfigs[modelId].name || modelId}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                            Summary Model
                          </label>
                          <select
                            value={modelAssignments.summary}
                            onChange={(e) => setModelAssignments(prev => ({
                              ...prev,
                              summary: e.target.value
                            }))}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {Object.keys(modelConfigs).map(modelId => (
                              <option key={modelId} value={modelId}>
                                {modelConfigs[modelId].name || modelId}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Model configuration form */}
                    {activeTab && modelConfigs[activeTab] && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{ margin: 0, fontSize: '16px' }}>
                            Model Configuration
                          </h3>
                          {activeTab !== 'default' && (
                            <button
                              onClick={() => deleteModelConfig(activeTab)}
                              style={{
                                padding: '4px 8px',
                                background: 'var(--error-color)',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                              Display Name
            </label>
            <input
              type="text"
                              value={modelConfigs[activeTab].name}
                              onChange={(e) => handleModelConfigChange(activeTab, 'name', e.target.value)}
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
                              Model ID
                            </label>
                            <input
                              type="text"
                              value={modelConfigs[activeTab].id || modelConfigs[activeTab].name}
                              onChange={(e) => handleModelConfigChange(activeTab, 'id', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: '4px',
                                color: 'var(--text-primary)',
                              }}
                              placeholder="Enter the model ID (e.g., 'gpt-4', 'llama3-8b-instruct')"
                            />
                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              Enter any model ID supported by your provider. Common examples: deepseek-coder-v2-lite-instruct, llama3-8b-instruct, gpt-4
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                              API Endpoint
                            </label>
                            <input
                              type="text"
                              value={modelConfigs[activeTab].apiEndpoint || ''}
                              onChange={(e) => handleModelConfigChange(activeTab, 'apiEndpoint', e.target.value)}
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
                        </div>

                        {/* System Prompt - Now more prominent */}
                        <div>
                          <label style={{ 
                            display: 'block', 
                            marginBottom: '4px', 
                            fontSize: '14px',
                            fontWeight: 'bold' 
                          }}>
                            System Prompt
                          </label>
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            Customize the instructions given to the model at the beginning of each conversation
                          </p>
                          <textarea
                            value={modelConfigs[activeTab].systemPrompt || ''}
                            onChange={(e) => handleModelConfigChange(activeTab, 'systemPrompt', e.target.value)}
                            style={{
                              width: '100%',
                              height: '120px',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                              resize: 'vertical',
                              fontFamily: 'monospace',
                              fontSize: '13px',
                            }}
                            placeholder="Enter instructions for the model (e.g., 'You are a helpful AI assistant...')"
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                              Temperature ({modelConfigs[activeTab].temperature})
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
                              value={modelConfigs[activeTab].temperature}
                              onChange={(e) => handleModelConfigChange(activeTab, 'temperature', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                              Top P ({modelConfigs[activeTab].topP})
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={modelConfigs[activeTab].topP}
                              onChange={(e) => handleModelConfigChange(activeTab, 'topP', parseFloat(e.target.value))}
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Editor settings */}
                {activeCategory === 'editor' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Editor Settings</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                          Font Family
            </label>
            <input
                          type="text"
                          value={editorSettings.fontFamily}
                          onChange={(e) => handleEditorSettingChange('fontFamily', e.target.value)}
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
                          Font Size
            </label>
            <input
                          type="number"
                          value={editorSettings.fontSize}
                          onChange={(e) => handleEditorSettingChange('fontSize', parseInt(e.target.value))}
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
          </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                          Line Height
            </label>
            <input
                          type="number"
              step="0.1"
                          value={editorSettings.lineHeight}
                          onChange={(e) => handleEditorSettingChange('lineHeight', parseFloat(e.target.value))}
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
                          Tab Size
            </label>
            <input
                          type="number"
                          value={editorSettings.tabSize}
                          onChange={(e) => handleEditorSettingChange('tabSize', parseInt(e.target.value))}
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
                    </div>

                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={editorSettings.insertSpaces}
                          onChange={(e) => handleEditorSettingChange('insertSpaces', e.target.checked)}
                          style={{ marginRight: '8px' }}
                        />
                        Insert spaces instead of tabs
                      </label>
                    </div>

                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={editorSettings.wordWrap}
                          onChange={(e) => handleEditorSettingChange('wordWrap', e.target.checked)}
                          style={{ marginRight: '8px' }}
                        />
                        Word Wrap
                      </label>
                    </div>

                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={editorSettings.formatOnSave}
                          onChange={(e) => handleEditorSettingChange('formatOnSave', e.target.checked)}
                          style={{ marginRight: '8px' }}
                        />
                        Format on Save
                      </label>
                    </div>

                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={editorSettings.autoSave}
                          onChange={(e) => handleEditorSettingChange('autoSave', e.target.checked)}
                          style={{ marginRight: '8px' }}
                        />
                        Auto Save
                      </label>
                    </div>
                  </div>
                )}

                {/* Theme Settings */}
                {activeCategory === 'theme' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Theme Settings</h3>
                    
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
                        Theme
                      </label>
                      <select
                        value={themeSettings.name}
                        onChange={(e) => handleThemeSettingChange('name', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="vs-dark">VS Dark</option>
                        <option value="vs-light">VS Light</option>
                        <option value="hc-black">High Contrast Dark</option>
                        <option value="hc-light">High Contrast Light</option>
                      </select>
                    </div>

                    <div>
                      <h4 style={{ margin: '8px 0', fontSize: '14px' }}>Custom Colors</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Advanced color customization will be available in a future update.
                      </p>
                    </div>
                  </div>
                )}

                {/* Keybindings */}
                {activeCategory === 'keybindings' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Keyboard Shortcuts</h3>
                    
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Custom keyboard shortcuts will be available in a future update.
                    </p>

                    <div style={{ marginTop: '16px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Default Shortcuts</h4>
                      <table style={{ 
                        width: '100%', 
                        borderCollapse: 'collapse',
                        fontSize: '13px',
                      }}>
                        <thead>
                          <tr>
                            <th style={{ 
                              textAlign: 'left', 
                              padding: '8px', 
                              borderBottom: '1px solid var(--border-primary)',
                            }}>Command</th>
                            <th style={{ 
                              textAlign: 'left', 
                              padding: '8px', 
                              borderBottom: '1px solid var(--border-primary)',
                            }}>Shortcut</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Save File</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Ctrl+S</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Toggle Sidebar</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Ctrl+B</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Toggle Top Bar</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Ctrl+Shift+B</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Close Tab</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Ctrl+W</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Toggle LLM Chat</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-secondary)' }}>Ctrl+I</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Terminal Settings */}
                {activeCategory === 'terminal' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Terminal Settings</h3>
                    
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Terminal settings will be available in a future update.
                    </p>
                  </div>
                )}

                {/* Advanced Settings */}
                {activeCategory === 'advanced' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Advanced Settings</h3>
                    
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Advanced settings will be available in a future update.
                    </p>

                    <div style={{ marginTop: '16px' }}>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to reset all settings to default values?')) {
                            // Reset all settings
                            setModelConfigs({ 'default': { ...defaultConfig } });
                            setEditorSettings({
                              fontFamily: 'monospace',
                              fontSize: 13,
                              lineHeight: 1.5,
                              tabSize: 2,
                              insertSpaces: true,
                              wordWrap: true,
                              minimap: true,
                              lineNumbers: true,
                              smoothScrolling: true,
                              quickSuggestions: true,
                              bracketPairColorization: true,
                            });
                            setThemeSettings({
                              primaryColor: '#007ACC',
                              bgPrimary: '#1E1E1E',
                              bgSecondary: '#252526',
                              textPrimary: '#CCCCCC',
                              textSecondary: '#9E9E9E',
                              accentColor: '#007ACC',
                              errorColor: '#F44336',
                              borderPrimary: '#474747',
                              bgHover: '#2A2D2E',
                            });
                          }
                        }}
                        style={{
                          padding: '8px 16px',
                          background: 'var(--error-color)',
                          border: 'none',
                          borderRadius: '4px',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '13px',
                          width: 'fit-content',
                        }}
                      >
                        Reset All Settings
                      </button>
                    </div>
                  </div>
                )}

                {/* Discord RPC Settings */}
                {activeCategory === 'discord' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Discord Rich Presence Settings</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Show your friends what you're working on in Pointer with Discord Rich Presence integration.
                    </p>
                    
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                        <input
                          type="checkbox"
                          checked={discordRpcSettings.enabled}
                          onChange={(e) => handleDiscordRpcSettingChange('enabled', e.target.checked)}
                          style={{ marginRight: '8px' }}
                        />
                        Enable Discord Rich Presence
                      </label>
                    </div>
                    
                    <div style={{ padding: '16px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Text Customization</h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Details Line:
                          </label>
                          <input
                            type="text"
                            value={discordRpcSettings.details}
                            onChange={(e) => handleDiscordRpcSettingChange('details', e.target.value)}
                            placeholder="Editing {file}"
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Primary line shown in your Discord status
                          </p>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            State Line:
                          </label>
                          <input
                            type="text"
                            value={discordRpcSettings.state}
                            onChange={(e) => handleDiscordRpcSettingChange('state', e.target.value)}
                            placeholder="Workspace: {workspace}"
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Secondary line shown in your Discord status
                          </p>
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Large Image Key:
                          </label>
                          <input
                            type="text"
                            value={discordRpcSettings.largeImageKey}
                            onChange={(e) => handleDiscordRpcSettingChange('largeImageKey', e.target.value)}
                            placeholder="pointer_logo"
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Asset key for the large image
                          </p>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Small Image Key:
                          </label>
                          <input
                            type="text"
                            value={discordRpcSettings.smallImageKey}
                            onChange={(e) => handleDiscordRpcSettingChange('smallImageKey', e.target.value)}
                            placeholder="code"
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Asset key for the small image (use "code" for automatic language icons)
                          </p>
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Large Image Text:
                          </label>
                          <input
                            type="text"
                            value={discordRpcSettings.largeImageText}
                            onChange={(e) => handleDiscordRpcSettingChange('largeImageText', e.target.value)}
                            placeholder="Pointer - Code Editor"
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Text shown when hovering the large icon
                          </p>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Small Image Text:
                          </label>
                          <input
                            type="text"
                            value={discordRpcSettings.smallImageText}
                            onChange={(e) => handleDiscordRpcSettingChange('smallImageText', e.target.value)}
                            placeholder="{languageId} | Line {line}:{column}"
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Text shown when hovering the small icon
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ padding: '16px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>Button Customization</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Add up to two buttons that will appear on your Discord status. URLs must be complete and point to public websites. (ts is broken rn)
                      </p>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Button 1 Text:
                          </label>
                          <input
                            type="text"
                            value={discordRpcSettings.button1Label || ''}
                            onChange={(e) => handleDiscordRpcSettingChange('button1Label', e.target.value)}
                            placeholder="Download Pointer"
                            maxLength={32}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Max 32 characters (required for button to work)
                          </p>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Button 1 URL:
                          </label>
                          <input
                            type="url"
                            value={discordRpcSettings.button1Url || ''}
                            onChange={(e) => handleDiscordRpcSettingChange('button1Url', e.target.value)}
                            placeholder="https://pointer.f1shy312.com"
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: !discordRpcSettings.button1Url || 
                                     (discordRpcSettings.button1Url.startsWith('http://') || discordRpcSettings.button1Url.startsWith('https://'))
                                ? 'var(--text-primary)' 
                                : 'var(--error-color)',
                            }}
                          />
                          <p style={{ 
                            fontSize: '12px', 
                            color: !discordRpcSettings.button1Url || 
                                   (discordRpcSettings.button1Url.startsWith('http://') || discordRpcSettings.button1Url.startsWith('https://'))
                              ? 'var(--text-secondary)'
                              : 'var(--error-color)',
                            marginTop: '4px' 
                          }}>
                            {!discordRpcSettings.button1Url || 
                             (discordRpcSettings.button1Url.startsWith('http://') || discordRpcSettings.button1Url.startsWith('https://'))
                              ? 'Must start with https:// or http://'
                              : 'ERROR: URL must start with https:// or http://'}
                          </p>
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Button 2 Text:
                          </label>
                          <input
                            type="text"
                            value={discordRpcSettings.button2Label || ''}
                            onChange={(e) => handleDiscordRpcSettingChange('button2Label', e.target.value)}
                            placeholder="Join Discord"
                            maxLength={32}
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Max 32 characters (required for button to work)
                          </p>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                            Button 2 URL:
                          </label>
                          <input
                            type="url"
                            value={discordRpcSettings.button2Url || ''}
                            onChange={(e) => handleDiscordRpcSettingChange('button2Url', e.target.value)}
                            placeholder="https://discord.gg/coming-soon"
                            style={{
                              width: '100%',
                              padding: '8px',
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              color: !discordRpcSettings.button2Url || 
                                     (discordRpcSettings.button2Url.startsWith('http://') || discordRpcSettings.button2Url.startsWith('https://'))
                                ? 'var(--text-primary)' 
                                : 'var(--error-color)',
                            }}
                          />
                          <p style={{ 
                            fontSize: '12px', 
                            color: !discordRpcSettings.button2Url || 
                                   (discordRpcSettings.button2Url.startsWith('http://') || discordRpcSettings.button2Url.startsWith('https://'))
                              ? 'var(--text-secondary)'
                              : 'var(--error-color)',
                            marginTop: '4px' 
                          }}>
                            {!discordRpcSettings.button2Url || 
                             (discordRpcSettings.button2Url.startsWith('http://') || discordRpcSettings.button2Url.startsWith('https://'))
                              ? 'Must start with https:// or http://'
                              : 'ERROR: URL must start with https:// or http://'}
                          </p>
                        </div>
                      </div>
                      
                      <div style={{ 
                        marginTop: '16px', 
                        padding: '8px', 
                        borderRadius: '4px', 
                        background: 'var(--bg-hover)',
                        border: '1px solid var(--border-primary)'
                      }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                          <strong>Important:</strong> For buttons to work, you must:
                        </p>
                        <ul style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0', paddingLeft: '16px' }}>
                          <li>Include complete URLs (with https://)</li>
                          <li>Make sure both label and URL are filled for each button</li>
                          <li>Ensure URLs point to public websites (not localhost)</li>
                          <li>Keep button text under 32 characters</li>
                        </ul>
                      </div>
                    </div>
                    
                    <div style={{ 
                      background: 'var(--bg-primary)', 
                      padding: '12px', 
                      borderRadius: '6px',
                      border: '1px solid var(--border-primary)',
                      marginTop: '8px'
                    }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Available Placeholders</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
                        <div><code>{'{file}'}</code> - Current file name</div>
                        <div><code>{'{workspace}'}</code> - Workspace name</div>
                        <div><code>{'{line}'}</code> - Cursor line</div>
                        <div><code>{'{column}'}</code> - Cursor column</div>
                        <div><code>{'{languageId}'}</code> - File language</div>
                        <div><code>{'{fileSize}'}</code> - File size</div>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                        Note: Elapsed time is now automatically included by Discord and cannot be disabled.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer with save/cancel buttons */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '12px', 
          padding: '16px 20px',
          borderTop: '1px solid var(--border-primary)',
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
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            disabled={isLoading}
            style={{ 
              padding: '8px 16px', 
              borderRadius: '4px', 
              border: 'none',
              background: isLoading ? 'var(--bg-secondary)' : 'var(--accent-color)',
              color: isLoading ? 'var(--text-secondary)' : 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: settingsChanged ? 1 : 0.7
            }}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
} 