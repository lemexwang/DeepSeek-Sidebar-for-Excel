import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../lib/types';
import CodeBlock from './CodeBlock';
import MessageActions from './MessageActions';
import StreamingText from './StreamingText';
import CellReference, { detectCellReferences } from './CellReference';
import AttachmentThumbnails from './AttachmentThumbnails';
import '../styles/message.css';

interface MessageProps {
  message: ChatMessage;
  onRegenerate?: (id: string) => void;
}

export default function Message({ message, onRegenerate }: MessageProps) {
  const isUser = message.role === 'user';
  const getTextContent = (): string => {
    if (typeof message.content === 'string') return message.content;
    const textBlocks = message.content.filter((block) => block.type === 'text');
    return textBlocks.map((block) => (block as any).text).join('\n');
  };
  const textContent = getTextContent();

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-content">
        <MessageActions messageId={message.id} content={textContent} role={message.role} onRegenerate={onRegenerate} />
        <div className="message-text">
          {message.isAnimating && message.isStreaming ? (
            <StreamingText text={textContent} isComplete={!message.isStreaming} speed={50} />
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre({ children }) {
                  const codeEl = children as any;
                  const match = /language-(\w+)/.exec(codeEl?.props?.className ?? '');
                  return <CodeBlock code={String(codeEl?.props?.children ?? '').replace(/\n$/, '')} language={match ? match[1] : 'text'} />;
                },
                code({ className, children, ...props }) {
                  return <code className={className} {...props}>{children}</code>;
                },
                p({ children }) {
                  return (
                    <p>
                      {React.Children.map(children, (child) => {
                        if (typeof child === 'string') {
                          const { segments } = detectCellReferences(child);
                          return segments.map((segment, index) => segment.type === 'cell' ? <CellReference key={index} reference={segment.content} /> : <span key={index}>{segment.content}</span>);
                        }
                        return child;
                      })}
                    </p>
                  );
                },
              }}
            >
              {textContent}
            </ReactMarkdown>
          )}
        </div>
        {isUser && message.attachments && message.attachments.length > 0 && <AttachmentThumbnails attachments={message.attachments} />}
      </div>
    </div>
  );
}
