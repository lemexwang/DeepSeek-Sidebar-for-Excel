import { useState, useEffect } from 'react';
import { Dismiss24Regular, Eye24Regular, EyeOff24Regular } from '@fluentui/react-icons';
import { isMac } from '../hooks/useKeyboardShortcuts';
import '../styles/settings.css';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

export default function Settings({ open, onClose, apiKey, onApiKeyChange }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'settings' | 'about'>('shortcuts');
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (open) setLocalApiKey(apiKey);
  }, [open, apiKey]);

  const handleSave = () => {
    if (localApiKey.trim()) {
      onApiKeyChange(localApiKey.trim());
      localStorage.setItem('deepseek_apiKey', localApiKey.trim());
      onClose();
    }
  };

  if (!open) return null;

  const shortcuts = [
    { keys: isMac() ? '⌘K' : 'Ctrl+K', description: 'Focus message input' },
    { keys: isMac() ? '⌘L' : 'Ctrl+L', description: 'Clear chat history' },
    { keys: isMac() ? '⇧?' : 'Shift+?', description: 'Show keyboard shortcuts' },
    { keys: 'Enter', description: 'Send message' },
    { keys: 'Shift+Enter', description: 'New line' },
    { keys: '/', description: 'Open command palette' },
    { keys: 'Esc', description: 'Clear input or close palette' },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close-button" onClick={onClose} aria-label="Close settings" type="button">
            <Dismiss24Regular />
          </button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
            type="button"
          >
            Shortcuts
          </button>
          <button
            className={`settings-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            type="button"
          >
            Settings
          </button>
          <button
            className={`settings-tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
            type="button"
          >
            About
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'shortcuts' ? (
            <div className="shortcuts-section">
              <p className="shortcuts-description">Use these keyboard shortcuts to work faster with DeepSeek</p>
              <div className="shortcuts-list">
                {shortcuts.map((shortcut, index) => (
                  <div key={index} className="shortcut-item">
                    <kbd className="shortcut-keys">{shortcut.keys}</kbd>
                    <span className="shortcut-description">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === 'settings' ? (
            <div className="settings-section">
              <div className="setting-group">
                <label htmlFor="api-key-input" className="setting-label">DeepSeek API Key</label>
                <p className="setting-description">
                  Your API key is stored locally in your browser and never sent to any server except DeepSeek's API.
                </p>
                <div className="api-key-input-group">
                  <input
                    id="api-key-input"
                    type={showApiKey ? 'text' : 'password'}
                    className="api-key-input"
                    value={localApiKey}
                    onChange={(e) => setLocalApiKey(e.target.value)}
                    placeholder="sk-..."
                    spellCheck={false}
                  />
                  <button
                    className="toggle-visibility-button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    type="button"
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff24Regular /> : <Eye24Regular />}
                  </button>
                </div>
                <div className="setting-actions">
                  <button
                    className="save-button"
                    onClick={handleSave}
                    type="button"
                    disabled={!localApiKey.trim()}
                  >
                    Save API Key
                  </button>
                  <a
                    href="https://platform.deepseek.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="get-key-link"
                  >
                    Get your DeepSeek API Key
                  </a>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'about' ? (
            <div className="about-section">
              <div className="about-header">
                <h3 className="about-title">DeepSeek Excel Sidebar</h3>
                <p className="about-version">Version 1.0.0</p>
              </div>
              <div className="about-content">
                <p className="about-description">
                  AI-powered Excel assistant for data analysis, formula writing, and spreadsheet automation.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
