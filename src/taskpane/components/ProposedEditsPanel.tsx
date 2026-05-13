import { useState } from 'react';
import * as diff from 'diff';
import { Checkmark24Regular, Dismiss24Regular, Edit24Regular, ChevronDown24Regular, ChevronUp24Regular } from '@fluentui/react-icons';
import type { ProposedEdit } from '../hooks/useProposedEdits';

interface ProposedEditsPanelProps {
  proposals: ProposedEdit[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
  onUpdate: (id: string, newMd: string) => void;
}

export default function ProposedEditsPanel({ proposals, onAccept, onReject, onAcceptAll, onUpdate }: ProposedEditsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const pendings = proposals.filter(p => p.status === 'pending');
  if (pendings.length === 0) return null;

  const startEditing = (p: ProposedEdit) => {
    setEditingId(p.id);
    setEditText(p.newMarkdown);
  };

  const saveEdit = (id: string) => {
    onUpdate(id, editText);
    setEditingId(null);
  };

  return (
    <div className="proposed-edits-panel" style={{ margin: '10px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', fontSize: '12px' }}>
      <div className="panel-header" 
           onClick={() => setIsExpanded(!isExpanded)}
           style={{ padding: '8px 12px', background: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: isExpanded ? '1px solid #ddd' : 'none' }}>
        <span className="panel-title" style={{ fontWeight: 'bold' }}>📝 Pending Cell Edits ({pendings.length})</span>
        {isExpanded ? <ChevronUp24Regular style={{width:'16px'}}/> : <ChevronDown24Regular style={{width:'16px'}}/>}
      </div>
      
      {isExpanded && (
        <div className="panel-content" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {pendings.map(p => {
            const changes = diff.diffLines(p.oldMarkdown, p.newMarkdown);
            return (
              <div key={p.id} className="proposal-item" style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                <div className="proposal-meta" style={{ marginBottom: '8px' }}>
                  <div style={{ color: '#107C10', fontWeight: 'bold' }}>Range: {p.anchorId}</div>
                  {p.reason && <div style={{ marginTop: '4px', fontStyle: 'italic', color: '#666' }}>{p.reason}</div>}
                </div>
                
                <div className="diff-view" style={{ background: '#f8f8f8', padding: '6px', borderRadius: '4px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginBottom: '8px', border: '1px solid #eee' }}>
                  {changes.map((change, i) => (
                    <div key={i} style={{ 
                      color: change.added ? '#2e7d32' : change.removed ? '#c62828' : '#333',
                      background: change.added ? '#e8f5e9' : change.removed ? '#ffebee' : 'transparent',
                      textDecoration: change.removed ? 'line-through' : 'none',
                      padding: '1px 2px'
                    }}>
                      {change.value}
                    </div>
                  ))}
                </div>

                {editingId === p.id ? (
                  <div className="edit-area">
                    <textarea 
                      value={editText} 
                      onChange={(e) => setEditText(e.target.value)}
                      rows={5}
                      style={{ width: '100%', padding: '4px', boxSizing: 'border-box' }}
                    />
                    <div className="edit-actions" style={{ marginTop: '4px', display: 'flex', gap: '8px' }}>
                      <button onClick={() => saveEdit(p.id)} style={{ padding: '2px 8px' }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '2px 8px' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="proposal-actions" style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => onAccept(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', cursor: 'pointer', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '3px' }}>
                      <Checkmark24Regular style={{width:'14px'}}/> Accept
                    </button>
                    <button onClick={() => onReject(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', cursor: 'pointer', background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '3px' }}>
                      <Dismiss24Regular style={{width:'14px'}}/> Reject
                    </button>
                    <button onClick={() => startEditing(p)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', cursor: 'pointer', background: '#fff', border: '1px solid #ddd', borderRadius: '3px' }}>
                      <Edit24Regular style={{width:'14px'}}/> Edit
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="panel-footer" style={{ padding: '10px', textAlign: 'right', background: '#fafafa' }}>
            <button 
              className="accept-all-button" 
              onClick={onAcceptAll}
              style={{ padding: '4px 12px', background: '#107C10', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Accept all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
