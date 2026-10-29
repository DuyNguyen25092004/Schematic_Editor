import React, { useState, useMemo } from 'react';
import { generateSpiceNetlist } from '../netlist/spiceExporter';

export default function SpiceNetlistDialog({
  isOpen,
  onClose,
  nodes,
  wires,
  sheets = [],
  activeSheetId,
  circuitName = 'Circuit',
}) {
  const [selectedSheetId, setSelectedSheetId] = useState(activeSheetId || 'sheet_1');
  const [includeModels, setIncludeModels] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [copied, setCopied] = useState(false);

  // Xác định dữ liệu nodes/wires của sheet đang chọn
  const currentSheet = useMemo(() => {
    if (!sheets || sheets.length === 0) return { name: 'Sheet 1', nodes, wires };
    const found = sheets.find((s) => s.id === selectedSheetId);
    if (!found) return { name: 'Sheet 1', nodes, wires };
    // Nếu là active sheet thì lấy nodes/wires hiện tại
    if (found.id === activeSheetId) return { name: found.name, nodes, wires };
    return { name: found.name, nodes: found.nodes || [], wires: found.wires || [] };
  }, [sheets, selectedSheetId, activeSheetId, nodes, wires]);

  // Sinh nội dung Netlist
  const netlistText = useMemo(() => {
    if (!isOpen) return '';
    return generateSpiceNetlist(currentSheet.nodes, currentSheet.wires, {
      circuitName,
      sheetName: currentSheet.name,
      includeModels,
    });
  }, [isOpen, currentSheet, circuitName, includeModels]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(netlistText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback cho trình duyệt cũ
      const ta = document.createElement('textarea');
      ta.value = netlistText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const safeName = (circuitName || 'circuit').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeName}.cir`;
    const blob = new Blob([netlistText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 720,
          maxWidth: '92vw',
          maxHeight: '88vh',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #d9d9d9',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fafafa',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
                SPICE Netlist Export
              </h3>
              <span style={{ fontSize: 12, color: '#666' }}>
                Standard SPICE syntax for ngspice, LTspice & Spectre
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 18,
              cursor: 'pointer',
              color: '#888',
              padding: '4px 8px',
              borderRadius: 4,
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Options Toolbar */}
        <div
          style={{
            padding: '10px 20px',
            background: '#f5f5f5',
            borderBottom: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {sheets && sheets.length > 1 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#333' }}>
                <span>Sheet:</span>
                <select
                  value={selectedSheetId}
                  onChange={(e) => setSelectedSheetId(e.target.value)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    fontSize: 12,
                    background: '#fff',
                  }}
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#333' }}>
              <input
                type="checkbox"
                checked={includeModels}
                onChange={(e) => setIncludeModels(e.target.checked)}
              />
              <span>Include basic .model definitions</span>
            </label>

            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid #ccc',
                fontSize: 12,
                background: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: '#333',
              }}
              title="Toggle theme (Light / Dark)"
            >
              {isDark ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>

          <span style={{ fontSize: 12, color: '#888' }}>
            {netlistText.split('\n').filter((l) => l.trim() && !l.startsWith('*')).length} elements
          </span>
        </div>

        {/* Netlist Text Body */}
        <div
          style={{
            flex: 1,
            padding: 16,
            overflowY: 'auto',
            background: isDark ? '#1e1e1e' : '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <textarea
            readOnly
            value={netlistText}
            style={{
              width: '100%',
              height: 380,
              background: 'transparent',
              color: isDark ? '#d4d4d4' : '#0f172a',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: 'Consolas, "Fira Code", Monaco, "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.55,
              whiteSpace: 'pre',
            }}
          />
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            background: '#fafafa',
          }}
        >
          <button
            type="button"
            onClick={handleCopy}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid #d9d9d9',
              background: copied ? '#52c41a' : '#fff',
              color: copied ? '#fff' : '#333',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
          >
            {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#1677ff',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 4px rgba(22, 119, 255, 0.25)',
            }}
          >
            ⬇️ Download .cir
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid #d9d9d9',
              background: '#fff',
              color: '#666',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
