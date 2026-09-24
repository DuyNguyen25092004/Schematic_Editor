import { GRID, SNAP_RADIUS, MID_WIRE_SNAP_RADIUS, getPorts } from '../constants';
import { toGridUnit } from '../geometry/grid';
import { getTransformedPort } from '../geometry/ports';
import { resolvePoints, resolveWire } from '../routing/resolveWire';


// Thêm tham số wires vào hàm snapPoint
export function snapPoint(p, nodes, wires = []) {
  let best = null;
  let bestDist = SNAP_RADIUS;

  // 1. Ưu tiên 1: Snap vào chân linh kiện (Ports)
  for (const n of nodes) {
    for (const port of getPorts(n.type)) {
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

    // 1.5. Snap vào đầu mút của wire có sẵn — CHỈ khi đầu mút đó gắn thật vào
  // port (nodeId) thì mới dùng bán kính rộng (SNAP_RADIUS); còn đầu mút chỉ
  // là điểm giao/tự do (onWireId hoặc không gắn gì) thì dùng bán kính hẹp,
  // để tránh việc vẽ dây gần một điểm giao bị hút dính vào dây đó.
  let bestEndDist = SNAP_RADIUS;
  for (const w of wires) {
    const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);
    const ends = [pts[0], pts[pts.length - 1]];
    for (const end of ends) {
      const radius = end.nodeId ? SNAP_RADIUS : MID_WIRE_SNAP_RADIUS;
      const d = Math.hypot(end.x - p.x, end.y - p.y);
      if (d < radius && d < bestEndDist) {
        bestEndDist = d;
        best = {
          x: end.x, y: end.y,
          ...(end.nodeId ? { nodeId: end.nodeId, portId: end.portId }
            : end.onWireId ? { onWireId: end.onWireId } : {}),
        };
      }
    }
  }
  if (best) return best;

  // 2. Ưu tiên cuối: Snap vào giữa các đường dây (giữ nguyên như cũ)
    // 2. Ưu tiên cuối: Snap vào giữa các đường dây — bán kính NHỎ hơn hẳn để
  // vẽ dây song song sát bên không bị hút dính vào dây cũ ngoài ý muốn.
  if (wires) {
    let bestMidDist = MID_WIRE_SNAP_RADIUS;
    let midBest = null;
    for (const w of wires) {
      const pts = resolveWire(w.points, nodes, wires).path;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];

        let projX = p.x;
        let projY = p.y;

        if (Math.abs(a.x - b.x) < 1) {
          projX = a.x;
          projY = Math.max(Math.min(a.y, b.y), Math.min(p.y, Math.max(a.y, b.y)));
        } else {
          projY = a.y;
          projX = Math.max(Math.min(a.x, b.x), Math.min(p.x, Math.max(a.x, b.x)));
        }

        const d = Math.hypot(projX - p.x, projY - p.y);
        if (d < bestMidDist) {
          bestMidDist = d;
          const sx = Math.round(projX / GRID) * GRID;
          const sy = Math.round(projY / GRID) * GRID;
          midBest = { x: sx, y: sy, onWireId: w.id };
        }
      }
    }

    return midBest || { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID };
  }
}

// Sau khi move xong 1 wire, thử gắn lại các đầu mút tự do vào port gần nhất
// nếu nằm trong bán kính snap — để dây "hàn" lại vào terminal khi kéo về đúng vị trí.
export function attachFreeEndpointsToPorts(wires, nodes, wireAttachIds = null) {
  const findPort = (p) => {
    let best = null, bestDist = SNAP_RADIUS;
    for (const n of nodes) {
      for (const port of getPorts(n.type)) {
        const tPort = getTransformedPort(port, n);
        const px = Math.round(n.position.x) + tPort.x;
        const py = Math.round(n.position.y) + tPort.y;
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < bestDist) { bestDist = d; best = { x: px, y: py, nodeId: n.id, portId: port.id }; }
      }
    }
    return best;
  };

  // Điểm nằm GIỮA một đoạn của dây khác -> bind onWireId (đầu mút thì để mergeTouchingWires lo)
    // Điểm nằm TRÊN dây khác (kể cả góc gấp, trừ 2 đầu mút của dây chủ) -> bind onWireId
  const findWire = (p, selfId, movedIds) => {
    const px = toGridUnit(p.x), py = toGridUnit(p.y);
    for (const host of wires) {
      if (host.id === selfId) continue;
      // Cho phép nếu dây này HOẶC dây chủ vừa được kéo
      if (!(movedIds && (movedIds.has(selfId) || movedIds.has(host.id)))) continue;
      if (host.points.some((q) => q.onWireId === selfId)) continue; // tránh bind vòng
      const path = resolvePoints(host.points, nodes, undefined, wires, host.id, host.routed);
      const f = path[0], l = path[path.length - 1];
      if ((toGridUnit(f.x) === px && toGridUnit(f.y) === py) ||
          (toGridUnit(l.x) === px && toGridUnit(l.y) === py)) continue; // đầu mút: để mergeTouchingWires lo
      for (let i = 0; i < path.length - 1; i++) {
        const ax = toGridUnit(path[i].x), ay = toGridUnit(path[i].y);
        const bx = toGridUnit(path[i + 1].x), by = toGridUnit(path[i + 1].y);
        const onV = ax === bx && px === ax && py >= Math.min(ay, by) && py <= Math.max(ay, by);
        const onH = ay === by && py === ay && px >= Math.min(ax, bx) && px <= Math.max(ax, bx);
        if (onV || onH) return { x: px * GRID, y: py * GRID, onWireId: host.id };
      }
    }
    return null;
  };

  return wires.map((w) => {
    if (!w.points || w.points.length < 2) return w;
    const pts = w.points.map((p) => ({ ...p }));
    const last = pts.length - 1;

    [0, last].forEach((i) => {
      if (pts[i].nodeId || pts[i].onWireId) return;       // chỉ xử lý điểm thật sự tự do
      const found = findPort(pts[i]) || findWire(pts[i], w.id, wireAttachIds);
      if (found) pts[i] = found;
    });
    return { ...w, points: pts };
  });
}
