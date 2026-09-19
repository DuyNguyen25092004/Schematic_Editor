import React, { useCallback, useState, useEffect, useRef } from 'react';
import ReactFlow, {
  Background, Controls, ReactFlowProvider, useNodesState,
  useEdgesState, useReactFlow, useStore,
} from 'reactflow';
import 'reactflow/dist/style.css';

import mockData from './mockData.json';
import NmosNode from './NmosNode';
import PmosNode from './PmosNode'; // Thêm dòng import này
import { toBlob } from 'html-to-image';
const nodeTypes = { nmos: NmosNode, pmos: PmosNode };
const GRID = 10;
const SNAP_RADIUS = 15;

const PORTS = [
  { id: 'gate',   x: 20, y: 50 },
  { id: 'drain',  x: 50, y: 30 },
  { id: 'source', x: 50, y: 70 },
];

function getTransformedPort(port, node) {
  const rot = node.data.rot || 0;
  const flip = node.data.flip || false;
  
  // Tâm xoay mà bạn đã thiết lập trong NmosNode/PmosNode
  const cx = 40;
  const cy = 50;
  
  // Dời gốc tọa độ về tâm xoay
  let dx = port.x - cx;
  let dy = port.y - cy;
  
  // Bước 1: Áp dụng Lật ngang (scaleX)
  if (flip) dx = -dx;
  
  // Bước 2: Áp dụng Xoay
  const angle = (rot % 360 + 360) % 360; 
  let rx = dx, ry = dy;
  if (angle === 90) { rx = -dy; ry = dx; } 
  else if (angle === 180) { rx = -dx; ry = -dy; } 
  else if (angle === 270) { rx = dy; ry = -dx; }
  
  // Trả về tọa độ logic mới
  return { x: cx + rx, y: cy + ry };
}

// ============ THƯ VIỆN LINH KIỆN ============
const COMPONENT_LIBRARY = [
  { type: 'nmos', label: 'NMOS', refPrefix: 'M', defaultData: { w: '1u', l: '150n' } },
  // Thêm linh kiện khác ở đây sau này, ví dụ:
  { type: 'pmos', label: 'PMOS', refPrefix: 'M', defaultData: { w: '1u', l: '150n' } },
];

const initialNodes = mockData.documents[0].instances.map((inst) => ({
  id: inst.id,
  type: 'nmos',
  position: {
    x: Math.round(inst.placement.position.x / 10) * 10,
    y: Math.round((inst.id === 'M1' ? inst.placement.position.y + 60 : inst.placement.position.y) / 10) * 10,
  },
  data: { reference: inst.reference, w: inst.netlist.parameters.w, l: inst.netlist.parameters.l },
  style: { width: 160, height: 100, background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
}));

// Thêm tham số wires vào hàm snapPoint
function snapPoint(p, nodes, wires = []) {
  let best = null;
  let bestDist = SNAP_RADIUS;
  
  // 1. Ưu tiên 1: Snap vào các chân linh kiện (Ports)
  for (const n of nodes) {
    for (const port of PORTS) {
      const tPort = getTransformedPort(port, n);
      const px = Math.round(n.position.x) + tPort.x;
      const py = Math.round(n.position.y) + tPort.y;
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: px, y: py, nodeId: n.id, portId: port.id };
      }
    }
  }
  if (best) return best; 

  // 2. Ưu tiên 2: Snap vào các đường dây điện hiện có
  if (wires) {
    for (const w of wires) {
      const pts = resolvePoints(w.points, nodes, w.lockedVertical); // thêm tham số
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i+1];
        
        let projX = p.x;
        let projY = p.y;
        
        // Tìm hình chiếu của chuột lên đoạn thẳng dây điện
        if (Math.abs(a.x - b.x) < 1) { // Dây dọc
          projX = a.x;
          projY = Math.max(Math.min(a.y, b.y), Math.min(p.y, Math.max(a.y, b.y)));
        } else { // Dây ngang
          projY = a.y;
          projX = Math.max(Math.min(a.x, b.x), Math.min(p.x, Math.max(a.x, b.x)));
        }
        
        const d = Math.hypot(projX - p.x, projY - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = { 
            x: Math.round(projX / GRID) * GRID, 
            y: Math.round(projY / GRID) * GRID,
            onWire: true // Cờ đánh dấu chuột đang chạm vào dây
          };
        }
      }
    }
  }

  return best || { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID };
}

