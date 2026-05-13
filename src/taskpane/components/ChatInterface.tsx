import { useState, useRef, useEffect } from 'react';
import { ArrowDown24Regular, Settings24Regular } from '@fluentui/react-icons';
import Message from './Message';
import MessageInput from './MessageInput';
import ShortcutsHelp from './ShortcutsHelp';
import Settings from './Settings';
import { ToolCallIndicator } from './ToolCallIndicator';
import ProposedEditsPanel from './ProposedEditsPanel';
import { useClaudeChat } from '../hooks/useClaudeChat';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useScreenReaderAnnouncement } from '../hooks/useScreenReaderAnnouncement';
import { useExcelContext } from '../hooks/useExcelContext';
import type { ImageAttachment } from '../lib/types';
import '../styles/chat.css';

interface ChatInterfaceProps {
  apiKey: string;
}

export default function ChatInterface({ apiKey: initialApiKey }: ChatInterfaceProps) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [autoApply, setAutoApply] = useState(false);
  const [input, setInput] = useState('');
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, activeToolCalls, sendMessage, clearMessages, stopGeneration, proposedEdits } = useClaudeChat(apiKey, { autoApply });
  const { announce } = useScreenReaderAnnouncement();
  const { context: excelContext } = useExcelContext();

  const scrollToBottom = (smooth = true) => {
    if (smooth) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    else messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  };

  const checkIfAtBottom = () => {
    const messageList = messageListRef.current;
    if (!messageList) return true;
    const threshold = 100;
    const isBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < threshold;
    setIsAtBottom(isBottom);
    setShowScrollButton(!isBottom && messages.length > 0);
    return isBottom;
  };

  useEffect(() => { if (isAtBottom) scrollToBottom(); }, [messages, isAtBottom]);

  useKeyboardShortcuts([
    { key: 'k', metaKey: true, callback: () => document.querySelector<HTMLTextAreaElement>('#message-textarea')?.focus() },
    { key: 'l', metaKey: true, callback: () => { clearMessages(); announce('Chat history cleared'); } },
    { key: '?', shiftKey: true, callback: () => setShowShortcutsHelp(true) },
  ]);

  const handleSendMessage = async (content: string, attachments?: ImageAttachment[]) => {
    setInput('');
    await sendMessage(content, excelContext, attachments);
  };

  const handleNewChat = () => {
    clearMessages();
    proposedEdits.clear();
    setInput('');
    announce('New chat started');
  };

  return (
    <div className="chat-interface" role="main" aria-label="Chat with DeepSeek">
      <div className="chat-header" role="banner" style={{ background: '#107C10' }}>
        <div className="header-icon"><svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="50" fill="#107C10"/>
            <path d="M72 35c-3-8-11-13-20-12-6 1-11 5-14 11-2 4-2 8-1 12 1 3 3 6 6 8 2 1 4 2 6 2h1c3 0 6-1 8-3 3-3 4-7 3-11-1-3-3-5-6-6-2-1-4 0-5 2s0 4 2 5c1 0 2 0 2-1 1-1 0-2-1-2h-1c0-1 1-2 2-2 2 0 3 2 4 4 0 3-1 6-3 7-2 2-5 2-7 1-2-1-4-3-5-6-1-3-1-6 1-9 2-5 6-8 11-9 7-1 14 3 16 10 3 8-1 16-8 20-4 2-9 3-13 2-6-1-11-5-14-11-4-7-3-16 2-22 5-7 13-11 22-10 4 0 8 2 11 4l3-4c-4-3-9-5-14-5-11-1-21 4-27 13-6 8-7 19-2 28 4 8 11 13 19 14 2 0 4 1 6 1 5 0 10-2 15-4 9-5 14-16 11-26z" fill="white"/>
          </svg></div>
        <div className="header-content">
          <h1 className="header-title">DeepSeek</h1>
          <p className="header-subtitle">AI Assistant for Excel</p>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="Settings" title="Settings" type="button"><Settings24Regular style={{ width: '14px', height: '14px', color: 'white' }} /></button>
          <button className="new-chat-button" onClick={handleNewChat} aria-label="Start new chat" title="Start new chat" type="button">New Chat</button>
        </div>
      </div>
      
      <ProposedEditsPanel 
        proposals={proposedEdits.proposals}
        onAccept={proposedEdits.accept}
        onReject={proposedEdits.reject}
        onAcceptAll={proposedEdits.acceptAll}
        onUpdate={proposedEdits.updateNewMarkdown}
      />

      <div ref={messageListRef} className="message-list" role="log" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h2>DeepSeek for Excel</h2>
            <p>I can analyze data and propose edits to your cells. You can review my changes before they are applied.</p>
          </div>
        ) : (
          <>
            {messages.map((message) => <Message key={message.id} message={message} />)}
            <ToolCallIndicator toolCalls={activeToolCalls} />
            {isLoading && <div className="thinking-indicator"><span className="thinking-text shimmer">Thinking...</span></div>}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {excelContext.hasData && (
        <div className="chat-context-section" style={{ padding: '4px 12px', fontSize: '11px', color: '#107C10', background: '#f0f9f0', borderTop: '1px solid #c8e6c9' }}>
          <span>Active: {excelContext.address} ({excelContext.rowCount} rows)</span>
        </div>
      )}

      <MessageInput value={input} onChange={setInput} onSend={handleSendMessage} onStop={stopGeneration} disabled={isLoading} isGenerating={isLoading} />

      <ShortcutsHelp open={showShortcutsHelp} onClose={() => setShowShortcutsHelp(false)} />
      <Settings open={showSettings} onClose={() => setShowSettings(false)} apiKey={apiKey} onApiKeyChange={setApiKey} autoApply={autoApply} onAutoApplyChange={setAutoApply} />
    </div>
  );
}
