import { useState } from 'react';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { isMac } from '../hooks/useKeyboardShortcuts';
import '../styles/settings.css';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  autoApply: boolean;
  onAutoApplyChange: (val: boolean) => void;
}

export default function Settings({ open, onClose, apiKey, onApiKeyChange, autoApply, onAutoApplyChange }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'settings' | 'about'>('shortcuts');
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [showApiKey, setShowApiKey] = useState(false);

  if (!open) return null;

  const handleSaveApiKey = () => {
    onApiKeyChange(localApiKey);
    onClose();
  };

  const shortcuts = [
    { keys: isMac() ? '⌘K' : 'Ctrl+K', description: 'Focus input' },
    { keys: isMac() ? '⌘L' : 'Ctrl+L', description: 'Clear history' },
    { keys: 'Enter', description: 'Send' },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close-button" onClick={onClose} type="button"><Dismiss24Regular /></button>
        </div>
        <div className="settings-tabs">
          <button className={`settings-tab ${activeTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setActiveTab('shortcuts')} type="button">Shortcuts</button>
          <button className={`settings-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')} type="button">Settings</button>
        </div>
        <div className="settings-content">
          {activeTab === 'shortcuts' ? (
            <div className="shortcuts-section">
              <div className="shortcuts-list">
                {shortcuts.map((s, i) => (
                  <div key={i} className="shortcut-item"><kbd className="shortcut-keys">{s.keys}</kbd> <span>{s.description}</span></div>
                ))}
              </div>
            </div>
          ) : activeTab === 'settings' ? (
            <div className="settings-section">
              <div className="setting-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={autoApply} onChange={(e) => onAutoApplyChange(e.target.checked)} style={{ marginRight: '8px' }}/>
                  Auto-apply AI edits
                </label>
              </div>
              <div className="setting-group">
                <label className="setting-label">Anthropic API Key</label>
                <div className="api-key-input-group">
                  <input type={showApiKey ? 'text' : 'password'} className="api-key-input" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} />
                  <button className="toggle-visibility-button" onClick={() => setShowApiKey(!showApiKey)} type="button">{showApiKey ? 'Hide' : 'Show'}</button>
                </div>
                <button className="save-button" onClick={handleSaveApiKey} type="button">Save</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