function getJunctionDots(wires, nodes) {
  const resolved = wires.map(w => resolvePoints(w.points, nodes, w.lockedVertical)); // thêm tham số
  const dots = [];
  const isSame = (p1, p2) => Math.abs(p1.x - p2.x) < 1 && Math.abs(p1.y - p2.y) < 1;
  
  // 1. Chỉ thu thập các điểm LÀ ĐẦU MÚT của dây (không tính các điểm gắn vào chân linh kiện)
  const candidates = [];
  resolved.forEach(pts => {
    if (pts.length >= 2) {
      if (!pts[0].nodeId) candidates.push(pts[0]);
      if (!pts[pts.length - 1].nodeId) candidates.push(pts[pts.length - 1]);
    }
  });

  // Lọc trùng lặp để xét mỗi tọa độ 1 lần
  const uniqueCandidates = [];
  candidates.forEach(c => {
    if (!uniqueCandidates.some(u => isSame(u, c))) {
      uniqueCandidates.push({ x: c.x, y: c.y });
    }
  });

  // 2. Đếm số "hướng" dây đi ra từ mỗi điểm đầu mút
  uniqueCandidates.forEach(p => {
    let directions = 0;
    
    resolved.forEach(pts => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i+1];
        if (isSame(a, b)) continue;

        const onVertical = Math.abs(a.x - b.x) < 1 && Math.abs(p.x - a.x) < 1 && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
        const onHorizontal = Math.abs(a.y - b.y) < 1 && Math.abs(p.y - a.y) < 1 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);

        if (onVertical || onHorizontal) {
          if (isSame(p, a) || isSame(p, b)) {
            // Điểm này trùng với đầu mút hoặc góc bẻ của đoạn thẳng -> đếm 1 hướng
            directions += 1; 
          } else {
            // Điểm này nằm GIỮA đoạn thẳng (dây đâm xuyên qua) -> đếm 2 hướng
            directions += 2; 
          }
        }
      }
    });

    // 3. Chấm đen chỉ hiện khi có từ 3 nhánh dây trở lên (Ngã 3, Ngã 4)
    if (directions >= 3) {
      dots.push(p);
    }
  });

  return dots;
}

function bind(pt, src) {
  return src && src.nodeId
    ? { x: pt.x, y: pt.y, nodeId: src.nodeId, portId: src.portId }
    : { x: pt.x, y: pt.y };
}

