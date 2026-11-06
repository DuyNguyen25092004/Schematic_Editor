import React, { useEffect, useRef, useState } from 'react';
import LatexText from './LatexText';
import { expandBusLabels } from '../utils/busLabelExpander';

export default function TextDialog({ mode, dialogType, initial, onConfirm, onCancel, onDelete }) {
  const isWireLabel = dialogType === 'wire-label' || initial?.dialogType === 'wire-label' || initial?.attach;
  const [text, setText] = useState(initial?.text || '');
  const [latex, setLatex] = useState(initial?.latex !== undefined ? !!initial.latex : (isWireLabel ? true : false));
  const [color, setColor] = useState(initial?.color || '#000000');
  const [attach, setAttach] = useState(isWireLabel ? true : !!initial?.attach);
  const ref = useRef(null);

  const parsedLabels = (isWireLabel || attach) ? expandBusLabels(text) : [];

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const ok = () => { if (text.trim()) onConfirm({ text, latex, color, attach: isWireLabel ? true : attach, dialogType: isWireLabel ? 'wire-label' : 'text' }); };

  const row = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' };
  const btn = (bg, color = '#fff') => ({
    padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
    fontWeight: 600, background: bg, color,
  });

  return (
    <div
      data-testid="text-dialog"
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
      <div data-testid="text-dialog-title" style={{ fontWeight: 700, marginBottom: 8 }}>
        {isWireLabel
          ? (mode === 'edit' ? 'Edit Wire Label' : 'Add Wire Label')
          : (mode === 'edit' ? 'Edit Text' : 'Add Text')}
      </div>
      <textarea
        ref={ref} rows={3} value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok(); }
        }}
        placeholder={
          isWireLabel
            ? (parsedLabels.length > 1
                ? 'Labels queue: e.g. a<1:10>, data[7:0], IN OUT'
                : 'Enter wire label: e.g. a<1:10>, a[1:10], CLK, V_{in}...')
            : (latex ? 'e.g. V_{out} = \\frac{g_m}{C_L}' : 'Enter text... (Shift+Enter for newline)')
        }
        style={{
          width: '100%', boxSizing: 'border-box', padding: 8, marginBottom: 8, resize: 'vertical',
          fontFamily: (latex || isWireLabel) ? 'monospace' : 'sans-serif', color: '#000', background: '#fff',
          borderRadius: 4, border: '1px solid #ccc', fontSize: 13,
        }}
      />

      {isWireLabel && parsedLabels.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#666', width: '100%' }}>
            Queue ({parsedLabels.length} labels will be placed sequentially):
          </span>
          {parsedLabels.map((lbl, idx) => (
            <span
              key={idx}
              data-testid="bus-label-badge"
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
        <input type="checkbox" id="text-dialog-latex-checkbox" checked={latex} onChange={(e) => setLatex(e.target.checked)} />
        LaTeX
      </label>

      {!isWireLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>Color:</span>
          {[
            { name: 'Black', value: '#000000' },
            { name: 'Blue', value: '#1677ff' },
            { name: 'Red', value: '#e53935' },
            { name: 'Green', value: '#43a047' },
            { name: 'Orange', value: '#fb8c00' },
            { name: 'Purple', value: '#8e24aa' },
            { name: 'Gray', value: '#757575' },
          ].map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              onClick={() => setColor(c.value)}
              style={{
                width: 20, height: 20, padding: 0, borderRadius: '50%', background: c.value,
                border: color === c.value ? '2px solid #1677ff' : '1px solid #bbb',
                boxShadow: color === c.value ? '0 0 0 2px rgba(22,119,255,.25)' : 'none',
                cursor: 'pointer',
              }}
            />
          ))}
          <input
            id="text-dialog-color-picker"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Custom Color"
            style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
        </div>
      )}

      {text.trim() && (
        <div style={{ margin: '6px 0 10px', padding: 8, border: '1px dashed #ccc', borderRadius: 6, minHeight: 24, overflowX: 'auto', background: '#fafafa' }}>
          <LatexText text={text} latex={latex} color={color} size={16} />
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