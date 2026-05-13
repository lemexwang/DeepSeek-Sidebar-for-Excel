import { useState, useCallback } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ImageAttachment, TextContent, ImageContent, DocumentContent } from '../lib/types';
import type { ExcelContext } from './useExcelContext';
import { useExcelTools } from './useExcelTools';
import { useProposedEdits } from './useProposedEdits';
import type { ToolCall } from '../components/ToolCallIndicator';

function buildSystemPrompt(): string {
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  return `You are an elite Excel AI assistant. You help users analyze data and automate spreadsheet tasks.

TOOLS & WORKFLOW
- propose_range_edit(range, values, reason): PREFERRED for all cell edits. Proposes changes for user review.
- write_range(range, values): Direct write. Use only for brand new content or if user requested automatic mode.
- read_range(range): Inspect cell data.
- create_table, create_chart, apply_formula, etc.: Specialized actions.

STRATEGY:
1. When asked to "edit", "fix", or "update" cells:
   a. First read_range to understand current state.
   b. Use propose_range_edit to suggest the new values.
2. Always provide a clear 'reason' in your proposal.
3. Keep responses concise and focused on the data.

Today's date: ${date}`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

export function useClaudeChat(apiKey: string, options?: { autoApply?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const proposedEdits = useProposedEdits(async (edit) => {
    // In Excel, we need to convert the Markdown Table back to a 2D array if the user edited it in the UI.
    // For simplicity, we assume 'edit.newMarkdown' is what we want to write.
    // If it's still a MD table, we parse it.
    const rows = edit.newMarkdown.split('\n').filter(r => r.includes('|') && !r.includes('---'));
    const values = rows.map(r => r.split('|').map(v => v.trim()).filter(v => v !== ''));
    
    const res = await executeTool('write_range', {
      range: edit.anchorId,
      values: values
    });
    return (res as any).success;
  });

  const { tools, executeTool } = useExcelTools({
    onPropose: (p) => {
      const id = proposedEdits.propose(p);
      if (options?.autoApply) {
        proposedEdits.accept(id);
      }
    }
  });

  const sendMessage = useCallback(
    async (content: string, excelContext?: ExcelContext, attachments?: ImageAttachment[]) => {
      if ((!content.trim() && !attachments?.length) || isLoading) return;

      let enhancedTextContent = content.trim();
      if (excelContext && excelContext.hasData) {
        enhancedTextContent += `\n\n[Excel Context: ${excelContext.address} on "${excelContext.sheetName}" (${excelContext.rowCount}×${excelContext.columnCount} cells)]`;
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: enhancedTextContent,
        attachments,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      const controller = new AbortController();
      setAbortController(controller);

      try {
        const anthropic = new Anthropic({ apiKey, baseURL: 'https://localhost:3002', dangerouslyAllowBrowser: true });
        const conversationMessages = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));
        const streamingMessageId = crypto.randomUUID();
        let messageCreated = false;

        const stream = anthropic.messages.stream(
          { model: 'deepseek-chat', max_tokens: 8192, system: SYSTEM_PROMPT, tools: tools as any, messages: conversationMessages as any },
          { signal: controller.signal }
        );

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = (event.delta as any).text as string;
            if (!messageCreated) {
              setMessages((prev) => [...prev, { id: streamingMessageId, role: 'assistant', content: text, isStreaming: true, isAnimating: true }]);
              messageCreated = true;
            } else {
              setMessages((prev) => prev.map((m) => m.id === streamingMessageId ? { ...m, content: m.content + text } : m));
            }
          }
        }

        let response = await stream.finalMessage();
        let fullTextContent = '';
        for (const block of response.content) { if (block.type === 'text') fullTextContent += block.text; }

        while (response.stop_reason === 'tool_use') {
          const toolUseBlocks = response.content.filter((block: any) => block.type === 'tool_use');
          if (toolUseBlocks.length === 0) break;
          conversationMessages.push({ role: 'assistant', content: response.content as any });
          setActiveToolCalls(toolUseBlocks.map((block: any) => ({ id: block.id, name: block.name, status: 'running' as const })));

          const toolResults = await Promise.all(
            toolUseBlocks.map(async (toolUseBlock: any) => {
              const result = await executeTool(toolUseBlock.name, toolUseBlock.input);
              return { type: 'tool_result' as const, tool_use_id: toolUseBlock.id, content: JSON.stringify(result) };
            })
          );

          setActiveToolCalls([]);
          conversationMessages.push({ role: 'user', content: toolResults as any });

          const continueStream = anthropic.messages.stream(
            { model: 'deepseek-chat', max_tokens: 8192, system: SYSTEM_PROMPT, tools: tools as any, messages: conversationMessages as any },
            { signal: controller.signal }
          );

          for await (const event of continueStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullTextContent += event.delta.text;
              if (!messageCreated) {
                setMessages((prev) => [...prev, { id: streamingMessageId, role: 'assistant', content: fullTextContent, isStreaming: true, isAnimating: true }]);
                messageCreated = true;
              } else {
                setMessages((prev) => prev.map((m) => m.id === streamingMessageId ? { ...m, content: fullTextContent } : m));
              }
            }
          }
          response = await continueStream.finalMessage();
        }

        if (messageCreated) {
          setMessages((prev) => prev.map((m) => m.id === streamingMessageId ? { ...m, isStreaming: false, isAnimating: false } : m));
        }
      } catch (error: any) {
        console.error('Chat error:', error);
      } finally {
        setIsLoading(false); setActiveToolCalls([]); setAbortController(null);
      }
    },
    [messages, apiKey, executeTool, tools, isLoading, options, proposedEdits]
  );

  const clearMessages = useCallback(() => { setMessages([]); }, []);
  const stopGeneration = useCallback(() => { if (abortController) { abortController.abort(); setAbortController(null); } }, [abortController]);

  return {
    messages, isLoading, activeToolCalls, sendMessage, clearMessages, stopGeneration, proposedEdits,
  };
}
