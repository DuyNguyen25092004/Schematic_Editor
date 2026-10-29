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
    position: 'absolute', top: 60, right: 16, zIndex: 20, width: 260,
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
    const isBjt = node.type === 'npn' || node.type === 'pnp';
    const isTransistor = isMos || isBjt;
    const defaultModel = node.type === 'nmos' ? 'NMOS' : node.type === 'pmos' ? 'PMOS' : node.type === 'npn' ? 'NPN' : node.type === 'pnp' ? 'PNP' : '';
    const isRect = node.type === 'rect';
    const isText = node.type === 'text';
    const isLogicGate = MULTI_INPUT_LOGIC_TYPES.has(node.type);
    const isAnalog = node.type === 'opamp' || node.type === 'fdopamp';
    const defaultAnalogModel = node.type === 'fdopamp' ? 'FD_OPAMP' : 'OPAMP';
    const isLogic = isLogicGate || ['inverter', 'buffer', 'dff', 'dff_sr', 'mux'].includes(node.type);
    const defaultLogicModel = isLogicGate
      ? `${node.type.toUpperCase()}_${node.data?.inputs || 2}`
      : ({
          inverter: 'INV',
          buffer: 'BUF',
          dff: 'DFF',
          dff_sr: 'DFF_SR',
          mux: 'MUX',
        }[node.type] || node.type?.toUpperCase() || '');

    const setLogicInputs = (newInputs) => {
      if (readOnly) return;
      const oldInputs = node.data?.inputs || 2;
      const currentModel = node.data?.model;
      const defaultOldModel = `${node.type.toUpperCase()}_${oldInputs}`;
      const defaultNewModel = `${node.type.toUpperCase()}_${newInputs}`;
      if (!currentModel || currentModel === defaultOldModel || currentModel === node.type.toUpperCase()) {
        setNodes((ns) => ns.map((n) =>
          n.id === node.id ? { ...n, data: { ...n.data, inputs: newInputs, model: defaultNewModel } } : n));
      } else {
        patch('inputs', newInputs);
      }
    };
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
    const isPassive = node.type === 'res' || node.type === 'cap';
    const isSource = node.type === 'vsource' || node.type === 'isource';
    const hasMultiplier = isMos || isBjt || isPassive;
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

        {isTransistor && (
          <>
            <label style={label}>Model Name</label>
            <input
              style={input}
              value={node.data?.model ?? defaultModel}
              placeholder={defaultModel}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={(e) => patch('model', e.target.value)}
            />
          </>
        )}

        {isAnalog && (
          <>
            <label style={label}>Model Name</label>
            <input
              style={input}
              value={node.data?.model ?? defaultAnalogModel}
              placeholder={defaultAnalogModel}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={(e) => patch('model', e.target.value)}
            />
          </>
        )}

        {isLogic && (
          <>
            <label style={label}>Model Name</label>
            <input
              style={input}
              value={node.data?.model ?? defaultLogicModel}
              placeholder={defaultLogicModel}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={(e) => patch('model', e.target.value)}
            />
          </>
        )}

        {isLogicGate && (
          <>
            <label style={label}>Inputs ({node.data?.inputs || 2})</label>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, alignItems: 'center' }}>
              <button
                type="button"
                disabled={readOnly || (node.data?.inputs || 2) <= 2}
                onClick={() => setLogicInputs(Math.max(2, (node.data?.inputs || 2) - 1))}
                style={{ padding: '3px 8px', border: '1px solid #ccc', borderRadius: 4, background: '#f5f5f5', cursor: readOnly ? 'default' : 'pointer', fontWeight: 'bold' }}
              >
                -
              </button>
              {[2, 3, 4, 5, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setLogicInputs(n)}
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
                onClick={() => setLogicInputs(Math.min(16, (node.data?.inputs || 2) + 1))}
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

        {node.type === 'res' && (() => {
          const resMode = node.data?.resMode || (node.data?.w && node.data?.l && !node.data?.value ? 'dimension' : 'value');
          return (
            <>
              <label style={label}>Define By</label>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {[
                  { id: 'value', label: 'Value (R)' },
                  { id: 'dimension', label: 'Dimensions (W, L)' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => patch('resMode', m.id)}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: resMode === m.id ? 700 : 500,
                      border: resMode === m.id ? '1px solid #1677ff' : '1px solid #ccc',
                      background: resMode === m.id ? '#e6f4ff' : '#fff',
                      color: resMode === m.id ? '#1677ff' : '#333',
                      cursor: readOnly ? 'default' : 'pointer',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {resMode === 'value' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={label}>Value (Resistance)</label>
                    {node.data?.value && (
                      <LatexText text={formatLatexPassiveValue(node.data.value, node.type)} latex={true} size={13} color="#1677ff" />
                    )}
                  </div>
                  <input
                    style={input}
                    value={node.data.value || ''}
                    placeholder="1k"
                    disabled={readOnly}
                    readOnly={readOnly}
                    onChange={(e) => patch('value', e.target.value)}
                  />
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>Width (W)</label>
                      <input
                        style={input}
                        value={node.data?.w ?? '1u'}
                        placeholder="1u"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('w', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>Length (L)</label>
                      <input
                        style={input}
                        value={node.data?.l ?? '10u'}
                        placeholder="10u"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('l', e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <label style={label}>Model Name (Optional)</label>
              <input
                style={input}
                value={node.data?.model || ''}
                placeholder="e.g. RPOLY, RNWELL"
                disabled={readOnly}
                readOnly={readOnly}
                onChange={(e) => patch('model', e.target.value)}
              />
            </>
          );
        })()}

        {node.type === 'cap' && (() => {
          const capMode = node.data?.capMode || 'value';
          return (
            <>
              <label style={label}>Capacitor Type</label>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {[
                  { id: 'value', label: 'Ideal (C)' },
                  { id: 'mim', label: 'MIM Cap' },
                  { id: 'mom', label: 'MOM Cap' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return;
                      const nextData = { capMode: m.id };
                      if (m.id === 'mim' && (!node.data?.model || node.data?.model === 'CMOM')) {
                        nextData.model = 'CMIM';
                      } else if (m.id === 'mom' && (!node.data?.model || node.data?.model === 'CMIM')) {
                        nextData.model = 'CMOM';
                      }
                      setNodes((ns) => ns.map((n) =>
                        n.id === node.id ? { ...n, data: { ...n.data, ...nextData } } : n));
                    }}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: capMode === m.id ? 700 : 500,
                      border: capMode === m.id ? '1px solid #1677ff' : '1px solid #ccc',
                      background: capMode === m.id ? '#e6f4ff' : '#fff',
                      color: capMode === m.id ? '#1677ff' : '#333',
                      cursor: readOnly ? 'default' : 'pointer',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {capMode === 'value' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={label}>Value (Capacitance)</label>
                    {node.data?.value && (
                      <LatexText text={formatLatexPassiveValue(node.data.value, node.type)} latex={true} size={13} color="#1677ff" />
                    )}
                  </div>
                  <input
                    style={input}
                    value={node.data.value || ''}
                    placeholder="1p"
                    disabled={readOnly}
                    readOnly={readOnly}
                    onChange={(e) => patch('value', e.target.value)}
                  />
                  <label style={label}>Model Name (Optional)</label>
                  <input
                    style={input}
                    value={node.data?.model || ''}
                    placeholder="e.g. CMODEL"
                    disabled={readOnly}
                    readOnly={readOnly}
                    onChange={(e) => patch('model', e.target.value)}
                  />
                </>
              )}

              {capMode === 'mim' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>Width (W)</label>
                      <input
                        style={input}
                        value={node.data?.w ?? '10u'}
                        placeholder="10u"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('w', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>Length (L)</label>
                      <input
                        style={input}
                        value={node.data?.l ?? '10u'}
                        placeholder="10u"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('l', e.target.value)}
                      />
                    </div>
                  </div>
                  <label style={label}>Model Name</label>
                  <input
                    style={input}
                    value={node.data?.model ?? 'CMIM'}
                    placeholder="CMIM"
                    disabled={readOnly}
                    readOnly={readOnly}
                    onChange={(e) => patch('model', e.target.value)}
                  />
                </>
              )}

              {capMode === 'mom' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>Width (W)</label>
                      <input
                        style={input}
                        value={node.data?.w ?? '2u'}
                        placeholder="2u"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('w', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>Length (L)</label>
                      <input
                        style={input}
                        value={node.data?.l ?? '10u'}
                        placeholder="10u"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('l', e.target.value)}
                      />
                    </div>
                  </div>

                  <label style={label}>Fingers (Number of fingers)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    style={input}
                    value={node.data?.fingers ?? 10}
                    placeholder="10"
                    disabled={readOnly}
                    readOnly={readOnly}
                    onChange={(e) => patch('fingers', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>Bottom Layer</label>
                      <select
                        style={{ ...input, cursor: readOnly ? 'not-allowed' : 'pointer' }}
                        value={node.data?.bot_layer ?? 'M2'}
                        disabled={readOnly}
                        onChange={(e) => patch('bot_layer', e.target.value)}
                      >
                        {['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'].map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={label}>Top Layer</label>
                      <select
                        style={{ ...input, cursor: readOnly ? 'not-allowed' : 'pointer' }}
                        value={node.data?.top_layer ?? 'M5'}
                        disabled={readOnly}
                        onChange={(e) => patch('top_layer', e.target.value)}
                      >
                        {['M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'].map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label style={label}>Model Name</label>
                  <input
                    style={input}
                    value={node.data?.model ?? 'CMOM'}
                    placeholder="CMOM"
                    disabled={readOnly}
                    readOnly={readOnly}
                    onChange={(e) => patch('model', e.target.value)}
                  />
                </>
              )}
            </>
          );
        })()}

        {isSource && (() => {
          const sType = node.data?.sourceType || 'dc';
          const isV = node.type === 'vsource';
          const unit = isV ? 'V' : 'A';
          return (
            <>
              <label style={label}>Source Mode</label>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {['dc', 'pulse', 'sin', 'pwl'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={readOnly}
                    onClick={() => patch('sourceType', t)}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: sType === t ? 700 : 500,
                      border: sType === t ? '1px solid #1677ff' : '1px solid #ccc',
                      background: sType === t ? '#e6f4ff' : '#fff',
                      color: sType === t ? '#1677ff' : '#333',
                      cursor: readOnly ? 'default' : 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {sType === 'dc' && (
                <>
                  <label style={label}>DC Value ({unit})</label>
                  <input
                    style={input}
                    value={node.data?.value ?? (isV ? '1V' : '1mA')}
                    placeholder={isV ? '1V' : '1mA'}
                    disabled={readOnly}
                    readOnly={readOnly}
                    onChange={(e) => patch('value', e.target.value)}
                  />
                </>
              )}

              {sType === 'pulse' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>V1 (Initial)</label>
                      <input
                        style={input}
                        value={node.data?.pulse_v1 ?? '0'}
                        placeholder="0"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('pulse_v1', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>V2 (Pulsed)</label>
                      <input
                        style={input}
                        value={node.data?.pulse_v2 ?? (isV ? '1.8V' : '1mA')}
                        placeholder={isV ? '1.8V' : '1mA'}
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('pulse_v2', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>TD (Delay)</label>
                      <input
                        style={input}
                        value={node.data?.pulse_td ?? '0'}
                        placeholder="0"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('pulse_td', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>TR (Rise)</label>
                      <input
                        style={input}
                        value={node.data?.pulse_tr ?? '1n'}
                        placeholder="1n"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('pulse_tr', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>TF (Fall)</label>
                      <input
                        style={input}
                        value={node.data?.pulse_tf ?? '1n'}
                        placeholder="1n"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('pulse_tf', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>PW (Width)</label>
                      <input
                        style={input}
                        value={node.data?.pulse_pw ?? '5n'}
                        placeholder="5n"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('pulse_pw', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>PER (Period)</label>
                      <input
                        style={input}
                        value={node.data?.pulse_per ?? '10n'}
                        placeholder="10n"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('pulse_per', e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {sType === 'sin' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>VO (Offset)</label>
                      <input
                        style={input}
                        value={node.data?.sin_vo ?? '0'}
                        placeholder="0"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('sin_vo', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>VA (Amplitude)</label>
                      <input
                        style={input}
                        value={node.data?.sin_va ?? (isV ? '1V' : '1mA')}
                        placeholder={isV ? '1V' : '1mA'}
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('sin_va', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>FREQ (Hz)</label>
                      <input
                        style={input}
                        value={node.data?.sin_freq ?? '1k'}
                        placeholder="1k"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('sin_freq', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>TD (Delay)</label>
                      <input
                        style={input}
                        value={node.data?.sin_td ?? '0'}
                        placeholder="0"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('sin_td', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={label}>Theta (Damp)</label>
                      <input
                        style={input}
                        value={node.data?.sin_theta ?? '0'}
                        placeholder="0"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('sin_theta', e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={label}>Phase (°)</label>
                      <input
                        style={input}
                        value={node.data?.sin_phase ?? '0'}
                        placeholder="0"
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => patch('sin_phase', e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {sType === 'pwl' && (() => {
                let pairs = Array.isArray(node.data?.pwl_pairs) ? [...node.data.pwl_pairs] : null;
                if (!pairs) {
                  const raw = String(node.data?.pwl_points || '').trim();
                  if (raw) {
                    const tokens = raw.split(/\s+/).filter(Boolean);
                    pairs = [];
                    for (let i = 0; i < tokens.length; i += 2) {
                      pairs.push({ t: tokens[i] || '', v: tokens[i + 1] || '' });
                    }
                  } else {
                    pairs = isV
                      ? [{ t: '0', v: '0' }, { t: '1n', v: '1.8V' }, { t: '5n', v: '1.8V' }, { t: '6n', v: '0' }]
                      : [{ t: '0', v: '0' }, { t: '1n', v: '1mA' }, { t: '5n', v: '1mA' }, { t: '6n', v: '0' }];
                  }
                }

                const numPairs = pairs.length;

                const setNumPairs = (n) => {
                  const targetCount = Math.max(1, Math.min(20, n));
                  let newPairs = [...pairs];
                  if (targetCount > newPairs.length) {
                    while (newPairs.length < targetCount) {
                      newPairs.push({ t: '', v: '' });
                    }
                  } else if (targetCount < newPairs.length) {
                    newPairs = newPairs.slice(0, targetCount);
                  }
                  patch('pwl_pairs', newPairs);
                };

                const updatePair = (index, field, val) => {
                  const newPairs = pairs.map((p, i) => (i === index ? { ...p, [field]: val } : p));
                  patch('pwl_pairs', newPairs);
                };

                const removePair = (index) => {
                  if (pairs.length <= 1) return;
                  const newPairs = pairs.filter((_, i) => i !== index);
                  patch('pwl_pairs', newPairs);
                };

                const addPair = () => {
                  patch('pwl_pairs', [...pairs, { t: '', v: '' }]);
                };

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={label}>Number of pairs of time, value</label>
                      <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 600 }}>{numPairs} pairs</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      style={input}
                      value={numPairs}
                      disabled={readOnly}
                      readOnly={readOnly}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setNumPairs(val);
                      }}
                    />

                    <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 8, paddingRight: 2 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: 4, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>Time</span>
                        <span style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>Value ({unit})</span>
                        <span />
                      </div>

                      {pairs.map((p, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                          <input
                            style={{ ...input, marginBottom: 0, padding: '3px 4px', fontSize: 12 }}
                            placeholder={idx === 0 ? '0' : `${idx}n`}
                            value={p.t || ''}
                            disabled={readOnly}
                            readOnly={readOnly}
                            onChange={(e) => updatePair(idx, 't', e.target.value)}
                          />
                          <input
                            style={{ ...input, marginBottom: 0, padding: '3px 4px', fontSize: 12 }}
                            placeholder={isV ? '1.8V' : '1mA'}
                            value={p.v || ''}
                            disabled={readOnly}
                            readOnly={readOnly}
                            onChange={(e) => updatePair(idx, 'v', e.target.value)}
                          />
                          <button
                            type="button"
                            title="Remove pair"
                            disabled={readOnly || pairs.length <= 1}
                            onClick={() => removePair(idx)}
                            style={{
                              width: 20, height: 20, padding: 0, borderRadius: 3,
                              border: '1px solid #ddd', background: '#fff',
                              color: pairs.length <= 1 ? '#ccc' : '#ff4d4f',
                              fontSize: 11, cursor: pairs.length <= 1 || readOnly ? 'default' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={addPair}
                      style={{
                        width: '100%', padding: '4px 0', border: '1px dashed #1677ff',
                        borderRadius: 4, background: '#f0f7ff', color: '#1677ff',
                        fontSize: 12, fontWeight: 600, cursor: readOnly ? 'default' : 'pointer',
                        marginBottom: 10,
                      }}
                    >
                      + Add Pair
                    </button>
                  </>
                );
              })()}
            </>
          );
        })()}

        {hasMultiplier && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={label}>Multiplier (M)</label>
              {Number(node.data?.m || 1) > 1 && (
                <span style={{ fontSize: 11, color: '#1677ff', fontWeight: 600 }}>M = {node.data?.m}</span>
              )}
            </div>
            <input
              type="number"
              min="1"
              step="1"
              style={input}
              placeholder="1"
              value={node.data?.m ?? 1}
              disabled={readOnly}
              readOnly={readOnly}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1);
                patch('m', val);
              }}
              onBlur={(e) => {
                if (!e.target.value || parseInt(e.target.value, 10) < 1) {
                  patch('m', 1);
                }
              }}
            />
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