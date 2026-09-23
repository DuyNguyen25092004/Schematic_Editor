
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

    return (
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>MOSFET — {node.data.reference}</div>
        <label style={label}>Reference</label>
        <input style={input} value={node.data.reference}
               onChange={(e) => patch('reference', e.target.value)} />
        <label style={label}>W</label>
        <input style={input} value={node.data.w || ''}
               onChange={(e) => patch('w', e.target.value)} />
        <label style={label}>L</label>
        <input style={input} value={node.data.l || ''}
               onChange={(e) => patch('l', e.target.value)} />
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
      <label style={label}>Tên net</label>
      <input style={input} value={wire.net || ''}
             placeholder="(chưa đặt tên)"
             onChange={(e) => setWires((ws) => ws.map((w) =>
               w.id === wire.id ? { ...w, net: e.target.value } : w))} />
      <div style={{ color: '#666', marginBottom: 10 }}>
        {fmt(ends[0])} → {fmt(ends[1])}
      </div>
      <button style={btn} onClick={onDelete}>Xóa dây</button>
    </div>
  );
}

export default PropertyPanel