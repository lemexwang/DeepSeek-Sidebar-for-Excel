import { useState, useCallback } from 'react';

export interface ProposedEdit {
  id: string;
  anchorId: string; // For Excel, this is the Range Address (e.g. "Sheet1!A1:B10")
  oldMarkdown: string; // Current values as MD table
  newMarkdown: string; // New values as MD table
  reason?: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export function useProposedEdits(onAccept: (edit: ProposedEdit) => Promise<boolean>) {
  const [proposals, setProposals] = useState<ProposedEdit[]>([]);

  const propose = useCallback((p: Omit<ProposedEdit, 'id' | 'status'>) => {
    const id = crypto.randomUUID();
    setProposals(prev => {
      const existing = prev.find(item => item.anchorId === p.anchorId && item.status === 'pending');
      if (existing) {
        return prev.map(item => item.id === existing.id ? { ...item, ...p } : item);
      }
      return [...prev, { ...p, id, status: 'pending' }];
    });
    return id;
  }, []);

  const accept = useCallback(async (id: string) => {
    setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'accepted' } : p));
    setProposals(prev => {
      const edit = prev.find(item => item.id === id);
      if (edit) {
         onAccept(edit);
      }
      return prev;
    });
  }, [onAccept]);

  const reject = useCallback((id: string) => {
    setProposals(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected' } : p));
  }, []);

  const acceptAll = useCallback(async () => {
    setProposals(prev => {
      prev.filter(p => p.status === 'pending').forEach(p => onAccept(p));
      return prev.map(p => p.status === 'pending' ? { ...p, status: 'accepted' } : p);
    });
  }, [onAccept]);

  const clear = useCallback(() => {
    setProposals([]);
  }, []);

  const updateNewMarkdown = useCallback((id: string, newMd: string) => {
    setProposals(prev => prev.map(p => p.id === id ? { ...p, newMarkdown: newMd } : p));
  }, []);

  return {
    proposals,
    propose,
    accept,
    reject,
    acceptAll,
    clear,
    updateNewMarkdown
  };
}
