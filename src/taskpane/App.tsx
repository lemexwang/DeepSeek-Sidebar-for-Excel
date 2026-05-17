import { useState, useCallback } from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import ChatInterface from './components/ChatInterface';
import ApiKeySetup from './components/ApiKeySetup';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/design-tokens.css';

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() =>
    localStorage.getItem('deepseek_apiKey') || ''
  );

  const handleApiKeyChange = useCallback((key: string) => {
    setApiKey(key);
    localStorage.setItem('deepseek_apiKey', key);
  }, []);

  return (
    <FluentProvider theme={webLightTheme}>
      <ErrorBoundary>
        {apiKey ? (
          <ChatInterface apiKey={apiKey} onApiKeyChange={handleApiKeyChange} />
        ) : (
          <ApiKeySetup onSave={handleApiKeyChange} />
        )}
      </ErrorBoundary>
    </FluentProvider>
  );
}