function orthoPath(a, b, preferVertical) {
  if (Math.abs(a.x - b.x) < 1) {
    return [bind({ x: a.x, y: a.y }, a), bind({ x: a.x, y: b.y }, b)];
  }
  if (Math.abs(a.y - b.y) < 1) {
    return [bind({ x: a.x, y: a.y }, a), bind({ x: b.x, y: a.y }, b)];
  }
  const corner = preferVertical !== undefined
    ? (preferVertical ? { x: a.x, y: b.y } : { x: b.x, y: a.y })
    : (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
  return [bind(a, a), corner, bind(b, b)];
}

function pointsToPolyline(pts) {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

function resolvePoints(pts, nodes, lockedVertical) {
  if (!pts || pts.length < 2) return pts;

  const at = (p) => {
    if (!p.nodeId) return null;
    const n = nodes.find((n) => n.id === p.nodeId);
    const port = PORTS.find((pt) => pt.id === p.portId);
    if (!n || !port) return null;
    // Dùng tọa độ đã xoay/lật
    const tPort = getTransformedPort(port, n);
    return { x: Math.round(n.position.x) + tPort.x, y: Math.round(n.position.y) + tPort.y };
  };

  let out = pts.map((p) => ({ ...p }));
  const last = out.length - 1;

  const a = at(out[0]);
  const b = at(out[last]);
  if (!a && !b) return out;
  if (a) { out[0].x = a.x; out[0].y = a.y; }
  if (b) { out[last].x = b.x; out[last].y = b.y; }

  if (out.length === 2) {
    // Ưu tiên cờ đã lưu; nếu không có (undefined/null) mới tự tính như cũ
    const originalVertical = (lockedVertical !== undefined && lockedVertical !== null)
      ? lockedVertical
      : Math.abs(pts[0].x - pts[1].x) < Math.abs(pts[0].y - pts[1].y);

    const rerouted = orthoPath(
      { ...out[0], nodeId: pts[0].nodeId, portId: pts[0].portId },
      { ...out[1], nodeId: pts[last].nodeId, portId: pts[last].portId },
      originalVertical
    );
    return rerouted;
  }

  if (a) {
    const vertical = Math.abs(pts[0].x - pts[1].x) < Math.abs(pts[0].y - pts[1].y);
    if (vertical) {
      if (Math.abs(out[1].x - out[0].x) > 0.5) out.splice(1, 0, { x: out[0].x, y: out[1].y });
      else out[1].x = out[0].x;
    } else {
      if (Math.abs(out[1].y - out[0].y) > 0.5) out.splice(1, 0, { x: out[1].x, y: out[0].y });
      else out[1].y = out[0].y;
    }
  }

  const l = out.length - 1;
  if (b) {
    const vertical = Math.abs(pts[pts.length - 1].x - pts[pts.length - 2].x)
                   < Math.abs(pts[pts.length - 1].y - pts[pts.length - 2].y);
    if (vertical) {
      if (Math.abs(out[l - 1].x - out[l].x) > 0.5) out.splice(l, 0, { x: out[l].x, y: out[l - 1].y });
      else out[l - 1].x = out[l].x;
    } else {
      if (Math.abs(out[l - 1].y - out[l].y) > 0.5) out.splice(l, 0, { x: out[l - 1].x, y: out[l].y });
      else out[l - 1].y = out[l].y;
    }
  }

  return out;
}

// ============ PANEL DANH SÁCH LINH KIỆN (SIDEBAR) ============
function ComponentPalette({ onComponentDragStart }) {
  const onDragStart = (e, type) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
    onComponentDragStart?.(type);

    // Ẩn ảnh kéo mặc định của trình duyệt (không cho nó tự scale icon sidebar)
    const emptyImg = new Image();
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
  };

  return (
    <div style={{
      width: 200, minWidth: 200, height: '100%', background: '#fff',
      borderRight: '1px solid #e0e0e0', fontFamily: 'sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid #eee', color: '#333' }}>
        Linh kiện
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {COMPONENT_LIBRARY.map((comp) => (
          <div
            key={comp.type}
            draggable
            onDragStart={(e) => onDragStart(e, comp.type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8,
              cursor: 'grab', background: '#fafafa', userSelect: 'none',
              fontSize: 13, fontWeight: 600, color: '#333',
              transition: 'background .15s, border-color .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f6ff'; e.currentTarget.style.borderColor = '#1677ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.borderColor = '#ddd'; }}
          >
            <MiniIcon type={comp.type} />
            {comp.label}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', padding: '12px 16px', fontSize: 12, color: '#888', borderTop: '1px solid #eee', lineHeight: 1.5 }}>
        Kéo linh kiện vào canvas, hoặc bấm phím <b>I</b> để gọi nhanh.
      </div>
    </div>
  );
}

function MiniNmosIcon() {
  return (
    <svg width="28" height="20" viewBox="0 0 160 100" style={{ flexShrink: 0 }}>
      <g stroke="#000" strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter" fill="none">
        <line x1="20" y1="50" x2="28" y2="50" />
        <rect x="28" y="40" width="6" height="20" fill="#000" stroke="none" />
        <rect x="38" y="30" width="6" height="40" fill="#000" stroke="none" />
        <polyline points="50,30 50,43 44,43" />
        <polyline points="50,70 50,57 44,57" />
        <polygon points="50,57 34,50 34,64" fill="#000" stroke="none" />
      </g>
    </svg>
  );
}

// ============ HỘP GỢI Ý ĐẶT LINH KIỆN NHANH (PHÍM "I") ============
function QuickAddMenu({ onPick, onClose }) {
  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      zIndex: 50, background: '#fff', border: '1px solid #ddd', borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,.18)', padding: 8, minWidth: 220,
      fontFamily: 'sans-serif',
    }}>
      <div style={{ padding: '6px 10px', fontSize: 12, color: '#888', fontWeight: 600 }}>
        Chọn linh kiện để đặt — Esc để hủy
      </div>
      {COMPONENT_LIBRARY.map((comp) => (
        <div
          key={comp.type}
          onClick={() => onPick(comp)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f6ff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <MiniNmosIcon />
          {comp.label}
        </div>
      ))}
    </div>
  );
}

function WiringLayer({ isWiringMode, isBoxSelecting, nodes, wires, setWires, selected, setSelected }) {  
  const { screenToFlowPosition } = useReactFlow();
  const [draft, setDraft] = useState(null);
  const [cursor, setCursor] = useState(null);
  const clickTimer = useRef(null);

  const transform = useStore((s) => s.transform);
  const [tx, ty, zoom] = transform;

  useEffect(() => {
    if (!isWiringMode) { setDraft(null); setCursor(null); }
  }, [isWiringMode]);

  useEffect(() => {
    const onKey = (e) => {
      if (!isWiringMode) return;
      if (e.key === 'Backspace' && draft) {
        e.preventDefault();
        setDraft(draft.length <= 1 ? null : draft.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWiringMode, draft]);

  const toFlow = useCallback(
    // Gọi hàm snapPoint mới, truyền thêm wires vào
    (e) => snapPoint(screenToFlowPosition({ x: e.clientX, y: e.clientY }), nodes, wires),
    [screenToFlowPosition, nodes, wires]
  );

  const handleMove = (e) => setCursor(toFlow(e));

  const handleClick = (e) => {
    if (clickTimer.current) return;
    const p = toFlow(e);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setDraft((prev) => {
        if (!prev) return [p];
        const last = prev[prev.length - 1];
        if (Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) return prev;
        return [...prev, ...orthoPath(last, p).slice(1)];
      });
    }, 220);
  };

  const handleDoubleClick = (e) => {
    clearTimeout(clickTimer.current);
    clickTimer.current = null;
    const p = toFlow(e);
    setDraft((prev) => {
      if (!prev) return null;
      const last = prev[prev.length - 1];
      const pts = (Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1)
        ? prev
        : [...prev, ...orthoPath(last, p).slice(1)];
      if (pts.length >= 2) setWires((ws) => [...ws, { id: `wire-${Date.now()}`, points: pts }]);
      return null;
    });
  };

  const preview = draft && cursor ? orthoPath(draft[draft.length - 1], cursor) : null;

  return (
    <>
      <div
        onMouseMove={isWiringMode ? handleMove : undefined}
        onClick={isWiringMode ? handleClick : undefined}
        onDoubleClick={isWiringMode ? handleDoubleClick : undefined}
        style={{
          position: 'absolute', inset: 0, zIndex: 5,
          pointerEvents: isWiringMode ? 'auto' : 'none',
          cursor: isWiringMode ? 'crosshair' : 'default',
        }}
      />

      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: 0, height: 0,
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
          {wires.map((w) => {
            const pts = pointsToPolyline(resolvePoints(w.points, nodes, w.lockedVertical)); // thêm tham số
            const isSel = w.selected || (selected?.kind === 'wire' && selected.id === w.id);
            return (
              <g key={w.id}>
                <polyline
                  points={pts} fill="none" stroke="transparent" strokeWidth={10}
                  style={{
                    // Tắt hẳn khi đang wiring HOẶC đang kéo chọn vùng
                    pointerEvents: (isWiringMode || isBoxSelecting) ? 'none' : 'stroke',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setSelected({ kind: 'wire', id: w.id }); 
                    setWires(ws => ws.map(wire => ({ ...wire, selected: wire.id === w.id })));
                  }}
                />
                <polyline
                  points={pts} fill="none" pointerEvents="none"
                  stroke={isSel ? '#1677ff' : '#000'}
                  strokeWidth={isSel ? 2.5 : 2}
                  strokeLinecap="square" strokeLinejoin="miter"
                  shapeRendering="crispEdges"
                />
              </g>
            );
          })}
          {/* 1. Render tất cả các dấu chấm giao nhau (Solder Dots) của các dây cố định */}
          {getJunctionDots(wires, nodes).map((dot, idx) => (
            <circle key={`dot-${idx}`} cx={dot.x} cy={dot.y} r={3.5} fill="#000" pointerEvents="none" />
          ))}

          {/* 2. Dây đang vẽ phác (Draft) */}
          {draft && (
            <polyline points={pointsToPolyline(draft)} fill="none" stroke="#000"
                       strokeWidth={2} strokeLinecap="square" shapeRendering="crispEdges" />
          )}
          {preview && (
            <polyline points={pointsToPolyline(preview)} fill="none" stroke="#ff4d4f"
                       strokeWidth={2} strokeDasharray="4 3" />
          )}
          
          {/* 3. Con trỏ chuột: Hiện chấm đỏ nếu vào chân, chấm ĐEN nếu vào dây, chấm xám nếu rảnh */}
          {isWiringMode && cursor && (
            <circle 
              cx={cursor.x} 
              cy={cursor.y} 
              r={cursor.portId || cursor.onWire ? 4 : 2.5}
              fill={cursor.portId ? '#ff4d4f' : (cursor.onWire ? '#000' : '#888')} 
            />
          )}
        </svg>
      </div>
    </>
  );
}

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

// ============ SYMBOL REGISTRY — thêm linh kiện mới chỉ cần đăng ký ở đây ============
function NmosSymbol({ strokeWidth = 2 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" fill="none">
      <line x1="20" y1="50" x2="28" y2="50" />
      <rect x="28" y="40" width="3" height="20" fill="#000" stroke="none" />
      <rect x="33" y="37" width="3" height="26" fill="#000" stroke="none" />
      <polyline points="50,30 50,43 36,43" />
      <polyline points="50,70 50,57 36,57" />
      <polygon points="50,57 41,53 41,61" fill="#000" stroke="none" />
    </g>
  );
}

function PmosSymbol({ strokeWidth = 2 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" fill="none">
      {/* Kéo dài đường gate và bỏ vòng tròn */}
      <line x1="20" y1="50" x2="28" y2="50" />
      <rect x="28" y="40" width="3" height="20" fill="#000" stroke="none" />
      <rect x="33" y="37" width="3" height="26" fill="#000" stroke="none" />
      <polyline points="50,30 50,43 36,43" />
      <polyline points="50,70 50,57 36,57" />
      {/* Mũi tên quay ngược chiều so với NMOS */}
      <polygon points="36,43 45,39 45,47" fill="#000" stroke="none" />
    </g>
  );
}

// Đăng ký symbol theo type — muốn thêm linh kiện mới (điện trở, tụ, ...) chỉ cần thêm 1 dòng ở đây
const SYMBOLS = {
  nmos: NmosSymbol,
  pmos: PmosSymbol,
};

// Icon nhỏ trong sidebar — CHỈ để hiển thị danh sách, không dùng làm ảnh kéo
function MiniIcon({ type }) {
  const Symbol = SYMBOLS[type] || NmosSymbol;
  return (
    <svg
      width="28" height="20" viewBox="0 0 160 100"
      style={{ width: 28, height: 20, flexShrink: 0, display: 'block' }}
    >
      <Symbol strokeWidth={6} />
    </svg>
  );
}

// Ghost icon full-size DÙNG CHUNG cho mọi symbol — luôn ép width/height bằng inline style
// để không bị bất kỳ CSS global nào (của ReactFlow hay thư viện khác) đè kích thước.
function GhostIcon({ type }) {
  const Symbol = SYMBOLS[type] || NmosSymbol;
  return (
    <svg
      viewBox="0 0 160 100"
      style={{ width: 160, height: 100, display: 'block' }}
    >
      <Symbol strokeWidth={2} />
    </svg>
  );
}



function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState([]);
  const [wires, setWires] = useState([]);
  
  const [isWiringMode, setIsWiringMode] = useState(false);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  
  const [moveGroup, setMoveGroup] = useState(null); 
  const [cursorNodeId, setCursorNodeId] = useState(null); 
  
  const [contextMenu, setContextMenu] = useState(null);
  const [selected, setSelected] = useState(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [placingType, setPlacingType] = useState(null);
  const [ghostScreenPos, setGhostScreenPos] = useState(null);
  const [dragType, setDragType] = useState(null);
  const [dragGhostPos, setDragGhostPos] = useState(null);

  const reactFlowWrapper = useRef(null);
  const lastMouse = useRef({ x: 0, y: 0 }); 

  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  
  // --- STATE LƯU TỌA ĐỘ BẮT ĐẦU QUÉT KHỐI ---
  const selectionStart = useRef(null); 
  // -----------------------------------------

  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
  const [tx, ty, zoom] = useStore((s) => s.transform);

  // --- NÂNG CẤP COPY BAO GỒM CẢ DÂY NỐI ---
  const handleCopyImage = useCallback(() => {
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedWires = wires.filter((w) => w.selected || (selected?.kind === 'wire' && selected.id === w.id));

  if (selectedNodes.length === 0 && selectedWires.length === 0) {
    alert("Vui lòng bôi đen ít nhất 1 linh kiện hoặc dây nối để copy!");
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  selectedNodes.forEach(n => {
     minX = Math.min(minX, n.position.x);
     minY = Math.min(minY, n.position.y);
     maxX = Math.max(maxX, n.position.x + 160);
     maxY = Math.max(maxY, n.position.y + 100);
  });

  selectedWires.forEach(w => {
     const pts = resolvePoints(w.points, nodes, w.lockedVertical);
     pts.forEach(p => {
         minX = Math.min(minX, p.x);
         minY = Math.min(minY, p.y);
         maxX = Math.max(maxX, p.x);
         maxY = Math.max(maxY, p.y);
     });
  });

  if (minX === Infinity) return;

  const pad = 30; 
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  const width = maxX - minX;
  const height = maxY - minY;

  const screenX = minX * zoom + tx;
  const screenY = minY * zoom + ty;
  const screenWidth = width * zoom;
  const screenHeight = height * zoom;

  const exportArea = reactFlowWrapper.current;
  if (!exportArea) return;

  const dpr = 2;

  // --- BƯỚC MỚI: tạm thời bỏ chọn để tránh xuất ảnh bị màu xanh ---
  const prevNodeSelected = nodes.map((n) => ({ id: n.id, selected: !!n.selected }));
  const prevWireSelected = wires.map((w) => ({ id: w.id, selected: !!w.selected }));
  const prevSelectedPanel = selected;

  setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
  setWires((ws) => ws.map((w) => ({ ...w, selected: false })));
  setSelected(null);

  // Đợi 1 khung hình để React re-render xong (màu về lại bình thường) rồi mới chụp
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toBlob(exportArea, {
        backgroundColor: 'rgba(0,0,0,0)', 
        pixelRatio: dpr, 
        filter: (domNode) => {
          const excludeIds = ['ui-overlay', 'context-menu'];
          if (domNode?.id && excludeIds.includes(domNode.id)) return false;
          if (domNode?.classList) {
            const classes = domNode.classList;
            if (
              classes.contains('react-flow__background') || 
              classes.contains('react-flow__controls') ||
              classes.contains('react-flow__nodesselection') ||       
              classes.contains('react-flow__nodesselection-rect')     
            ) return false;
          }
          return true;
        }
      })
        .then((fullBlob) => {
          if (!fullBlob) return;
          const img = new Image();
          const url = URL.createObjectURL(fullBlob);
          
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = screenWidth * dpr;
            canvas.height = screenHeight * dpr;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, screenX * dpr, screenY * dpr, screenWidth * dpr, screenHeight * dpr, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob((croppedBlob) => {
              if (croppedBlob) {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': croppedBlob })])
                  .then(() => alert('Đã copy vùng chọn (trong suốt) vào Clipboard!'))
                  .catch((err) => alert('Lỗi khi ghi vào Clipboard: ' + err));
              }
              URL.revokeObjectURL(url);

              // --- Khôi phục lại trạng thái chọn sau khi chụp xong ---
              setNodes((ns) => ns.map((n) => {
                const prev = prevNodeSelected.find((p) => p.id === n.id);
                return prev ? { ...n, selected: prev.selected } : n;
              }));
              setWires((ws) => ws.map((w) => {
                const prev = prevWireSelected.find((p) => p.id === w.id);
                return prev ? { ...w, selected: prev.selected } : w;
              }));
              setSelected(prevSelectedPanel);
            }, 'image/png');
          };
          img.src = url;
        }).catch((err) => {
          console.error('Lỗi tạo ảnh:', err);
          // Nếu lỗi vẫn phải khôi phục selection
          setNodes((ns) => ns.map((n) => {
            const prev = prevNodeSelected.find((p) => p.id === n.id);
            return prev ? { ...n, selected: prev.selected } : n;
          }));
          setWires((ws) => ws.map((w) => {
            const prev = prevWireSelected.find((p) => p.id === w.id);
            return prev ? { ...w, selected: prev.selected } : w;
          }));
          setSelected(prevSelectedPanel);
        });
    });
  });
}, [nodes, wires, selected, tx, ty, zoom, setNodes, setWires, setSelected]);

  const nextId = useCallback((prefix) => {
    let i = 1;
    const existing = new Set(nodes.map((n) => n.id));
    while (existing.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  }, [nodes]);

  const addNodeAt = useCallback((comp, flowPos) => {
    const id = nextId(comp.refPrefix);
    const snappedX = Math.round(flowPos.x / GRID) * GRID;
    const snappedY = Math.round(flowPos.y / GRID) * GRID;
    setNodes((ns) => [...ns, {
      id,
      type: comp.type,
      position: { x: snappedX, y: snappedY },
      data: { reference: id, ...comp.defaultData },
      style: { width: 160, height: 100, background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
    }]);
  }, [nextId, setNodes]);

  const snappedGhostScreenPos = useCallback((clientX, clientY) => {
    const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
    return flowToScreenPosition({
      x: Math.round((flowPos.x - 80) / GRID) * GRID,
      y: Math.round((flowPos.y - 50) / GRID) * GRID,
    });
  }, [screenToFlowPosition, flowToScreenPosition]);

  const handleGlobalMouseMove = useCallback((e) => {
  lastMouse.current = { x: e.clientX, y: e.clientY };

  if (moveGroup) {
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const dx = Math.round(flowPos.x / GRID) * GRID - moveGroup.startX;
    const dy = Math.round(flowPos.y / GRID) * GRID - moveGroup.startY;

    if (moveGroup.items.length > 0) {
      setNodes((ns) => ns.map((n) => {
        const item = moveGroup.items.find((i) => i.id === n.id);
        if (item) {
          return { ...n, position: { x: item.initialX + dx, y: item.initialY + dy } };
        }
        return n;
      }));
    }

    if (moveGroup.wireItems && moveGroup.wireItems.length > 0) {
      setWires((ws) => ws.map((w) => {
        const item = moveGroup.wireItems.find((i) => i.id === w.id);
        if (!item) return w;
        const newPoints = item.initialPoints.map((p) => {
          if (p.nodeId) return p;
          return { x: p.x + dx, y: p.y + dy };
        });
        return { ...w, points: newPoints };
      }));
    }
  } else if (cursorNodeId) {   // ← đưa ra ngoài, làm nhánh song song với if (moveGroup)
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const snappedX = Math.round((flowPos.x - 80) / GRID) * GRID;
    const snappedY = Math.round((flowPos.y - 50) / GRID) * GRID;
    setNodes((ns) => ns.map((n) => n.id === cursorNodeId ? { ...n, position: { x: snappedX, y: snappedY } } : n));
  }
}, [moveGroup, cursorNodeId, screenToFlowPosition, setNodes, setWires]);

  // --- BẮT ĐẦU VÀ KẾT THÚC QUÉT KHỐI DÂY ĐIỆN ---
  const handleMouseDown = useCallback((e) => {
  if (e.button !== 0) return;
  if (!isWiringMode && !isMoveMode && !isCopyMode && !placingType) {
    selectionStart.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setIsBoxSelecting(true); // bắt đầu kéo -> tắt pointer-events của wire
  }
}, [isWiringMode, isMoveMode, isCopyMode, placingType, screenToFlowPosition]);

  const handleMouseUp = useCallback((e) => {
  if (e.button !== 0) return;
  if (selectionStart.current) {
    const endPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const minX = Math.min(selectionStart.current.x, endPos.x);
    const maxX = Math.max(selectionStart.current.x, endPos.x);
    const minY = Math.min(selectionStart.current.y, endPos.y);
    const maxY = Math.max(selectionStart.current.y, endPos.y);

    if (maxX - minX > 5 && maxY - minY > 5) {
      // --- Chọn NODE: bounding box của node phải nằm TRỌN trong vùng kéo ---
      setNodes((ns) => ns.map((n) => {
        const nx1 = n.position.x, ny1 = n.position.y;
        const nx2 = nx1 + 160, ny2 = ny1 + 100;
        const fullyInside = nx1 >= minX && nx2 <= maxX && ny1 >= minY && ny2 <= maxY;
        return { ...n, selected: fullyInside };
      }));

      // --- Chọn WIRE: TẤT CẢ các điểm của dây phải nằm trong vùng kéo ---
      setWires((ws) => ws.map((w) => {
        const pts = resolvePoints(w.points, nodes, w.lockedVertical); // thêm tham số
        const fullyInside = pts.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
        return { ...w, selected: fullyInside };
      }));
    } else {
      // Kéo quá nhỏ (gần như click) -> bỏ chọn hết, tránh chọn nhầm khi chỉ lỡ tay rê nhẹ
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
      setWires((ws) => ws.map((w) => ({ ...w, selected: false })));
    }
    selectionStart.current = null;
  }
    setIsBoxSelecting(false); // kết thúc kéo -> bật lại pointer-events của wire

}, [screenToFlowPosition, nodes, setWires, setNodes]);
  // ----------------------------------------------

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragGhostPos(snappedGhostScreenPos(e.clientX, e.clientY));
  }, [snappedGhostScreenPos]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragGhostPos(null);
    const type = e.dataTransfer.getData('application/reactflow');
    setDragType(null);
    const comp = COMPONENT_LIBRARY.find((c) => c.type === type);
    if (!comp) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNodeAt(comp, { x: flowPos.x - 80, y: flowPos.y - 50 });
  }, [screenToFlowPosition, addNodeAt]);

  const onDragLeave = useCallback(() => setDragGhostPos(null), []);

  useEffect(() => {
    if (!placingType) return;
    const onMove = (e) => setGhostScreenPos(snappedGhostScreenPos(e.clientX, e.clientY));
    const onClick = (e) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(placingType, { x: flowPos.x - 80, y: flowPos.y - 50 });
      setPlacingType(null);
      setGhostScreenPos(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setPlacingType(null); setGhostScreenPos(null); }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [placingType, screenToFlowPosition, addNodeAt, snappedGhostScreenPos]);

  // --- NÂNG CẤP XÓA: HỖ TRỢ XÓA NHIỀU DÂY ĐIỆN CÙNG LÚC ---
  const deleteSelected = useCallback(() => {
    const activeNodes = nodes.filter((n) => n.selected).map((n) => n.id);
    const activeWires = wires.filter((w) => w.selected).map((w) => w.id); // Lấy các dây đang bôi đen

    setNodes((ns) => ns.filter((n) => !activeNodes.includes(n.id) && !(selected?.kind === 'node' && selected.id === n.id)));
    
    setWires((ws) => ws.filter((w) => {
      if (activeWires.includes(w.id)) return false; // Xóa dây quét khối
      if (selected?.kind === 'wire' && selected.id === w.id) return false; // Xóa dây click thủ công
      if (w.points.some((p) => activeNodes.includes(p.nodeId) || (selected?.kind === 'node' && selected.id === p.nodeId))) return false;
      return true;
    }));
    
    setSelected(null);
  }, [nodes, wires, selected, setNodes, setWires]);
  // -------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const activeNodes = nodes.filter((n) => n.selected);
      const activeWires = wires.filter((w) => w.selected);
      
      if (e.key === 'r' || e.key === 'R') {
        const targetIds = moveGroup ? moveGroup.items.map((i) => i.id) : activeNodes.map((n) => n.id);
        if (targetIds.length === 0 && selected?.kind === 'node') targetIds.push(selected.id);
        
        if (targetIds.length > 0) {
          if (e.ctrlKey) {
            e.preventDefault(); 
            setNodes((ns) => ns.map((n) => targetIds.includes(n.id) ? { ...n, data: { ...n.data, flip: !n.data.flip } } : n));
          } else {
            setNodes((ns) => ns.map((n) => targetIds.includes(n.id) ? { ...n, data: { ...n.data, rot: ((n.data.rot || 0) + 90) % 360 } } : n));
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        if (isCopyMode && cursorNodeId) setNodes((ns) => ns.filter((n) => n.id !== cursorNodeId));
        setWires((ws) => ws.map((w) => {
        if (w.lockedVertical === undefined) return w;
        const { lockedVertical, ...rest } = w;
        return rest;
      }));
        setMoveGroup(null);
        setCursorNodeId(null);
        setIsMoveMode(false);
        setIsCopyMode(false);
        setIsWiringMode(false);
        setQuickAddOpen(false);
        return;
      }

      if (moveGroup || cursorNodeId) return;

      if (e.key === 'm' || e.key === 'M') {
        const targetNodes = activeNodes.length > 0
        ? activeNodes
        : (selected?.kind === 'node' ? [nodes.find((n) => n.id === selected.id)].filter(Boolean) : []);

        const targetWires = activeWires.length > 0
        ? activeWires
        : (selected?.kind === 'wire' ? [wires.find((w) => w.id === selected.id)].filter(Boolean) : []);

        if (targetNodes.length > 0 || targetWires.length > 0) {
          const flowPos = screenToFlowPosition(lastMouse.current);
          const targetNodeIds = targetNodes.map((n) => n.id);

          // Khóa hướng cho: (a) các dây được chọn để move trực tiếp, VÀ (b) các dây có 1 đầu gắn vào node đang move
          setWires((ws) => ws.map((w) => {
            if (w.points.length !== 2) return w;

            const isDirectlySelected = targetWires.some((tw) => tw.id === w.id);
            const isConnectedToMovingNode = w.points.some((p) => p.nodeId && targetNodeIds.includes(p.nodeId));

            if (!isDirectlySelected && !isConnectedToMovingNode) return w;

            const lockedVertical = Math.abs(w.points[0].x - w.points[1].x) < Math.abs(w.points[0].y - w.points[1].y);
            return { ...w, lockedVertical };
          }));

          setMoveGroup({
            startX: Math.round(flowPos.x / GRID) * GRID,
            startY: Math.round(flowPos.y / GRID) * GRID,
            items: targetNodes.map((n) => ({ id: n.id, initialX: n.position.x, initialY: n.position.y })),
            wireItems: targetWires.map((w) => {
              const allAnchored = w.points.every((p) => p.nodeId);
              // Nếu TẤT CẢ điểm đều bị neo -> gỡ neo (bỏ nodeId/portId) để có thể move tự do
              const initialPoints = allAnchored
                ? w.points.map((p) => ({ x: p.x, y: p.y })) // bỏ nodeId, portId
                : w.points.map((p) => ({ ...p }));
              return {
                id: w.id,
                initialPoints,
              };
            }),
          });
          setIsMoveMode(true);
        } else {
          setIsMoveMode(true);
        }
  setIsCopyMode(false); setIsWiringMode(false); setSelected(null);
}
      else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey) { setIsCopyMode(true); setIsMoveMode(false); setIsWiringMode(false); setSelected(null); }
      else if (e.key === 'w' || e.key === 'W') { setIsWiringMode(true); setIsMoveMode(false); setIsCopyMode(false); setSelected(null); }
      else if (e.key === 'i' || e.key === 'I') { setQuickAddOpen(true); setSelected(null); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isWiringMode && !placingType && (activeNodes.length > 0 || activeWires.length > 0 || selected)) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWiringMode, isMoveMode, isCopyMode, placingType, selected, moveGroup, cursorNodeId, nodes, wires, deleteSelected, setNodes, screenToFlowPosition]);

  useEffect(() => {
  const forceDropOnClick = (e) => {
    if ((moveGroup || cursorNodeId) && e.button === 0) {
      // Xóa cờ lockedVertical trên TẤT CẢ dây trước khi rời move mode
      setWires((ws) => ws.map((w) => {
        if (w.lockedVertical === undefined) return w;
        const { lockedVertical, ...rest } = w;
        return rest;
      }));
      setMoveGroup(null);
      setCursorNodeId(null);
      setIsMoveMode(false);
      setIsCopyMode(false);
    }
  };
  window.addEventListener('mousedown', forceDropOnClick, { capture: true });
  return () => window.removeEventListener('mousedown', forceDropOnClick, { capture: true });
}, [moveGroup, cursorNodeId]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#f4f4f4', display: 'flex' }}>
      <ComponentPalette onComponentDragStart={(type) => setDragType(type)} />

      <div 
        ref={reactFlowWrapper} 
        onMouseMove={handleGlobalMouseMove}
        
        onContextMenu={(e) => {
          e.preventDefault();
          const hasSelection = nodes.some(n => n.selected) || wires.some(w => w.selected);
          if (hasSelection) setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{ position: 'relative', flex: 1, height: '100%' }}
      >
        {contextMenu && (
          <div
            id="context-menu" 
            style={{
              position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 100,
              background: '#fff', border: '1px solid #ddd', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '4px 0', minWidth: 160,
              fontFamily: 'sans-serif', fontSize: 13, color: '#333'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{ padding: '8px 16px', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f0f6ff'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                handleCopyImage();
                setContextMenu(null);
              }}
            >
              📋 Copy as Image (Transparent)
            </div>
          </div>
        )}
        
        <div 
          id="ui-overlay" 
          style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
            background: (isWiringMode || isMoveMode || isCopyMode) ? '#ff4d4f' : '#fff', 
            color: (isWiringMode || isMoveMode || isCopyMode) ? '#fff' : '#000',
            padding: '8px 16px', borderRadius: 8, boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: 13, whiteSpace: 'nowrap'
          }}>
          {isWiringMode && 'Đang NỐI DÂY (W) — Click để vẽ, đúp click kết thúc'}
          {isMoveMode && (moveGroup ? `Đang DI CHUYỂN ${moveGroup.items.length} linh kiện — R xoay, Ctrl+R lật. Click thả` : 'Chế độ MOVE (M) — Click 1 linh kiện để nhấc lên')}
          {isCopyMode && (cursorNodeId ? 'Đang SAO CHÉP — R xoay, Ctrl+R lật. Click thả' : 'Chế độ COPY (C) — Click 1 linh kiện để nhân bản')}
          {placingType && `Đang đặt ${placingType.label} (I) — Click thả, Esc hủy`}
          {!isWiringMode && !isMoveMode && !isCopyMode && !placingType && 'Chế độ: BÌNH THƯỜNG (Sẵn sàng chọn)'}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          
          nodesDraggable={false} 
          panOnDrag={[1, 2]} 
          selectionMode="partial" 

          elementsSelectable={!isWiringMode && !placingType && !isMoveMode && !isCopyMode}
          selectionOnDrag={!isWiringMode && !placingType && !isMoveMode && !isCopyMode}     
          
          selectNodesOnDrag={false}
          onSelectionStart={handleMouseDown}
          onSelectionEnd={handleMouseUp}
          
          onNodeClick={(_, node) => {
            if (moveGroup || cursorNodeId) {
              setMoveGroup(null);
              setCursorNodeId(null); 
              setIsMoveMode(false);
              setIsCopyMode(false);
              return;
            }

            if (isMoveMode) {
              const flowPos = screenToFlowPosition(lastMouse.current);
              setMoveGroup({
                startX: Math.round(flowPos.x / GRID) * GRID,
                startY: Math.round(flowPos.y / GRID) * GRID,
                items: [{ id: node.id, initialX: node.position.x, initialY: node.position.y }]
              });
            } else if (isCopyMode) {
              const prefix = node.data.reference.replace(/[0-9]/g, '') || 'U';
              const newId = nextId(prefix);
              const newNode = { ...node, id: newId, data: { ...node.data, reference: newId }, position: { ...node.position }, selected: false };
              setNodes((ns) => [...ns, newNode]);
              setCursorNodeId(newId); 
            } else if (!isWiringMode && !placingType) {
              setSelected({ kind: 'node', id: node.id });
              // Click vào Node thì xóa bôi đen của dây điện
              setWires(ws => ws.map(w => ({ ...w, selected: false }))); 
            }
          }}
          onPaneClick={() => {
            if (moveGroup || cursorNodeId) {
              setMoveGroup(null);
              setCursorNodeId(null); 
              setIsMoveMode(false);
              setIsCopyMode(false);
            } else if (!isWiringMode && !placingType) {
              setSelected(null);
              // Click ra nền trống thì xóa bôi đen của dây điện
              setWires(ws => ws.map(w => ({ ...w, selected: false }))); 
            }
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          snapToGrid
          snapGrid={[GRID, GRID]}
          fitView
        >
          <Background gap={GRID} color="#ddd" size={2} />
          <Controls />
        </ReactFlow>

        <div style={{ pointerEvents: isWiringMode ? 'auto' : 'none' }}>
            <WiringLayer 
                isWiringMode={isWiringMode} 
                isBoxSelecting={isBoxSelecting}   
                nodes={nodes} 
                wires={wires} 
                setWires={setWires} 
                selected={selected} 
                setSelected={setSelected} 

            />
        </div>

        <PropertyPanel selected={selected} nodes={nodes} setNodes={setNodes} wires={wires} setWires={setWires} onDelete={deleteSelected} />

        {quickAddOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.15)' }} onClick={() => setQuickAddOpen(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <QuickAddMenu onPick={(comp) => { setQuickAddOpen(false); setPlacingType(comp); setGhostScreenPos(null); }} />
            </div>
          </div>
        )}

        {placingType && ghostScreenPos && (
          <div style={{ position: 'fixed', left: ghostScreenPos.x, top: ghostScreenPos.y, transform: `scale(${zoom})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: 48, opacity: 0.6 }}>
            <GhostIcon type={placingType.type} />
          </div>
        )}

        {dragGhostPos && (
          <div style={{ position: 'fixed', left: dragGhostPos.x, top: dragGhostPos.y, transform: `scale(${zoom})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: 48, opacity: 0.6 }}>
            <GhostIcon type={dragType || 'nmos'} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}