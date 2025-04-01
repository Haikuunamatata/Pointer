import React, { useState, useEffect, useRef } from 'react';
import { FileSystemService } from '../services/FileSystemService';
import { ModelConfig, EditorSettings, ThemeSettings, AppSettings, ModelAssignments, DiscordRpcSettings } from '../types';
import * as monaco from 'monaco-editor';
import ColorInput from './ColorInput';
import { presetThemes } from '../themes/presetThemes';
// Add electron API import with proper typing
// @ts-ignore
const electron = window.require ? window.require('electron') : null;
// @ts-ignore
const ipcRenderer = electron ? electron.ipcRenderer : null;

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

const settingsCategories = [
  { id: 'models', name: 'LLM Models' },
  { id: 'theme', name: 'Theme & Editor' },
  { id: 'discord', name: 'Discord Rich Presence' },
  { id: 'keybindings', name: 'Keybindings' },
  { id: 'terminal', name: 'Terminal' },
  { id: 'advanced', name: 'Advanced' },
];

const getSettingsPath = (): string => {
  if (window.navigator.platform.indexOf('Win') > -1) {
    return 'C:/ProgramData/Pointer/data/settings';
  } else {
    return './settings';
  }
};

// Theme preview component for the theme library
const ThemePreview: React.FC<{ theme: ThemeSettings; name: string; onSelect: () => void }> = ({ theme, name, onSelect }) => {
  return (
    <div 
      onClick={onSelect}
      style={{
        width: '200px',
        height: '150px',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        position: 'relative',
        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
      }}
    >
      {/* Theme preview - titlebar */}
      <div style={{
        height: '24px',
        backgroundColor: theme.customColors.titlebarBg || theme.customColors.bgPrimary || '#1e1e1e',
        borderBottom: `1px solid ${theme.customColors.borderPrimary || '#333'}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
      }}>
        <div style={{ 
          width: '10px', 
          height: '10px', 
          borderRadius: '50%', 
          backgroundColor: '#ff5f57', 
          marginRight: '6px' 
        }} />
        <div style={{ 
          width: '10px', 
          height: '10px', 
          borderRadius: '50%', 
          backgroundColor: '#febc2e', 
          marginRight: '6px' 
        }} />
        <div style={{ 
          width: '10px', 
          height: '10px', 
          borderRadius: '50%', 
          backgroundColor: '#28c840' 
        }} />
      </div>
      
      {/* Theme preview - content */}
      <div style={{
        display: 'flex',
        height: 'calc(100% - 24px)',
      }}>
        {/* Sidebar */}
        <div style={{
          width: '30px',
          backgroundColor: theme.customColors.activityBarBg || theme.customColors.bgPrimary || '#1e1e1e',
          height: '100%',
          borderRight: `1px solid ${theme.customColors.borderPrimary || '#333'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 0',
          gap: '8px',
        }}>
          <div style={{ 
            width: '16px', 
            height: '16px', 
            backgroundColor: theme.customColors.activityBarFg || theme.customColors.textSecondary || '#8a8a8a',
            opacity: 0.6,
            borderRadius: '2px'
          }} />
          <div style={{ 
            width: '16px', 
            height: '16px', 
            backgroundColor: theme.customColors.accentColor || '#0078d4',
            borderRadius: '2px'
          }} />
          <div style={{ 
            width: '16px', 
            height: '16px', 
            backgroundColor: theme.customColors.activityBarFg || theme.customColors.textSecondary || '#8a8a8a',
            opacity: 0.6,
            borderRadius: '2px'
          }} />
        </div>
        
        {/* Main content */}
        <div style={{
          flex: 1,
          backgroundColor: theme.editorColors['editor.background'] || theme.customColors.bgSecondary || '#1e1e1e',
          padding: '2px 0 0 4px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Code lines */}
          <div style={{ 
            fontSize: '9px', 
            display: 'flex', 
            lineHeight: '1.3',
            color: theme.editorColors['editor.foreground'] || theme.customColors.textPrimary || '#d4d4d4',
            fontFamily: 'monospace'
          }}>
            <div style={{ 
              color: theme.editorColors['editorLineNumber.foreground'] || '#858585',
              width: '14px',
              textAlign: 'right',
              marginRight: '6px',
            }}>1</div>
            <span style={{ color: theme.tokenColors?.find(t => t.token === 'keyword')?.foreground || '#569cd6' }}>
              function
            </span>
            <span style={{ color: theme.tokenColors?.find(t => t.token === 'function')?.foreground || '#dcdcaa' }}>
              &nbsp;example
            </span>
            () {'{'}
          </div>
          <div style={{ 
            fontSize: '9px', 
            display: 'flex', 
            lineHeight: '1.3',
            color: theme.editorColors['editor.foreground'] || theme.customColors.textPrimary || '#d4d4d4',
            fontFamily: 'monospace'
          }}>
            <div style={{ 
              color: theme.editorColors['editorLineNumber.foreground'] || '#858585',
              width: '14px',
              textAlign: 'right',
              marginRight: '6px',
            }}>2</div>
            &nbsp;&nbsp;<span style={{ color: theme.tokenColors?.find(t => t.token === 'keyword')?.foreground || '#569cd6' }}>
              const
            </span>
            <span style={{ color: theme.tokenColors?.find(t => t.token === 'variable')?.foreground || '#9cdcfe' }}>
              &nbsp;str
            </span>
            &nbsp;=&nbsp;
            <span style={{ color: theme.tokenColors?.find(t => t.token === 'string')?.foreground || '#ce9178' }}>
              "hello"
            </span>;
          </div>
          <div style={{ 
            fontSize: '9px', 
            display: 'flex', 
            lineHeight: '1.3',
            color: theme.editorColors['editor.foreground'] || theme.customColors.textPrimary || '#d4d4d4',
            fontFamily: 'monospace'
          }}>
            <div style={{ 
              color: theme.editorColors['editorLineNumber.foreground'] || '#858585',
              width: '14px',
              textAlign: 'right',
              marginRight: '6px',
            }}>3</div>
            &nbsp;&nbsp;<span style={{ color: theme.tokenColors?.find(t => t.token === 'keyword')?.foreground || '#569cd6' }}>
              return
            </span>
            <span style={{ color: theme.tokenColors?.find(t => t.token === 'variable')?.foreground || '#9cdcfe' }}>
              &nbsp;str
            </span>;
          </div>
          <div style={{ 
            fontSize: '9px', 
            display: 'flex', 
            lineHeight: '1.3',
            color: theme.editorColors['editor.foreground'] || theme.customColors.textPrimary || '#d4d4d4',
            fontFamily: 'monospace'
          }}>
            <div style={{ 
              color: theme.editorColors['editorLineNumber.foreground'] || '#858585',
              width: '14px',
              textAlign: 'right',
              marginRight: '6px',
            }}>4</div>
            {'}'}
          </div>
        </div>
      </div>
      
      {/* Theme name overlay */}
      <div style={{
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        padding: '6px',
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: '#fff',
        fontSize: '12px',
        fontWeight: 'bold',
        backdropFilter: 'blur(2px)',
      }}>
        {name}
      </div>
    </div>
  );
};

// Theme library modal component
const ThemeLibraryModal: React.FC<{ 
  isVisible: boolean; 
  onClose: () => void; 
  onSelectTheme: (theme: ThemeSettings) => void 
}> = ({ isVisible, onClose, onSelectTheme }) => {
  if (!isVisible) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(3px)',
    }}>
      <div style={{
        width: '80%',
        maxWidth: '900px',
        maxHeight: '80vh',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ margin: 0, fontSize: '16px' }}>Theme Library</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '4px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        {/* Theme grid */}
        <div style={{
          padding: '20px',
          overflowY: 'auto',
          flex: 1,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '20px',
          }}>
            {Object.entries(presetThemes).map(([name, theme]) => (
              <ThemePreview 
                key={name} 
                name={name} 
                theme={theme} 
                onSelect={() => {
                  onSelectTheme(theme);
                  onClose();
                }} 
              />
            ))}
          </div>
        </div>
        
        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border-primary)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
export function Settings({ isVisible, onClose, initialSettings }: SettingsProps) {
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
    autoAcceptGhostText: false,
  });
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>({
    name: 'vs-dark',
    customColors: {
      bgPrimary: '',
      bgSecondary: '',
      bgTertiary: '',
      bgSelected: '',
      bgHover: '',
      bgAccent: '',
      textPrimary: '',
      textSecondary: '',
      borderColor: '',
      borderPrimary: '',
      accentColor: '',
      accentHover: '',
      errorColor: '',
      titlebarBg: '',
      statusbarBg: '',
      statusbarFg: '',
      activityBarBg: '',
      activityBarFg: '',
      inlineCodeColor: '#cc0000',
    },
    editorColors: {
      "editor.background": "#1e1e1e",
      "editor.foreground": "#d4d4d4",
      "editorLineNumber.foreground": "#858585",
      "editorLineNumber.activeForeground": "#c6c6c6",
      "editorCursor.foreground": "#d4d4d4",
      "editor.selectionBackground": "#264f78",
      "editor.lineHighlightBackground": "#2d2d2d50",
    },
    tokenColors: [
      { token: 'keyword', foreground: '#569CD6', fontStyle: 'bold' },
      { token: 'comment', foreground: '#6A9955', fontStyle: 'italic' },
      { token: 'string', foreground: '#CE9178' },
      { token: 'number', foreground: '#B5CEA8' },
      { token: 'operator', foreground: '#D4D4D4' },
      { token: 'type', foreground: '#4EC9B0' },
      { token: 'function', foreground: '#DCDCAA' },
      { token: 'variable', foreground: '#9CDCFE' }
    ]
  });
  const [discordRpcSettings, setDiscordRpcSettings] = useState<DiscordRpcSettings>({...defaultDiscordRpcSettings});
  const [advanced, setAdvanced] = useState<Record<string, any>>({
    titleFormat: '{filename} - {workspace} - Pointer'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [isThemeLibraryVisible, setIsThemeLibraryVisible] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsLoading(true);
      setDiscordRpcSettings({...defaultDiscordRpcSettings});
      console.log('Settings opened - initiating full sync with main process');
      const loadSettingsAsync = async () => {
        try {
          if (ipcRenderer) {
            const rpcSettings = await ipcRenderer.invoke('get-discord-rpc-settings');
            if (rpcSettings) {
              setDiscordRpcSettings(rpcSettings);
            } else {
              console.warn('No settings received from main process');
            }
          }
          await loadAllSettings();
        } catch (error) {
          console.error('Error during settings sync:', error);
        } finally {
          setIsLoading(false);
        }
      };
      loadSettingsAsync();
    }
  }, [isVisible]);

  async function loadDiscordRpcSettings(): Promise<void> {
    try {
      if (ipcRenderer) {
        const rpcSettings = await ipcRenderer.invoke('get-discord-rpc-settings');
        if (rpcSettings) {
          const currentSettingsJson = JSON.stringify(discordRpcSettings);
          const newSettingsJson = JSON.stringify(rpcSettings);
          if (currentSettingsJson !== newSettingsJson) {
            const updatedSettings = {
              ...discordRpcSettings,
              ...rpcSettings
            };
            setDiscordRpcSettings(updatedSettings);
            setHasUnsavedChanges(false);
          } else {
            console.log('Discord RPC settings unchanged');
          }
          return;
        } else {
          console.log('No Discord RPC settings received from main process');
        }
      } else {
        console.log('IPC Renderer not available, skipping Discord RPC settings load');
      }
    } catch (rpcError) {
      console.error('Error loading Discord RPC settings:', rpcError);
    }
    console.log('Using default Discord RPC settings');
    setDiscordRpcSettings({...defaultDiscordRpcSettings});
  }

  const loadAllSettings = async () => {
    setIsLoading(true);
    try {
      const localStorageConfig = localStorage.getItem('modelConfig');
      if (localStorageConfig) {
        const parsed = JSON.parse(localStorageConfig);
        setModelConfigs(prev => ({
          ...prev,
          'default': {
            ...prev.default,
            ...parsed,
            id: parsed.id && parsed.id !== 'default-model' ? parsed.id : 'deepseek-coder-v2-lite-instruct'
          }
        }));
      }
      await loadDiscordRpcSettings();
      const settingsPath = getSettingsPath();
      const result = await FileSystemService.readSettingsFiles(settingsPath);
      if (result && result.success) {
        if (result.settings.models) {
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
        if (result.settings.modelAssignments) {
          const assignments = { ...defaultModelAssignments };
          Object.keys(result.settings.modelAssignments).forEach(key => {
            if (key === 'chat' || key === 'insert' || key === 'autocompletion' || key === 'summary') {
              assignments[key as keyof ModelAssignments] = result.settings.modelAssignments[key];
            }
          });
          setModelAssignments(assignments);
        } else {
          setModelAssignments({...defaultModelAssignments});
        }
        if (result.settings.editor) {
          setEditorSettings(prev => ({
            ...prev,
            ...result.settings.editor
          }));
        }
        if (result.settings.theme) {
          setThemeSettings(prev => ({
            ...prev,
            ...result.settings.theme
          }));
        }
        if (result.settings.discordRpc) {
          setDiscordRpcSettings(prev => ({
            ...prev,
            ...result.settings.discordRpc
          }));
        }
        if (initialSettings?.discordRpc) {
          setDiscordRpcSettings(prev => ({
            ...prev,
            ...initialSettings.discordRpc
          }));
        }
        if (result.settings.advanced) {
          setAdvanced(prev => ({
            ...prev,
            ...result.settings.advanced
          }));
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    window.loadAllSettings = loadAllSettings;
    return () => {
      delete window.loadAllSettings;
    };
  }, []);

  const saveAllSettings = async () => {
    setIsLoading(true);
    try {
      localStorage.setItem('modelConfig', JSON.stringify(modelConfigs.default));
      localStorage.setItem('modelAssignments', JSON.stringify(modelAssignments));
      applyThemeSettings();
      const settingsPath = getSettingsPath();
      const settings = {
        models: modelConfigs,
        modelAssignments: modelAssignments,
        editor: editorSettings,
        theme: themeSettings,
        discordRpc: discordRpcSettings,
        advanced: advanced
      };
      const result = await FileSystemService.saveSettingsFiles(settingsPath, settings);
      if (result.success) {
        console.log('Settings saved successfully');
      } else {
        console.error('Failed to save settings');
      }
      if (ipcRenderer) {
        ipcRenderer.send('discord-settings-update', discordRpcSettings);
        console.log('Discord RPC settings sent to main process via discord-settings-update');
      } else {
        console.log('IPC Renderer not available, skipping Discord RPC settings save');
      }
      setHasUnsavedChanges(false);
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const applyThemeSettings = () => {
    const validBaseThemes = ['vs', 'vs-dark', 'hc-black', 'hc-light'];
    const baseTheme = validBaseThemes.includes(themeSettings.name) 
      ? themeSettings.name as monaco.editor.BuiltinTheme
      : 'vs-dark';
    const processedEditorColors: Record<string, string> = {};
    Object.entries(themeSettings.editorColors).forEach(([key, value]) => {
      if (value) {
        const processedValue = value.length > 7 ? value.substring(0, 7) : value;
        processedEditorColors[key] = processedValue;
      }
    });
    monaco.editor.defineTheme('custom-theme', {
      base: baseTheme,
      inherit: true,
      rules: (themeSettings.tokenColors || []).map(item => ({
        token: item.token,
        foreground: item.foreground?.replace('#', ''),
        background: item.background?.replace('#', ''),
        fontStyle: item.fontStyle
      })),
      colors: processedEditorColors
    });
    monaco.editor.setTheme('custom-theme');
    Object.entries(themeSettings.customColors).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        const cssVarName = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        document.documentElement.style.setProperty(cssVarName, value);
      }
    });
  };

  useEffect(() => {
    applyThemeSettings();
  }, [themeSettings]);

  const handleModelConfigChange = (modelId: string, field: keyof ModelConfig, value: any) => {
    setModelConfigs(prev => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        [field]: value
      }
    }));
    setHasUnsavedChanges(true);
  };

  const handleEditorSettingChange = (field: string, value: any) => {
    setEditorSettings(prev => ({
      ...prev,
      [field]: value
    }));
    setHasUnsavedChanges(true);
  };

  const handleThemeSettingChange = (field: string, value: any) => {
    setThemeSettings({
      ...themeSettings,
      [field]: value
    });
    setHasUnsavedChanges(true);
    if (field === 'customColors' && typeof value === 'object') {
      window.appSettings = window.appSettings || {};
      window.appSettings.theme = window.appSettings.theme || {};
      window.appSettings.theme.customColors = window.appSettings.theme.customColors || {};
      if (value.customFileExtensions) {
        window.appSettings.theme.customColors.customFileExtensions = 
          { ...value.customFileExtensions };
      }
      window.dispatchEvent(new Event('theme-changed'));
    }
  };

  const handleDiscordRpcSettingChange = (field: keyof DiscordRpcSettings, value: any) => {
    setDiscordRpcSettings((prev) => {
      const updated = {
        ...prev,
        [field]: value
      };
      if (initialSettings?.onDiscordSettingsChange) {
        initialSettings.onDiscordSettingsChange(updated);
      }
      return updated;
    });
    setHasUnsavedChanges(true);
  };

  const handleAdvancedSettingChange = (field: string, value: any) => {
    setAdvanced((prev) => ({
      ...prev,
      [field]: value
    }));
    setHasUnsavedChanges(true);
    
    // Dispatch custom event for live title format updates
    if (field === 'titleFormat') {
      const event = new CustomEvent('title-format-changed', { detail: { titleFormat: value } });
      window.dispatchEvent(event);
    }
  };

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

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleCustomColorChange = (key: keyof ThemeSettings['customColors'], value: string) => {
    const newCustomColors = {
      ...themeSettings.customColors,
      [key]: value
    };

    setThemeSettings({
      ...themeSettings,
      customColors: newCustomColors
    });

    setHasUnsavedChanges(true);
    const cssVarName = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    document.documentElement.style.setProperty(cssVarName, value);
    window.dispatchEvent(new Event('theme-changed'));
  };

  const handleEditorColorChange = (key: string, value: string) => {
    setThemeSettings(prev => ({
      ...prev,
      editorColors: {
        ...prev.editorColors,
        [key]: value
      }
    }));
    setHasUnsavedChanges(true);
  };

  const handleTokenColorChange = (index: number, field: string, value: string) => {
    setThemeSettings(prev => {
      const newTokenColors = [...(prev.tokenColors || [])];
      if (!newTokenColors[index]) {
        newTokenColors[index] = { token: '' };
      }
      newTokenColors[index] = { ...newTokenColors[index], [field]: value };
      return {
        ...prev,
        tokenColors: newTokenColors
      };
    });
    setHasUnsavedChanges(true);
  };

  const addTokenColor = () => {
    setThemeSettings(prev => ({
      ...prev,
      tokenColors: [...(prev.tokenColors || []), { token: '' }]
    }));
    setHasUnsavedChanges(true);
  };

  const removeTokenColor = (index: number) => {
    setThemeSettings(prev => {
      const newTokenColors = [...(prev.tokenColors || [])];
      newTokenColors.splice(index, 1);
      return {
        ...prev,
        tokenColors: newTokenColors
      };
    });
    setHasUnsavedChanges(true);
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
          <h2 style={{ margin: 0, fontSize: '18px' }}>
            Settings
            {hasUnsavedChanges && 
              <span style={{ 
                fontSize: '12px', 
                color: 'var(--accent-color)', 
                marginLeft: '10px',
                fontWeight: 'normal'
              }}>
                (unsaved changes)
              </span>
            }
          </h2>
          <button
            onClick={handleClose}
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

                {/* Theme Settings */}
                {activeCategory === 'theme' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center'
                    }}>
                      <h3 style={{ margin: '0 0 0 0', fontSize: '16px' }}>Theme & Editor Settings</h3>
                      <button
                        onClick={() => setIsThemeLibraryVisible(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px',
                          borderRadius: '4px',
                        }}
                        title="Browse Theme Library"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="2" width="7" height="7" rx="1" />
                          <rect x="15" y="2" width="7" height="7" rx="1" />
                          <rect x="2" y="15" width="7" height="7" rx="1" />
                          <rect x="15" y="15" width="7" height="7" rx="1" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Theme Library Modal */}
                    <ThemeLibraryModal 
                      isVisible={isThemeLibraryVisible} 
                      onClose={() => setIsThemeLibraryVisible(false)} 
                      onSelectTheme={(theme) => {
                        setThemeSettings(theme);
                        setHasUnsavedChanges(true);
                      }}
                    />
                    
                    {/* Theme Preset Selector */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '12px',
                      marginTop: '8px',
                      marginBottom: '8px'
                    }}>
                      <select
                        onChange={(e) => {
                          const selectedTheme = presetThemes[e.target.value];
                          if (selectedTheme) {
                            setThemeSettings(selectedTheme);
                            setHasUnsavedChanges(true);
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          cursor: 'pointer',
                          flex: 1,
                        }}
                      >
                        <option value="">Select a preset theme...</option>
                        {Object.keys(presetThemes).map((themeName) => (
                          <option key={themeName} value={themeName}>
                            {themeName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Theme Export/Import Section */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '12px',
                      marginTop: '8px',
                      marginBottom: '8px'
                    }}>
                      <button
                        onClick={() => {
                          const themeData = {
                            theme: themeSettings,
                            editor: editorSettings
                          };
                          
                          const themeJson = JSON.stringify(themeData, null, 2);
                          
                          const blob = new Blob([themeJson], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `pointer-theme-${themeSettings.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
                          document.body.appendChild(a);
                          a.click();
                          
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                          style={{
                          padding: '6px 12px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '4px',
                            color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>Export Theme</span>
                      </button>
                      
                      <label
                          style={{
                          padding: '6px 12px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '4px',
                            color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>Import Theme</span>
                        <input
                          type="file"
                          accept=".json"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              try {
                                const content = event.target?.result as string;
                                const imported = JSON.parse(content);
                                
                                if (!imported.theme) {
                                  throw new Error('Invalid theme file: Missing theme settings');
                                }

                                setThemeSettings(imported.theme);
                                
                                if (imported.editor) {
                                  setEditorSettings(prev => ({
                                    ...prev,
                                    ...imported.editor
                                  }));
                                }
                                
                                setHasUnsavedChanges(true);
                                alert('Theme imported successfully!');
                              } catch (error) {
                                console.error('Error importing theme:', error);
                                alert('Failed to import theme: Invalid JSON format');
                              }

                              e.target.value = '';
                            };
                            
                            reader.readAsText(file);
                          }}
                        />
                      </label>
                    </div>

                    {/* UI Colors Section */}
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>UI Colors</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* Background Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Background Colors</h5>
                          <ColorInput
                            label="Primary Background"
                            value={themeSettings.customColors.bgPrimary || ''}
                            onChange={(value) => handleCustomColorChange('bgPrimary', value)}
                            variable="--bg-primary"
                          />
                          <ColorInput
                            label="Secondary Background"
                            value={themeSettings.customColors.bgSecondary || ''}
                            onChange={(value) => handleCustomColorChange('bgSecondary', value)}
                            variable="--bg-secondary"
                          />
                          <ColorInput
                            label="Tertiary Background"
                            value={themeSettings.customColors.bgTertiary || ''}
                            onChange={(value) => handleCustomColorChange('bgTertiary', value)}
                            variable="--bg-tertiary"
                          />
                          <ColorInput
                            label="Selected Background"
                            value={themeSettings.customColors.bgSelected || ''}
                            onChange={(value) => handleCustomColorChange('bgSelected', value)}
                            variable="--bg-selected"
                          />
                          <ColorInput
                            label="Hover Background"
                            value={themeSettings.customColors.bgHover || ''}
                            onChange={(value) => handleCustomColorChange('bgHover', value)}
                            variable="--bg-hover"
                          />
                          <ColorInput
                            label="Accent Background"
                            value={themeSettings.customColors.bgAccent || ''}
                            onChange={(value) => handleCustomColorChange('bgAccent', value)}
                            variable="--bg-accent"
                          />
                        </div>

                        {/* Text Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Text Colors</h5>
                          <ColorInput
                            label="Primary Text"
                            value={themeSettings.customColors.textPrimary || ''}
                            onChange={(value) => handleCustomColorChange('textPrimary', value)}
                            variable="--text-primary"
                          />
                          <ColorInput
                            label="Secondary Text"
                            value={themeSettings.customColors.textSecondary || ''}
                            onChange={(value) => handleCustomColorChange('textSecondary', value)}
                            variable="--text-secondary"
                          />
                          <ColorInput
                            label="Inline Code"
                            value={themeSettings.customColors.inlineCodeColor || ''}
                            onChange={(value) => handleCustomColorChange('inlineCodeColor', value)}
                            variable="--inline-code-color"
                          />
                        </div>

                        {/* Border Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Border Colors</h5>
                          <ColorInput
                            label="Border Color"
                            value={themeSettings.customColors.borderColor || ''}
                            onChange={(value) => handleCustomColorChange('borderColor', value)}
                            variable="--border-color"
                          />
                          <ColorInput
                            label="Primary Border"
                            value={themeSettings.customColors.borderPrimary || ''}
                            onChange={(value) => handleCustomColorChange('borderPrimary', value)}
                            variable="--border-primary"
                          />
                        </div>

                        {/* Explorer Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Explorer Colors</h5>
                          <ColorInput
                            label="Folder Name"
                            value={themeSettings.customColors.explorerFolderFg || ''}
                            onChange={(value) => handleCustomColorChange('explorerFolderFg', value)}
                            variable="--explorer-folder-fg"
                          />
                          <ColorInput
                            label="Expanded Folder"
                            value={themeSettings.customColors.explorerFolderExpandedFg || ''}
                            onChange={(value) => handleCustomColorChange('explorerFolderExpandedFg', value)}
                            variable="--explorer-folder-expanded-fg"
                          />
                          <ColorInput
                            label="File Name"
                            value={themeSettings.customColors.explorerFileFg || ''}
                            onChange={(value) => handleCustomColorChange('explorerFileFg', value)}
                            variable="--explorer-file-fg"
                          />
                        </div>

                        {/* Custom File Extensions */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Custom File Extensions</h5>
                          <p style={{ fontSize: '12px', opacity: 0.7, marginBottom: '8px' }}>
                            Set custom colors for specific file extensions
                          </p>
                          
                          {/* Display existing custom extensions */}
                          {Object.entries(themeSettings.customColors.customFileExtensions || {}).map(([ext, color], index) => (
                            <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                              <input
                                type="text"
                                placeholder="Extension"
                                value={ext}
                                onChange={(e) => {
                                  const newExt = e.target.value.toLowerCase().trim();
                                  const newCustomExtensions = {...(themeSettings.customColors.customFileExtensions || {})};
                                  
                                  if (newExt && newExt !== ext) {
                                    const colorValue = newCustomExtensions[ext];
                                    delete newCustomExtensions[ext];
                                    newCustomExtensions[newExt] = colorValue;
                                    
                                    const newCustomColors = {
                                      ...themeSettings.customColors,
                                      customFileExtensions: newCustomExtensions
                                    };
                                    
                                    handleThemeSettingChange('customColors', newCustomColors);
                                  }
                                }}
                                style={{
                                  width: '80px',
                                  padding: '4px 8px',
                                  marginRight: '8px',
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                }}
                              />
                              <input
                                type="color"
                                value={color}
                                onChange={(e) => {
                                  const newCustomExtensions = {...(themeSettings.customColors.customFileExtensions || {})};
                                  newCustomExtensions[ext] = e.target.value;
                                  
                                  const newCustomColors = {
                                    ...themeSettings.customColors,
                                    customFileExtensions: newCustomExtensions
                                  };
                                  
                                  handleThemeSettingChange('customColors', newCustomColors);
                                }}
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  padding: '0',
                                  marginRight: '8px',
                                  border: 'none',
                                  background: 'transparent',
                                }}
                              />
                              <button
                                onClick={() => {
                                  const newCustomExtensions = {...(themeSettings.customColors.customFileExtensions || {})};
                                  delete newCustomExtensions[ext];
                                  
                                  const newCustomColors = {
                                    ...themeSettings.customColors,
                                    customFileExtensions: newCustomExtensions
                                  };
                                  
                                  handleThemeSettingChange('customColors', newCustomColors);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--error-color)',
                                  cursor: 'pointer',
                                  fontSize: '16px',
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          
                          {/* Add new extension button */}
                          <button
                            onClick={() => {
                              const existingExtensions = themeSettings.customColors.customFileExtensions || {};
                              
                              const newExtensions = {
                                ...existingExtensions,
                                'ext': '#ffffff'
                              };
                              
                              const newCustomColors = {
                                ...themeSettings.customColors,
                                customFileExtensions: newExtensions
                              };
                              
                              handleThemeSettingChange('customColors', newCustomColors);
                            }}
                            style={{
                              padding: '4px 8px',
                              background: 'var(--bg-accent)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              marginBottom: '8px',
                            }}
                          >
                            Add Custom Extension
                          </button>
                        </div>

                        {/* Accent Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Accent Colors</h5>
                          <ColorInput
                            label="Accent Color"
                            value={themeSettings.customColors.accentColor || ''}
                            onChange={(value) => handleCustomColorChange('accentColor', value)}
                            variable="--accent-color"
                          />
                          <ColorInput
                            label="Accent Hover"
                            value={themeSettings.customColors.accentHover || ''}
                            onChange={(value) => handleCustomColorChange('accentHover', value)}
                            variable="--accent-hover"
                          />
                          <ColorInput
                            label="Error Color"
                            value={themeSettings.customColors.errorColor || ''}
                            onChange={(value) => handleCustomColorChange('errorColor', value)}
                            variable="--error-color"
                          />
                        </div>

                        {/* UI Element Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>UI Elements</h5>
                          <ColorInput
                            label="Titlebar Background"
                            value={themeSettings.customColors.titlebarBg || ''}
                            onChange={(value) => handleCustomColorChange('titlebarBg', value)}
                            variable="--titlebar-bg"
                          />
                          <ColorInput
                            label="Statusbar Background"
                            value={themeSettings.customColors.statusbarBg || ''}
                            onChange={(value) => handleCustomColorChange('statusbarBg', value)}
                            variable="--statusbar-bg"
                          />
                          <ColorInput
                            label="Statusbar Text"
                            value={themeSettings.customColors.statusbarFg || ''}
                            onChange={(value) => handleCustomColorChange('statusbarFg', value)}
                            variable="--statusbar-fg"
                          />
                          <ColorInput
                            label="Activity Bar Background"
                            value={themeSettings.customColors.activityBarBg || ''}
                            onChange={(value) => handleCustomColorChange('activityBarBg', value)}
                            variable="--activity-bar-bg"
                          />
                          <ColorInput
                            label="Activity Bar Text"
                            value={themeSettings.customColors.activityBarFg || ''}
                            onChange={(value) => handleCustomColorChange('activityBarFg', value)}
                            variable="--activity-bar-fg"
                          />
                        </div>
                      </div>
                        </div>

                    {/* Editor Behavior Settings Section */}
                        <div>
                      <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px' }}>Editor Behavior</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Customize how the editor behaves
                      </p>
                      
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

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
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
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
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
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '8px' }}>
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

                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                            <input
                              type="checkbox"
                              checked={editorSettings.autoAcceptGhostText}
                              onChange={(e) => handleEditorSettingChange('autoAcceptGhostText', e.target.checked)}
                              style={{ marginRight: '8px' }}
                            />
                            Auto-accept ghost text
                          </label>
                        </div>
                      </div>
                    </div>
                    
                    {/* Editor Colors Section */}
                    <div>
                      <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px' }}>Monaco Editor Colors</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Customize the appearance of the code editor
                      </p>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* Basic Editor Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Basic Colors</h5>
                          <ColorInput
                            label="Editor Background"
                            value={themeSettings.editorColors["editor.background"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.background", value)}
                            variable=""
                          />
                          <ColorInput
                            label="Editor Foreground"
                            value={themeSettings.editorColors["editor.foreground"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.foreground", value)}
                            variable=""
                          />
                          <ColorInput
                            label="Line Numbers"
                            value={themeSettings.editorColors["editorLineNumber.foreground"] || ''}
                            onChange={(value) => handleEditorColorChange("editorLineNumber.foreground", value)}
                            variable=""
                          />
                          <ColorInput
                            label="Active Line Number"
                            value={themeSettings.editorColors["editorLineNumber.activeForeground"] || ''}
                            onChange={(value) => handleEditorColorChange("editorLineNumber.activeForeground", value)}
                            variable=""
                          />
                          <ColorInput
                            label="Cursor Foreground"
                            value={themeSettings.editorColors["editorCursor.foreground"] || ''}
                            onChange={(value) => handleEditorColorChange("editorCursor.foreground", value)}
                            variable=""
                          />
                        </div>

                        {/* Selection Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Selection</h5>
                          <ColorInput
                            label="Selection Background"
                            value={themeSettings.editorColors["editor.selectionBackground"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.selectionBackground", value)}
                            variable=""
                          />
                          <ColorInput
                            label="Selection Foreground"
                            value={themeSettings.editorColors["editor.selectionForeground"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.selectionForeground", value)}
                            variable=""
                          />
                          <ColorInput
                            label="Selection Highlight Background"
                            value={themeSettings.editorColors["editor.selectionHighlightBackground"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.selectionHighlightBackground", value)}
                            variable=""
                          />
                        </div>

                        {/* Line Highlight Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Current Line</h5>
                          <ColorInput
                            label="Line Highlight Background"
                            value={themeSettings.editorColors["editor.lineHighlightBackground"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.lineHighlightBackground", value)}
                            variable=""
                          />
                          <ColorInput
                            label="Line Highlight Border"
                            value={themeSettings.editorColors["editor.lineHighlightBorder"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.lineHighlightBorder", value)}
                            variable=""
                          />
                        </div>

                        {/* Find Match Colors */}
                        <div>
                          <h5 style={{ margin: '8px 0', fontSize: '13px' }}>Find Matches</h5>
                          <ColorInput
                            label="Find Match Background"
                            value={themeSettings.editorColors["editor.findMatchBackground"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.findMatchBackground", value)}
                            variable=""
                          />
                          <ColorInput
                            label="Find Match Highlight"
                            value={themeSettings.editorColors["editor.findMatchHighlightBackground"] || ''}
                            onChange={(value) => handleEditorColorChange("editor.findMatchHighlightBackground", value)}
                            variable=""
                          />
                        </div>
                      </div>
                    </div>

                    {/* Token Syntax Colors Section */}
                    <div>
                      <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px' }}>Syntax Highlighting</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Customize syntax highlighting for different code elements
                      </p>
                      
                      <div>
                        {(themeSettings.tokenColors || []).map((tokenColor, index) => (
                          <div key={index} style={{ 
                            display: 'flex', 
                            gap: '8px', 
                            marginBottom: '12px',
                            padding: '8px', 
                            border: '1px solid var(--border-primary)',
                            borderRadius: '4px'
                          }}>
                            <div style={{ flex: 2 }}>
                              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Token</label>
                              <input
                                type="text"
                                value={tokenColor.token}
                                onChange={(e) => handleTokenColorChange(index, 'token', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px',
                                  background: 'var(--bg-secondary)',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: '4px',
                                  color: 'var(--text-primary)',
                                  fontSize: '12px'
                                }}
                                placeholder="e.g., keyword, comment, string"
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Foreground</label>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <input
                                  type="color"
                                  value={tokenColor.foreground || '#ffffff'}
                                  onChange={(e) => handleTokenColorChange(index, 'foreground', e.target.value)}
                                  style={{
                                    width: '24px',
                                    height: '24px',
                                    padding: '0',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                  }}
                                />
                                <input
                                  type="text"
                                  value={tokenColor.foreground || ''}
                                  onChange={(e) => handleTokenColorChange(index, 'foreground', e.target.value)}
                                  style={{
                                    width: '100%',
                                    marginLeft: '4px',
                                    padding: '6px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: '4px',
                                    color: 'var(--text-primary)',
                                    fontSize: '12px'
                                  }}
                                  placeholder="#RRGGBB"
                                />
                              </div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>Style</label>
                              <select
                                value={tokenColor.fontStyle || ''}
                                onChange={(e) => handleTokenColorChange(index, 'fontStyle', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px',
                                  background: 'var(--bg-secondary)',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: '4px',
                                  color: 'var(--text-primary)',
                                  fontSize: '12px'
                                }}
                              >
                                <option value="">Normal</option>
                                <option value="italic">Italic</option>
                                <option value="bold">Bold</option>
                                <option value="underline">Underline</option>
                                <option value="bold italic">Bold Italic</option>
                              </select>
                            </div>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'flex-end', 
                              paddingBottom: '6px' 
                            }}>
                              <button
                                onClick={() => removeTokenColor(index)}
                                style={{
                                  background: 'var(--error-color)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  width: '24px',
                                  height: '24px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  cursor: 'pointer',
                                  fontSize: '14px'
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                        
                        <button
                          onClick={addTokenColor}
                          style={{
                            padding: '6px 12px',
                            background: 'var(--accent-color)',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px',
                            width: 'fit-content',
                            marginTop: '8px'
                          }}
                        >
                          Add Token Rule
                        </button>
                      </div>
                      </div>

                    {/* Reset Theme & Editor Settings button */}
                    <div style={{ 
                      marginTop: '24px', 
                      borderTop: '1px solid var(--border-primary)', 
                      paddingTop: '16px',
                      display: 'flex',
                      gap: '12px'
                    }}>
                        <button
                          onClick={() => {
                          if (confirm('Are you sure you want to reset all theme and editor settings to defaults?')) {
                            setEditorSettings({
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
                              autoAcceptGhostText: false,
                            });
                            
                            setThemeSettings({
                              name: 'vs-dark',
                              customColors: {
                                bgPrimary: '',
                                bgSecondary: '',
                                bgTertiary: '',
                                bgSelected: '',
                                bgHover: '',
                                bgAccent: '',
                                textPrimary: '',
                                textSecondary: '',
                                borderColor: '',
                                borderPrimary: '',
                                accentColor: '',
                                accentHover: '',
                                errorColor: '',
                                titlebarBg: '',
                                statusbarBg: '',
                                statusbarFg: '',
                                activityBarBg: '',
                                activityBarFg: '',
                                inlineCodeColor: '#cc0000',
                              },
                              editorColors: {
                                "editor.background": "#1e1e1e",
                                "editor.foreground": "#d4d4d4",
                                "editorLineNumber.foreground": "#858585",
                                "editorLineNumber.activeForeground": "#c6c6c6",
                                "editorCursor.foreground": "#d4d4d4",
                                "editor.selectionBackground": "#264f78",
                                "editor.lineHighlightBackground": "#2d2d2d50",
                              },
                              tokenColors: [
                                { token: 'keyword', foreground: '#569CD6', fontStyle: 'bold' },
                                { token: 'comment', foreground: '#6A9955', fontStyle: 'italic' },
                                { token: 'string', foreground: '#CE9178' },
                                { token: 'number', foreground: '#B5CEA8' },
                                { token: 'operator', foreground: '#D4D4D4' },
                                { token: 'type', foreground: '#4EC9B0' },
                                { token: 'function', foreground: '#DCDCAA' },
                                { token: 'variable', foreground: '#9CDCFE' }
                              ]
                            });

                            setHasUnsavedChanges(true);
                                  }
                                }}
                                style={{
                            padding: '8px 16px',
                            background: 'var(--accent-color)',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          }}
                        >
                        <span>Reset Theme & Editor Settings</span>
                        </button>
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
                  <div className="settings-container">
                    <h3>Advanced Settings</h3>
                    <div className="settings-section">
                      <div className="setting-item">
                        <div className="setting-label">Title Bar Format</div>
                        <div className="setting-description">
                          Customize how the title bar displays information. Available placeholders:
                          <ul>
                            <li><code>{'{filename}'}</code> - Current file name</li>
                            <li><code>{'{workspace}'}</code> - Workspace folder name</li>
                          </ul>
                        </div>
                        <input
                          type="text"
                          value={advanced.titleFormat || '{filename} - {workspace} - Pointer'}
                          onChange={(e) => {
                            handleAdvancedSettingChange('titleFormat', e.target.value);
                          }}
                          className="text-input"
                          placeholder="{filename} - {workspace} - Pointer"
                        />
                      </div>
                      
                      <div style={{ marginTop: '16px' }}>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to reset all settings to default values?')) {
                              setModelConfigs({ 'default': { ...defaultConfig } });
                              setModelAssignments({...defaultModelAssignments});
                              setEditorSettings({
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
                                autoAcceptGhostText: false,
                              });
                              setThemeSettings({
                                name: 'vs-dark',
                                customColors: {
                                  bgPrimary: '',
                                  bgSecondary: '',
                                  bgTertiary: '',
                                  bgSelected: '',
                                  bgHover: '',
                                  bgAccent: '',
                                  textPrimary: '',
                                  textSecondary: '',
                                  borderColor: '',
                                  borderPrimary: '',
                                  accentColor: '',
                                  accentHover: '',
                                  errorColor: '',
                                  titlebarBg: '',
                                  statusbarBg: '',
                                  statusbarFg: '',
                                  activityBarBg: '',
                                  activityBarFg: '',
                                  inlineCodeColor: '#cc0000',
                                },
                                editorColors: {
                                  "editor.background": "#1e1e1e",
                                  "editor.foreground": "#d4d4d4",
                                  "editorLineNumber.foreground": "#858585",
                                  "editorLineNumber.activeForeground": "#c6c6c6",
                                  "editorCursor.foreground": "#d4d4d4",
                                  "editor.selectionBackground": "#264f78",
                                  "editor.lineHighlightBackground": "#2d2d2d50",
                                },
                                tokenColors: [
                                  { token: 'keyword', foreground: '#569CD6', fontStyle: 'bold' },
                                  { token: 'comment', foreground: '#6A9955', fontStyle: 'italic' },
                                  { token: 'string', foreground: '#CE9178' },
                                  { token: 'number', foreground: '#B5CEA8' },
                                  { token: 'operator', foreground: '#D4D4D4' },
                                  { token: 'type', foreground: '#4EC9B0' },
                                  { token: 'function', foreground: '#DCDCAA' },
                                  { token: 'variable', foreground: '#9CDCFE' }
                                ]
                              });
                              setDiscordRpcSettings({...defaultDiscordRpcSettings});
                              setAdvanced({}); // Reset advanced settings too
                              
                              setHasUnsavedChanges(true);
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
                        Add up to two buttons that will appear on your Discord status. URLs must be complete and point to public websites.
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
          padding: '16px 20px',
          borderTop: '1px solid var(--border-primary)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
        }}>
          <button
            onClick={handleClose}
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
            onClick={saveAllSettings}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              background: isLoading ? 'var(--bg-secondary)' : 
                        hasUnsavedChanges ? 'var(--accent-color)' : 'var(--bg-hover)',
              color: isLoading ? 'var(--text-secondary)' : 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            {isLoading ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}