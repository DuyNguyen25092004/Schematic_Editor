import React, { useEffect, useRef, useState } from 'react';
import LatexText from './LatexText';

export default function TextDialog({ mode, initial, onConfirm, onCancel, onDelete }) {
  const [text, setText] = useState(initial?.text || '');
  const [latex, setLatex] = useState(!!initial?.latex);
  const [attach, setAttach] = useState(!!initial?.attach);
  const ref = useRef(null);

  const parsedLabels = attach ? text.trim().split(/\s+/).filter(Boolean) : [];

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const ok = () => { if (text.trim()) onConfirm({ text, latex, attach }); };

  const row = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' };
  const btn = (bg, color = '#fff') => ({
    padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
    fontWeight: 600, background: bg, color,
  });

  return (
    <div
      style={{
        position: 'fixed', top: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
        width: 360, background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 14,
        boxShadow: '0 8px 24px rgba(0,0,0,.2)', fontFamily: 'sans-serif', fontSize: 13,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
        if (e.key === 'Enter') { e.preventDefault(); ok(); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{mode === 'edit' ? 'Edit Text' : 'Add Text'}</div>
      <textarea
        ref={ref} rows={3} value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok(); }
        }}
        placeholder={
          attach
            ? 'Enter wire labels separated by space: e.g. A B C or IN OUT CLK'
            : (latex ? 'e.g. V_{out} = \\frac{g_m}{C_L}' : 'Enter text... (Shift+Enter for newline)')
        }
        style={{
          width: '100%', boxSizing: 'border-box', padding: 8, marginBottom: 8, resize: 'vertical',
          fontFamily: (latex || attach) ? 'monospace' : 'sans-serif', color: '#000', background: '#fff',
          borderRadius: 4, border: '1px solid #ccc', fontSize: 13,
        }}
      />

      {attach && parsedLabels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#666', width: '100%' }}>
            {parsedLabels.length > 1
              ? `Queue (${parsedLabels.length} labels will be placed sequentially):`
              : 'Label to attach:'}
          </span>
          {parsedLabels.map((lbl, idx) => (
            <span
              key={idx}
              style={{
                background: '#e6f4ff',
                color: '#1677ff',
                border: '1px solid #91caff',
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {idx + 1}. {lbl}
            </span>
          ))}
        </div>
      )}

      <label style={row}>
        <input type="checkbox" checked={latex} onChange={(e) => setLatex(e.target.checked)} />
        LaTeX
      </label>
      {mode === 'create' && (
        <label style={row}>
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
          Attach to net (Wire Label)
        </label>
      )}
      {text.trim() && !attach && (
        <div style={{ margin: '6px 0 10px', padding: 8, border: '1px dashed #ccc', borderRadius: 6, minHeight: 24, overflowX: 'auto', background: '#fafafa' }}>
          <LatexText text={text} latex={latex} size={16} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        {mode === 'edit' && <button style={{ ...btn('#ff4d4f'), marginRight: 'auto' }} onClick={onDelete}>Delete</button>}
        <button style={btn('#eee', '#333')} onClick={onCancel}>Cancel</button>
        <button style={{ ...btn('#1677ff'), opacity: text.trim() ? 1 : 0.5 }} onClick={ok}>
          {mode === 'edit' ? 'Save' : 'OK'}
        </button>
      </div>
    </div>
  );
}