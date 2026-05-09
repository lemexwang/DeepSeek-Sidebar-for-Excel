import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import ChatInterface from './components/ChatInterface';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/design-tokens.css';

const DEEPSEEK_API_KEY = 'sk-1e883790ab8c461ebd51fcf6dd0a429b';

export default function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      <ErrorBoundary>
        <ChatInterface apiKey={DEEPSEEK_API_KEY} />
      </ErrorBoundary>
    </FluentProvider>
  );
}
