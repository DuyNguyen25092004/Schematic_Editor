
const WIRE_COLORS = [
  { name: 'Mặc định', value: undefined },
  { name: 'Đỏ', value: '#e53935' },
  { name: 'Cam', value: '#fb8c00' },
  { name: 'Vàng', value: '#fdd835' },
  { name: 'Xanh lá', value: '#43a047' },
  { name: 'Xanh ngọc', value: '#00acc1' },
  { name: 'Xanh dương', value: '#1e63e9' },
  { name: 'Tím', value: '#8e24aa' },
  { name: 'Hồng', value: '#ec407a' },
  { name: 'Nâu', value: '#6d4c41' },
  { name: 'Xám', value: '#757575' },
];

const RECT_COLORS = [
  { name: 'Không màu', value: 'transparent' },   // + thêm dòng này
  { name: 'Xanh dương', value: '#1677ff' },
  { name: 'Đỏ', value: '#e53935' },
  { name: 'Cam', value: '#fb8c00' },
  { name: 'Vàng', value: '#fdd835' },
  { name: 'Xanh lá', value: '#43a047' },
  { name: 'Xanh ngọc', value: '#00acc1' },
  { name: 'Tím', value: '#8e24aa' },
  { name: 'Hồng', value: '#ec407a' },
  { name: 'Nâu', value: '#6d4c41' },
  { name: 'Xám', value: '#757575' },
];

function PropertyPanel({ selected, nodes, setNodes, wires, setWires, onDelete }) {
  if (!selected) return null;

  const box = {
    position: 'absolute', top: 60, right: 16, zIndex: 20, width: 220,
    background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,.12)', fontFamily: 'sans-serif', fontSize: 13,
  };
  const label = { display: 'block', marginBottom: 4, color: '#555' };
  const input = { width: '100%', padding: '4px 6px', marginBottom: 10, boxSizing: 'border-box' };
  const btn = {
    width: '100%', padding: '6px 0', background: '#ff4d4f', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  };

  if (selected.kind === 'node') {
    const node = nodes.find((n) => n.id === selected.id);
    if (!node) return null;
    const patch = (key, value) =>
      setNodes((ns) => ns.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, [key]: value } } : n));

    const isMos = node.type === 'nmos' || node.type === 'pmos';
    const isRect = node.type === 'rect';   // + thêm dòng này
    const title = {
      nmos: 'MOSFET', pmos: 'MOSFET', npn: 'BJT NPN', pnp: 'BJT PNP',
      res: 'Res', cap: 'Cap', vdd: 'VDD rail', gnd: 'Ground',
      opamp: 'Opamp', fdopamp: 'FD opamp',
      rect: 'Hình chữ nhật',   // + thêm dòng này
    }[node.type] || String(node.type).toUpperCase();
    const hasValue = node.type === 'res' || node.type === 'cap';
    return (
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}{!isRect && ` — ${node.data.reference}`}</div>
        
        {node.type !== 'gnd' && !isRect && (
          <>
            <label style={label}>Reference</label>
            <input style={input} value={node.data.reference}
                  onChange={(e) => patch('reference', e.target.value)} />
          </>
        )}

        {isRect && (
          <>
            <label style={label}>Màu</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {RECT_COLORS.map((c) => {
                const active = (node.data.color || '#1677ff') === c.value;
                const isNone = c.value === 'transparent';
                return (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    onClick={() => patch('color', c.value)}
                    style={{
                      width: 24, height: 24, padding: 0, cursor: 'pointer', borderRadius: '50%',
                      background: isNone
                        ? 'linear-gradient(135deg, #fff 46%, #e53935 46%, #e53935 54%, #fff 54%)'
                        : c.value,
                      border: active ? '2px solid #1677ff' : '1px solid #bbb',
                      boxShadow: active ? '0 0 0 2px rgba(22,119,255,.25)' : 'none',
                    }}
                  />
                );
              })}
            </div>

            <label style={label}>Độ trong suốt ({Math.round((node.data.opacity ?? 1) * 100)}%)</label>
            <input type="range" min={0} max={1} step={0.01} style={{ ...input, padding: 0 }}
                  value={node.data.opacity ?? 1}
                  onChange={(e) => patch('opacity', Number(e.target.value))} />
            <label style={label}>Chữ trong hình</label>
            <textarea
              rows={3}
              style={{ ...input, resize: 'vertical', fontFamily: 'sans-serif' }}
              placeholder="Nhập chữ hiển thị trong hình..."
              value={node.data.text || ''}
              onChange={(e) => patch('text', e.target.value)}
            />
          </>
        )}

        {hasValue && (
          <>
            <label style={label}>Giá trị</label>
            <input style={input} value={node.data.value || ''}
                  onChange={(e) => patch('value', e.target.value)} />
          </>
        )}
        {isMos && (
          <>
            <label style={label}>W</label>
            <input style={input} value={node.data.w || ''}
                  onChange={(e) => patch('w', e.target.value)} />
            <label style={label}>L</label>
            <input style={input} value={node.data.l || ''}
                  onChange={(e) => patch('l', e.target.value)} />
          </>
        )}
        <button style={btn} onClick={onDelete}>Xóa linh kiện</button>
      </div>
    );
  }

  const wire = wires.find((w) => w.id === selected.id);
  if (!wire) return null;
  const fmt = (p) => (p.nodeId ? `${p.nodeId}.${p.portId}` : 'tự do');
  const ends = [wire.points[0], wire.points[wire.points.length - 1]];

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Dây nối</div>
      <label style={label}>Tên dây</label>
      <input id="wire-name-input" style={input} value={wire.name || ''}
        placeholder="(chưa đặt tên) — phím L"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
        }}
        onChange={(e) => setWires((ws) => ws.map((w) =>
        w.id === wire.id ? { ...w, name: e.target.value } : w))} />
      <label style={label}>Màu dây</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {WIRE_COLORS.map((c) => {
          const active = (wire.color || undefined) === c.value;
          const isDefault = c.value === undefined;
          return (
            <button
              key={c.name}
              type="button"
              title={c.name}
              onClick={() => setWires((ws) => ws.map((w) =>
                w.id === wire.id ? { ...w, color: c.value } : w))}
              style={{
                width: 24, height: 24, padding: 0, cursor: 'pointer', borderRadius: '50%',
                background: isDefault
                  ? 'linear-gradient(135deg, #fff 46%, #000 46%, #000 54%, #fff 54%)'
                  : c.value,
                border: active ? '2px solid #1677ff' : '1px solid #bbb',
                boxShadow: active ? '0 0 0 2px rgba(22,119,255,.25)' : 'none',
              }}
            />
          );
        })}
      </div>
      <div style={{ color: '#666', marginBottom: 10 }}>
        {fmt(ends[0])} → {fmt(ends[1])}
      </div>
      <button style={btn} onClick={onDelete}>Xóa dây</button>
    </div>
  );
}

export default PropertyPanel