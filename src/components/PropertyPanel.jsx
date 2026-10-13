import LatexText, { formatLatexRef, formatLatexMosParam, formatLatexPassiveValue } from './LatexText';
import { MULTI_INPUT_LOGIC_TYPES } from '../constants';

const WIRE_COLORS = [
  { name: 'Default', value: undefined },
  { name: 'Red', value: '#e53935' },
  { name: 'Orange', value: '#fb8c00' },
  { name: 'Yellow', value: '#fdd835' },
  { name: 'Green', value: '#43a047' },
  { name: 'Teal', value: '#00acc1' },
  { name: 'Blue', value: '#1e63e9' },
  { name: 'Purple', value: '#8e24aa' },
  { name: 'Pink', value: '#ec407a' },
  { name: 'Brown', value: '#6d4c41' },
  { name: 'Gray', value: '#757575' },
];

const RECT_COLORS = [
  { name: 'None', value: 'transparent' },
  { name: 'Blue', value: '#1677ff' },
  { name: 'Red', value: '#e53935' },
  { name: 'Orange', value: '#fb8c00' },
  { name: 'Yellow', value: '#fdd835' },
  { name: 'Green', value: '#43a047' },
  { name: 'Teal', value: '#00acc1' },
  { name: 'Purple', value: '#8e24aa' },
  { name: 'Pink', value: '#ec407a' },
  { name: 'Brown', value: '#6d4c41' },
  { name: 'Gray', value: '#757575' },
];

