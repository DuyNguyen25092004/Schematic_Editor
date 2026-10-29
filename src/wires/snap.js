import { GRID, SNAP_RADIUS, MID_WIRE_SNAP_RADIUS, getPorts } from '../constants';
import { toGridUnit } from '../geometry/grid';
import { getTransformedPort } from '../geometry/ports';
import { resolvePoints, resolveWire } from '../routing/resolveWire';


// Thêm tham số resolvedMap vào hàm snapPoint để tái sử dụng kết quả đã tính
export function snapPoint(p, nodes, wires = [], resolvedMap = null) {
  // 1. Tìm Port gần nhất trong bán kính SNAP_RADIUS
  let bestPort = null;
  let bestPortDist = SNAP_RADIUS;

  for (const n of nodes) {
    const extraH = Math.max(0, ((n.data?.inputs || 2) - 2) * 20);
    if (
      p.x < n.position.x - SNAP_RADIUS ||
      p.x > n.position.x + 160 + SNAP_RADIUS ||
      p.y < n.position.y - SNAP_RADIUS - extraH / 2 ||
      p.y > n.position.y + 100 + SNAP_RADIUS + extraH / 2
    ) {
      continue;
    }

    for (const port of getPorts(n.type, n.data)) {
      const tPort = getTransformedPort(port, n);
      const px = Math.round(n.position.x) + tPort.x;
      const py = Math.round(n.position.y) + tPort.y;
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < bestPortDist) {
        bestPortDist = d;
        bestPort = { x: px, y: py, nodeId: n.id, portId: port.id, d };
      }
    }
  }

  // 2. Tìm điểm chiếu lên thân các đoạn dây (Mid-wire candidates)
  let bestMid = null;
  let bestMidPerpDist = MID_WIRE_SNAP_RADIUS;
  let closestWirePerpDist = Infinity;

  if (wires && wires.length) {
    for (const w of wires) {
      if (!w.points || w.points.length < 2) continue;

      const pts = resolvedMap?.get(w.id) || resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);
      if (!pts || pts.length < 2) continue;

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];

        const segMinX = Math.min(a.x, b.x) - SNAP_RADIUS;
        const segMaxX = Math.max(a.x, b.x) + SNAP_RADIUS;
        const segMinY = Math.min(a.y, b.y) - SNAP_RADIUS;
        const segMaxY = Math.max(a.y, b.y) + SNAP_RADIUS;
        if (p.x < segMinX || p.x > segMaxX || p.y < segMinY || p.y > segMaxY) continue;

        let projX = p.x;
        let projY = p.y;
        if (Math.abs(a.x - b.x) < 1) {
          projX = a.x;
          projY = Math.max(Math.min(a.y, b.y), Math.min(p.y, Math.max(a.y, b.y)));
        } else {
          projY = a.y;
          projX = Math.max(Math.min(a.x, b.x), Math.min(p.x, Math.max(a.x, b.x)));
        }

        const perpDist = Math.hypot(projX - p.x, projY - p.y);
        if (perpDist < closestWirePerpDist) {
          closestWirePerpDist = perpDist;
        }

        if (perpDist < bestMidPerpDist) {
          const sx = Math.round(projX / GRID) * GRID;
          const sy = Math.round(projY / GRID) * GRID;

          // Loại trừ 2 đầu mút ngoài cùng của wire w:
          // Nếu (sx, sy) trùng với pts[0] hoặc pts[last] thì đây là đầu mút của dây (Endpoint),
          // KHÔNG PHẢI điểm giữa thân dây (Mid-wire), nên không gán onWireId tại đây.
          const isEndpointOfW =
            (sx === Math.round(pts[0].x / GRID) * GRID && sy === Math.round(pts[0].y / GRID) * GRID) ||
            (sx === Math.round(pts[pts.length - 1].x / GRID) * GRID && sy === Math.round(pts[pts.length - 1].y / GRID) * GRID);
          if (isEndpointOfW) continue;

          bestMidPerpDist = perpDist;
          const snapDist = Math.hypot(sx - p.x, sy - p.y);
          const isPortMatch = bestPort && bestPort.x === sx && bestPort.y === sy;

          bestMid = {
            x: sx,
            y: sy,
            onWireId: w.id,
            snapDist,
            isPortMatch: isPortMatch ? { nodeId: bestPort.nodeId, portId: bestPort.portId } : null,
          };
        }
      }
    }
  }

  // 3. Tìm đầu mút wire có sẵn (Wire Endpoints)
  let bestEnd = null;
  let bestEndDist = SNAP_RADIUS;
  for (const w of wires) {
    if (!w.points || w.points.length < 2) continue;

    const pts = resolvedMap?.get(w.id) || resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);
    if (!pts || pts.length < 2) continue;
    const ends = [pts[0], pts[pts.length - 1]];
    for (const end of ends) {
      const radius = SNAP_RADIUS;
      const d = Math.hypot(end.x - p.x, end.y - p.y);
      if (d < radius && d < bestEndDist) {
        bestEndDist = d;
        bestEnd = {
          x: end.x, y: end.y,
          d,
          ...(end.nodeId ? { nodeId: end.nodeId, portId: end.portId }
            : end.onWireId ? { onWireId: end.onWireId } : {}),
        };
      }
    }
  }

  // 4. PHÂN XỬ (Arbitration):
  // 4a. Nếu bestMid trùng với Port
  if (bestMid?.isPortMatch) {
    return { x: bestMid.x, y: bestMid.y, nodeId: bestMid.isPortMatch.nodeId, portId: bestMid.isPortMatch.portId };
  }

  // 4b. Ưu tiên Wire Endpoint nếu chuột gần đầu mút hơn hoặc bằng thân dây
  if (bestEnd && (!bestMid || bestEnd.d <= bestMid.snapDist)) {
    if (bestPort && bestPort.d < bestEnd.d) {
      return { x: bestPort.x, y: bestPort.y, nodeId: bestPort.nodeId, portId: bestPort.portId };
    }
    return {
      x: bestEnd.x, y: bestEnd.y,
      ...(bestEnd.nodeId ? { nodeId: bestEnd.nodeId, portId: bestEnd.portId }
        : bestEnd.onWireId ? { onWireId: bestEnd.onWireId } : {}),
    };
  }

  // 4c. Ưu tiên Port nếu chuột gần Port hơn thân dây lướt qua
  if (bestPort && (closestWirePerpDist === Infinity || bestPort.d <= closestWirePerpDist)) {
    return { x: bestPort.x, y: bestPort.y, nodeId: bestPort.nodeId, portId: bestPort.portId };
  }

  // 4d. Chuột nằm sát thân dây (T-junction / Mid-wire)
  if (bestMid) {
    if (!bestPort || bestMid.snapDist <= bestPort.d) {
      return { x: bestMid.x, y: bestMid.y, onWireId: bestMid.onWireId };
    }
  }

  // 4e. Fallback Port hoặc Wire Endpoint
  if (bestPort) {
    return { x: bestPort.x, y: bestPort.y, nodeId: bestPort.nodeId, portId: bestPort.portId };
  }
  if (bestEnd) {
    return {
      x: bestEnd.x, y: bestEnd.y,
      ...(bestEnd.nodeId ? { nodeId: bestEnd.nodeId, portId: bestEnd.portId }
        : bestEnd.onWireId ? { onWireId: bestEnd.onWireId } : {}),
    };
  }

  return { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID };
}

// Sau khi move xong 1 wire, thử gắn lại các đầu mút tự do vào port gần nhất
// nếu nằm trong bán kính snap — để dây "hàn" lại vào terminal khi kéo về đúng vị trí.
export function attachFreeEndpointsToPorts(wires, nodes, wireAttachIds = null) {
  const findPort = (p) => {
    let best = null, bestDist = SNAP_RADIUS;
    for (const n of nodes) {
      if (
        p.x < n.position.x - SNAP_RADIUS ||
        p.x > n.position.x + 160 + SNAP_RADIUS ||
        p.y < n.position.y - SNAP_RADIUS ||
        p.y > n.position.y + 100 + SNAP_RADIUS
      ) {
        continue;
      }
      for (const port of getPorts(n.type, n.data)) {
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
