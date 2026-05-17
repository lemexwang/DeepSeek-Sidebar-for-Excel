import { useState } from 'react';
import { Button, Input, Field } from '@fluentui/react-components';
import '../styles/api-key-setup.css';

interface ApiKeySetupProps {
  onSave: (apiKey: string) => void;
}

export default function ApiKeySetup({ onSave }: ApiKeySetupProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!apiKey.trim()) {
      setError('Please enter a key value');
      return;
    }

    onSave(apiKey.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="api-key-setup">
      <div className="setup-content">
        <div className="setup-header">
          <div className="setup-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 4L4 14L24 24L44 14L24 4Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
              <path d="M4 34L24 44L44 34" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
              <path d="M4 24L24 34L44 24" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1>Welcome to DeepSeek for Excel</h1>
          <p>Enter your DeepSeek API key to get started</p>
        </div>

        <div className="setup-form">
          <Field
            label="DeepSeek API Key"
            validationMessage={error}
            validationState={error ? 'error' : undefined}
          >
            <Input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(_, data) => {
                setApiKey(data.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              size="large"
            />
          </Field>

          <Button
            appearance="primary"
            onClick={handleSubmit}
            disabled={!apiKey.trim()}
            size="large"
            className="submit-button"
          >
            Get Started
          </Button>

          <div className="setup-help">
            <p className="help-note">
              Your API key is stored locally and never sent to any server except DeepSeek's API.{' '}
              <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">
                Get your DeepSeek API key →
              </a>
            </p>
          </div>
        </div>

        <div className="setup-features">
          <h2>What you can do with DeepSeek</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Analyze Data</h3>
              <p>Understand patterns and trends in your spreadsheet</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">✏️</div>
              <h3>Edit Content</h3>
              <p>Update cells, apply formulas, and format data</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📈</div>
              <h3>Create Charts</h3>
              <p>Generate visualizations from your data</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>Ask Questions</h3>
              <p>Get insights and explanations about your data</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