function PropertyPanel({ selected, nodes, setNodes, wires, setWires, onDelete, readOnly = false }) {
  if (!selected) return null;

  const box = {
    position: 'absolute', top: 60, right: 16, zIndex: 20, width: 220,
    background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,.12)', fontFamily: 'sans-serif', fontSize: 13,
  };
  const label = { display: 'block', marginBottom: 4, color: '#222', fontWeight: 500 };
  const input = {
    width: '100%', padding: '4px 6px', marginBottom: 10, boxSizing: 'border-box',
    color: '#000',
    background: readOnly ? '#f5f5f5' : '#fff', cursor: readOnly ? 'not-allowed' : 'text',
  };
  const btn = {
    width: '100%', padding: '6px 0', background: '#ff4d4f', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  };

  if (selected.kind === 'node') {
    const node = nodes.find((n) => n.id === selected.id);
    if (!node) return null;
    const patch = (key, value) => {
      if (readOnly) return;
      setNodes((ns) => ns.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, [key]: value } } : n));
    };

    const isMos = node.type === 'nmos' || node.type === 'pmos';
    const isRect = node.type === 'rect';
    const isText = node.type === 'text';
    const isLogicGate = MULTI_INPUT_LOGIC_TYPES.has(node.type);
    const title = {
      nmos: 'MOSFET', pmos: 'MOSFET', npn: 'BJT NPN', pnp: 'BJT PNP',
      res: 'Resistor', cap: 'Capacitor', vsource: 'Voltage Source', isource: 'Current Source', vdd: 'VDD Rail', gnd: 'Ground',
      opamp: 'Opamp', fdopamp: 'FD Opamp',
      inverter: 'Inverter', buffer: 'Buffer',
      and: 'AND Gate', or: 'OR Gate', nand: 'NAND Gate', nor: 'NOR Gate',
      xor: 'XOR Gate', xnor: 'XNOR Gate',
      dff: 'D Flip-Flop (EN, RST)',
      dff_sr: 'D Flip-Flop (SET, RST)',
      mux: 'MUX 2:1',
      sw_open: 'Open Switch',
      sw_closed: 'Closed Switch',
      sw_spdt: 'SPDT Switch',
      sw_sp3t: 'SP3T Switch',
      sw_sp4t: 'SP4T Switch',
      rect: 'Rectangle',
      text: 'Text',
    }[node.type] || String(node.type).toUpperCase();
    const hasValue = node.type === 'res' || node.type === 'cap' || node.type === 'vsource' || node.type === 'isource';
    return (
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>{title}</span>
          {!isRect && !isText && node.data?.reference && (
            <>
              <span style={{ color: '#888' }}>—</span>
              <LatexText text={formatLatexRef(node.data.reference, node.type === 'vdd')} latex={true} size={14} color="#1677ff" />
            </>
          )}
          {readOnly && (
            <span style={{ fontSize: 11, background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>
              Read-only
            </span>
          )}
        </div>
        
        {node.type !== 'gnd' && !isRect && !isText && (
          <>
            <label style={label}>Reference</label>
            <input style={input} value={node.data.reference || ''}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={(e) => patch('reference', e.target.value)}
                  onBlur={(e) => {
                    const formatted = formatLatexRef(e.target.value, node.type === 'vdd');
                    if (formatted !== e.target.value) {
                      patch('reference', formatted);
                    }
                  }} />
          </>
        )}

        {isLogicGate && (
          <>
            <label style={label}>Inputs ({node.data?.inputs || 2})</label>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, alignItems: 'center' }}>
              <button
                type="button"
                disabled={readOnly || (node.data?.inputs || 2) <= 2}
                onClick={() => patch('inputs', Math.max(2, (node.data?.inputs || 2) - 1))}
                style={{ padding: '3px 8px', border: '1px solid #ccc', borderRadius: 4, background: '#f5f5f5', cursor: readOnly ? 'default' : 'pointer', fontWeight: 'bold' }}
              >
                -
              </button>
              {[2, 3, 4, 5, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={readOnly}
                  onClick={() => patch('inputs', n)}
                  style={{
                    flex: 1, padding: '3px 0',
                    border: (node.data?.inputs || 2) === n ? '1px solid #1677ff' : '1px solid #ddd',
                    borderRadius: 4,
                    background: (node.data?.inputs || 2) === n ? '#e6f4ff' : '#fff',
                    color: (node.data?.inputs || 2) === n ? '#1677ff' : '#333',
                    fontWeight: (node.data?.inputs || 2) === n ? 700 : 400,
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={readOnly || (node.data?.inputs || 2) >= 16}
                onClick={() => patch('inputs', Math.min(16, (node.data?.inputs || 2) + 1))}
                style={{ padding: '3px 8px', border: '1px solid #ccc', borderRadius: 4, background: '#f5f5f5', cursor: readOnly ? 'default' : 'pointer', fontWeight: 'bold' }}
              >
                +
              </button>
            </div>
          </>
        )}

        {isRect && (
          <>
            <label style={label}>Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {RECT_COLORS.map((c) => {
                const active = (node.data.color || '#1677ff') === c.value;
                const isNoneColor = c.value === 'transparent';
                return (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    disabled={readOnly}
                    onClick={() => !readOnly && patch('color', c.value)}
                    style={{
                      width: 24, height: 24, padding: 0, cursor: readOnly ? 'default' : 'pointer', borderRadius: '50%',
                      background: isNoneColor
                        ? 'linear-gradient(135deg, #fff 46%, #e53935 46%, #e53935 54%, #fff 54%)'
                        : c.value,
                      border: active ? '2px solid #1677ff' : '1px solid #bbb',
                      boxShadow: active ? '0 0 0 2px rgba(22,119,255,.25)' : 'none',
                      opacity: readOnly ? 0.7 : 1,
                    }}
                  />
                );
              })}
            </div>

            <label style={label}>Opacity ({Math.round((node.data.opacity ?? 1) * 100)}%)</label>
            <input type="range" min={0} max={1} step={0.01} style={{ ...input, padding: 0 }}
                  disabled={readOnly}
                  value={node.data.opacity ?? 1}
                  onChange={(e) => patch('opacity', Number(e.target.value))} />
            <label style={label}>Shape Text</label>
            <textarea
              rows={3}
              style={{ ...input, resize: 'vertical', fontFamily: 'sans-serif' }}
              placeholder="Enter text inside rectangle..."
              disabled={readOnly}
              readOnly={readOnly}
              value={node.data.text || ''}
              onChange={(e) => patch('text', e.target.value)}
            />
          </>
        )}

        {isText && (
          <>
            <label style={label}>Content</label>
            <textarea
              rows={3}
              style={{ ...input, resize: 'vertical', fontFamily: node.data.latex ? 'monospace' : 'sans-serif' }}
              disabled={readOnly}
              readOnly={readOnly}
              value={node.data.text || ''}
              onChange={(e) => patch('text', e.target.value)}
            />
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, cursor: readOnly ? 'default' : 'pointer' }}>
              <input type="checkbox" disabled={readOnly} checked={!!node.data.latex} onChange={(e) => patch('latex', e.target.checked)} />
              LaTeX
            </label>
            <label style={label}>Font Size ({node.data.size || 14}px)</label>
            <input type="range" min={8} max={48} step={1} style={{ ...input, padding: 0 }}
                  disabled={readOnly}
                  value={node.data.size || 14}
                  onChange={(e) => patch('size', Number(e.target.value))} />
          </>
        )}

        {hasValue && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={label}>Value</label>
              {node.data?.value && (
                <LatexText text={formatLatexPassiveValue(node.data.value, node.type)} latex={true} size={13} color="#1677ff" />
              )}
            </div>
            <input style={input} value={node.data.value || ''}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={(e) => patch('value', e.target.value)} />
          </>
        )}
        {isMos && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={label}>W</label>
              {node.data?.w && (
                <LatexText text={formatLatexMosParam('W', node.data.w)} latex={true} size={12} color="#1677ff" />
              )}
            </div>
            <input style={input} value={node.data.w || ''}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={(e) => patch('w', e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={label}>L</label>
              {node.data?.l && (
                <LatexText text={formatLatexMosParam('L', node.data.l)} latex={true} size={12} color="#1677ff" />
              )}
            </div>
            <input style={input} value={node.data.l || ''}
                  disabled={readOnly}
                  readOnly={readOnly}
                  onChange={(e) => patch('l', e.target.value)} />
          </>
        )}
        {readOnly ? (
          <div style={{ textAlign: 'center', color: '#888', fontStyle: 'italic', fontSize: 11, padding: '6px 0', background: '#fafafa', borderRadius: 4, border: '1px dashed #d9d9d9' }}>
            Read-only (No edit permission)
          </div>
        ) : (
          <button style={btn} onClick={onDelete}>
            {isText ? 'Delete Text' : 'Delete Component'}
          </button>
        )}
      </div>
    );
  }

  const wire = wires.find((w) => w.id === selected.id);
  if (!wire) return null;
  const fmt = (p) => (p.nodeId ? `${p.nodeId}.${p.portId}` : 'floating');
  const ends = [wire.points[0], wire.points[wire.points.length - 1]];

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Wire</span>
        {readOnly && (
          <span style={{ fontSize: 11, background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>
            Read-only
          </span>
        )}
      </div>
      
      <label style={label}>Wire Name (LaTeX supported)</label>
      <input
        style={input}
        disabled={readOnly}
        readOnly={readOnly}
        value={wire.name || ''}
        placeholder="e.g. V_{in}, V_{out}..."
        onChange={(e) => {
          if (readOnly) return;
          const val = e.target.value;
          setWires((ws) => ws.map((w) => (w.id === wire.id ? { ...w, name: val || undefined } : w)));
        }}
        onBlur={(e) => {
          if (readOnly) return;
          const formatted = formatLatexRef(e.target.value);
          if (formatted !== e.target.value) {
            setWires((ws) => ws.map((w) => (w.id === wire.id ? { ...w, name: formatted || undefined } : w)));
          }
        }}
      />
      {wire.name && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '4px 8px', background: '#f5f5f5', borderRadius: 4 }}>
          <span style={{ fontSize: 11, color: '#666' }}>LaTeX Preview:</span>
          <LatexText text={formatLatexRef(wire.name)} latex={true} size={14} color="#1677ff" />
        </div>
      )}
      {(wire.labels || []).length > 0 && (
        <div style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
          {readOnly ? 'Label displayed on wire.' : 'Double-click wire label to edit or delete.'}
        </div>
      )}

      <label style={label}>Wire Color</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {WIRE_COLORS.map((c) => {
          const active = (wire.color || undefined) === c.value;
          const isDefault = c.value === undefined;
          return (
            <button
              key={c.name}
              type="button"
              title={c.name}
              disabled={readOnly}
              onClick={() => {
                if (readOnly) return;
                setWires((ws) => ws.map((w) =>
                  w.id === wire.id ? { ...w, color: c.value } : w));
              }}
              style={{
                width: 24, height: 24, padding: 0, cursor: readOnly ? 'default' : 'pointer', borderRadius: '50%',
                background: isDefault
                  ? 'linear-gradient(135deg, #fff 46%, #000 46%, #000 54%, #fff 54%)'
                  : c.value,
                border: active ? '2px solid #1677ff' : '1px solid #bbb',
                boxShadow: active ? '0 0 0 2px rgba(22,119,255,.25)' : 'none',
                opacity: readOnly ? 0.7 : 1,
              }}
            />
          );
        })}
      </div>
      <div style={{ color: '#666', marginBottom: 10 }}>
        {fmt(ends[0])} → {fmt(ends[1])}
      </div>
      {readOnly ? (
        <div style={{ textAlign: 'center', color: '#888', fontStyle: 'italic', fontSize: 11, padding: '6px 0', background: '#fafafa', borderRadius: 4, border: '1px dashed #d9d9d9' }}>
          Read-only (No edit permission)
        </div>
      ) : (
        <button style={btn} onClick={onDelete}>Delete Wire</button>
      )}
    </div>
  );
}

export default PropertyPanel;