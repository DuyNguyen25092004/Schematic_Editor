import React, { useState, useEffect, useRef, useCallback } from 'react';
import JSON5 from 'json5';
import WaveDromRenderer from './WaveDromRenderer';
import { WAVEFORM_PRESETS, DEFAULT_WAVEJSON } from './waveformPresets';
import { extractSignalsFromSheet } from './schematicExtractor';

export default function WaveformTabEditor({
  sheet,
  onUpdateSheet,
  allSheets = [],
}) {
  const [code, setCode] = useState(() => sheet.waveJson || DEFAULT_WAVEJSON);
  const [skin, setSkin] = useState(() => sheet.skin || 'default');
  const [zoom, setZoom] = useState(1);
  const [errorMsg, setErrorMsg] = useState(null);
  const [svgStr, setSvgStr] = useState('');
  const [copiedAction, setCopiedAction] = useState(null);
  const [schematicMenuOpen, setSchematicMenuOpen] = useState(false);
  const [splitHeight, setSplitHeight] = useState(38); // Percentage height for top Code Editor
  const [contextMenu, setContextMenu] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const workspaceRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const isDraggingSplitRef = useRef(false);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  }, []);

  // Sync internal code when sheet.waveJson changes externally
  useEffect(() => {
    if (sheet.waveJson && sheet.waveJson !== code) {
      setCode(sheet.waveJson);
    }
  }, [sheet.id]);

  // Close context menu on window click or Escape key
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleCloseMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleCloseMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Notify parent of code & skin updates
  const handleCodeChange = (newVal) => {
    setCode(newVal);
    onUpdateSheet?.({ waveJson: newVal, skin });
  };

  const handleSkinChange = (newSkin) => {
    setSkin(newSkin);
    onUpdateSheet?.({ waveJson: code, skin: newSkin });
  };

  // Format code using JSON5
  const handleBeautify = () => {
    try {
      const parsed = JSON5.parse(code);
      const formatted = JSON5.stringify(parsed, null, 2);
      handleCodeChange(formatted);
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(`Cannot format: ${e.message}`);
    }
  };

  // Load a preset
  const handleSelectPreset = (presetId) => {
    const found = WAVEFORM_PRESETS.find((p) => p.id === presetId);
    if (found) {
      handleCodeChange(found.code);
      setErrorMsg(null);
    }
  };

  // Import signals from a schematic sheet
  const handleImportFromSheet = (targetSheet) => {
    const extractedJson = extractSignalsFromSheet(targetSheet);
    if (extractedJson) {
      handleCodeChange(extractedJson);
      setErrorMsg(null);
    }
    setSchematicMenuOpen(false);
  };

  // Copy SVG to clipboard
  const handleCopySvg = async () => {
    if (!svgStr) return;
    try {
      await navigator.clipboard.writeText(svgStr);
      setCopiedAction('svg');
      setTimeout(() => setCopiedAction(null), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = svgStr;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedAction('svg');
      setTimeout(() => setCopiedAction(null), 2000);
    }
  };

  // Copy Transparent PNG to clipboard (like schematic editor)
  const handleCopyTransparentImage = useCallback(() => {
    if (!svgStr) return;
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // high-dpi 2x Retina
      const w = img.naturalWidth || img.width || 800;
      const h = img.naturalHeight || img.height || 400;
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      // Transparent background
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            showToast('Waveform copied to Clipboard (transparent PNG)!');
          } catch (err) {
            console.error('Clipboard error:', err);
            showToast('Failed to copy to Clipboard');
          }
        }
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = url;
  }, [svgStr, showToast]);

  // Download SVG file
  const handleDownloadSvg = () => {
    if (!svgStr) return;
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheet.name || 'waveform'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download PNG file (convert SVG to Canvas then PNG)
  const handleDownloadPng = () => {
    if (!svgStr) return;
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // high-dpi
      canvas.width = (img.naturalWidth || img.width || 800) * scale;
      canvas.height = (img.naturalHeight || img.height || 400) * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      if (skin === 'dark') {
        ctx.fillStyle = '#141414';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${sheet.name || 'waveform'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Copy JSON to clipboard
  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedAction('json');
      setTimeout(() => setCopiedAction(null), 2000);
    } catch {
      setCopiedAction('json');
      setTimeout(() => setCopiedAction(null), 2000);
    }
  };

  // Handle Tab key in textarea
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const nextVal = val.substring(0, start) + '  ' + val.substring(end);
      handleCodeChange(nextVal);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Sync line numbers scrolling with textarea
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Draggable Horizontal Splitter (Top vs Bottom)
  const handleMouseDownSplitter = useCallback((e) => {
    e.preventDefault();
    isDraggingSplitRef.current = true;

    const onMouseMove = (ev) => {
      if (!isDraggingSplitRef.current) return;
      const containerH = workspaceRef.current
        ? workspaceRef.current.getBoundingClientRect().height
        : (window.innerHeight - 82);
      const containerTop = workspaceRef.current
        ? workspaceRef.current.getBoundingClientRect().top
        : 44;
      const relY = ev.clientY - containerTop;
      const pct = Math.max(15, Math.min(75, (relY / containerH) * 100));
      setSplitHeight(pct);
    };

    const onMouseUp = () => {
      isDraggingSplitRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const linesCount = (code.match(/\n/g) || []).length + 1;
  const lineNumbers = Array.from({ length: linesCount }, (_, i) => i + 1);
  const schematicSheets = allSheets.filter((s) => s.type !== 'waveform');

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 38, // Above tab bar
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        zIndex: 10,
        userSelect: 'none',
      }}
    >
      {/* Top Header Toolbar */}
      <div
        style={{
          height: 44,
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          gap: 12,
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {/* Left Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
            <span style={{ fontSize: 16 }}>📈</span>
            <span>WaveDrom Editor</span>
          </div>

          <div style={{ width: 1, height: 20, background: '#cbd5e1', margin: '0 4px' }} />

          {/* Presets Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Preset:</span>
            <select
              onChange={(e) => handleSelectPreset(e.target.value)}
              defaultValue=""
              style={{
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 5,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="" disabled>Choose template...</option>
              {WAVEFORM_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Skin Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Skin:</span>
            <select
              value={skin}
              onChange={(e) => handleSkinChange(e.target.value)}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 5,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="default">Default</option>
              <option value="narrow">Narrow</option>
              <option value="dark">Dark Theme</option>
            </select>
          </div>

          {/* Beautify Button */}
          <button
            type="button"
            onClick={handleBeautify}
            title="Format / Beautify JSON"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 500,
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 5,
              cursor: 'pointer',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>✨</span> Format
          </button>

          {/* Auto-import from Schematic button */}
          {schematicSheets.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setSchematicMenuOpen((prev) => !prev)}
                title="Extract signal names from a schematic sheet in this circuit"
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  background: '#e0f2fe',
                  border: '1px solid #bae6fd',
                  borderRadius: 5,
                  cursor: 'pointer',
                  color: '#0369a1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>⚡</span> From Schematic ▾
              </button>

              {schematicMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 50,
                    minWidth: 160,
                    padding: '4px 0',
                  }}
                >
                  <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                    SELECT SCHEMATIC
                  </div>
                  {schematicSheets.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => handleImportFromSheet(s)}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        color: '#334155',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>📄</span> {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Toolbar Controls (Zoom & Export) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: 5, border: '1px solid #cbd5e1', padding: '1px 4px' }}>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
              title="Zoom out"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px', fontSize: 13, color: '#475569' }}
            >
              -
            </button>
            <span style={{ fontSize: 11, minWidth: 38, textAlign: 'center', color: '#334155', fontWeight: 600 }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(1))))}
              title="Zoom in"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px', fontSize: 13, color: '#475569' }}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Reset 100%"
              style={{ border: 'none', borderLeft: '1px solid #cbd5e1', background: 'transparent', cursor: 'pointer', padding: '2px 6px', fontSize: 10, color: '#64748b' }}
            >
              1:1
            </button>
          </div>

          <div style={{ width: 1, height: 20, background: '#cbd5e1', margin: '0 2px' }} />

          {/* Export Actions */}
          <button
            type="button"
            onClick={handleCopyTransparentImage}
            title="Copy as transparent PNG (like schematic)"
            style={{
              padding: '4px 8px',
              fontSize: 12,
              fontWeight: 500,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#1677ff',
              borderRadius: 5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            📋 Copy Image
          </button>

          <button
            type="button"
            onClick={handleCopySvg}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              fontWeight: 500,
              background: copiedAction === 'svg' ? '#dcfce7' : '#ffffff',
              border: copiedAction === 'svg' ? '1px solid #86efac' : '1px solid #cbd5e1',
              color: copiedAction === 'svg' ? '#15803d' : '#334155',
              borderRadius: 5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {copiedAction === 'svg' ? 'SVG Copied!' : 'Copy SVG'}
          </button>

          <button
            type="button"
            onClick={handleDownloadSvg}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              fontWeight: 500,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              borderRadius: 5,
              cursor: 'pointer',
            }}
          >
            ⬇️ SVG
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              fontWeight: 500,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              borderRadius: 5,
              cursor: 'pointer',
            }}
          >
            ⬇️ PNG
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              fontWeight: 500,
              background: copiedAction === 'json' ? '#dcfce7' : '#ffffff',
              border: copiedAction === 'json' ? '1px solid #86efac' : '1px solid #cbd5e1',
              color: copiedAction === 'json' ? '#15803d' : '#334155',
              borderRadius: 5,
              cursor: 'pointer',
            }}
          >
            {copiedAction === 'json' ? 'JSON Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {/* Main Workspace: Vertical Split Pane (Code Editor Top + Waveform Preview Bottom) */}
      <div
        ref={workspaceRef}
        id="waveform-workspace-split"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Top Pane: Code Editor */}
        <div
          id="waveform-editor-top-pane"
          style={{
            height: `${splitHeight}%`,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Editor Header */}
          <div
            style={{
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 700,
              color: '#64748b',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span>WaveJSON Source (JSON5)</span>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
              {linesCount} lines • {code.length} chars
            </span>
          </div>

          {/* Editor Body: Line numbers + Textarea */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
            {/* Line numbers column */}
            <div
              ref={lineNumbersRef}
              style={{
                width: 42,
                background: '#f8fafc',
                borderRight: '1px solid #e2e8f0',
                padding: '10px 6px',
                textAlign: 'right',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 12,
                lineHeight: '20px',
                color: '#94a3b8',
                userSelect: 'none',
                overflow: 'hidden',
              }}
            >
              {lineNumbers.map((num) => (
                <div key={num}>{num}</div>
              ))}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              spellCheck={false}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                resize: 'none',
                padding: '10px 12px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: 12,
                lineHeight: '20px',
                color: '#0f172a',
                background: '#ffffff',
                tabSize: 2,
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                overflowX: 'auto',
                userSelect: 'text',
              }}
            />
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div
              style={{
                padding: '6px 12px',
                background: '#fef2f2',
                borderTop: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: 11,
                fontFamily: 'Consolas, monospace',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                maxHeight: 40,
                overflowY: 'auto',
                flexShrink: 0,
              }}
            >
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Draggable Horizontal Splitter (Resize Top vs Bottom) */}
        <div
          id="waveform-horizontal-splitter"
          onMouseDown={handleMouseDownSplitter}
          title="Drag up/down to resize Code Editor vs Waveform Preview"
          style={{
            height: 7,
            width: '100%',
            background: '#e2e8f0',
            cursor: 'row-resize',
            transition: 'background 0.15s ease',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#3b82f6')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#e2e8f0')}
        >
          <div style={{ height: 2, width: 36, background: '#94a3b8', borderRadius: 1 }} />
        </div>

        {/* Bottom Pane: Waveform SVG Preview (Full Width 100%) with Right-Click Context Menu */}
        <div
          id="waveform-preview-bottom-pane"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
          style={{
            flex: 1,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: skin === 'dark' ? '#141414' : '#f8fafc',
          }}
        >
          {/* Preview Header */}
          <div
            style={{
              padding: '6px 14px',
              fontSize: 11,
              fontWeight: 700,
              color: skin === 'dark' ? '#94a3b8' : '#64748b',
              background: skin === 'dark' ? '#1f1f1f' : '#f1f5f9',
              borderBottom: skin === 'dark' ? '1px solid #333' : '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span>Live Timing Diagram Preview (Full Width)</span>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              Right-click waveform to copy transparent image • WaveDrom SVG
            </span>
          </div>

          {/* SVG Container */}
          <div style={{ flex: 1, width: '100%', overflow: 'hidden', position: 'relative' }}>
            <WaveDromRenderer
              waveJson={code}
              skin={skin}
              zoom={zoom}
              onError={setErrorMsg}
              onSvgGenerated={setSvgStr}
            />
          </div>
        </div>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          id="waveform-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
            padding: '4px 0',
            minWidth: 220,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 13,
            color: '#0f172a',
            userSelect: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            id="menu-copy-transparent"
            style={{
              padding: '8px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 500,
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f6ff')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              handleCopyTransparentImage();
              setContextMenu(null);
            }}
          >
            <span>📋</span>
            <span>Copy as Image (Transparent)</span>
          </div>

          <div
            id="menu-copy-svg"
            style={{
              padding: '8px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 500,
              transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f6ff')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              handleCopySvg();
              showToast('Waveform SVG copied to Clipboard!');
              setContextMenu(null);
            }}
          >
            <span>📄</span>
            <span>Copy as SVG</span>
          </div>
        </div>
      )}

      {/* Toast Notification feedback */}
      {toastMsg && (
        <div
          id="waveform-toast"
          style={{
            position: 'fixed',
            bottom: 54,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2000,
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(6px)',
            color: '#ffffff',
            padding: '8px 18px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          <span>✅</span>
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
