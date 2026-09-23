import { GRID, PORTS } from '../constants';
import { toGridUnit } from '../geometry/grid';
import { getTransformedPort, getTransformedPortDirection } from '../geometry/ports';
import { projectOnPath, orthogonalize, simplifyMiddle, removeSpikes } from '../geometry/pathUtils';
import { edgeKey, dirIndex, getObstacles, routeOrtho } from './router';



export function resolveWire(pts, nodes, allWires = [], depth = 0, selfId = null, avoidOverlap = true, forceRoute = false) {
  if (!pts || pts.length < 2) return { skeleton: pts, path: pts };

  const snap = (v) => Math.round(v / GRID) * GRID;
  const STUB = GRID * 3;

  const atNode = (p) => {
    if (!p.nodeId) return null;
    const n = nodes.find((n) => n.id === p.nodeId);
    const port = PORTS.find((pt) => pt.id === p.portId);
    if (!n || !port) return null;
    const tPort = getTransformedPort(port, n);
    return {
      x: snap(Math.round(n.position.x) + tPort.x),
      y: snap(Math.round(n.position.y) + tPort.y),
      node: n,
      portId: p.portId,
    };
  };

  const atWireSeg = (p) => {
    if (!p.onWireId || depth > 5) return null;
    const host = allWires.find((w) => w.id === p.onWireId);
    if (!host) return null;
    // Phải dùng ĐÚNG cờ routed của host để chiếu lên đúng đường đang hiển thị
    const h = resolveWire(host.points, nodes, allWires, depth + 1, host.id, false, host.routed);
    const q = projectOnPath(h.path, { x: p.x, y: p.y });
    return { x: snap(q.x), y: snap(q.y) };
  };

  const out = pts.map((p) => ({ ...p, x: snap(p.x), y: snap(p.y) }));
  const last = out.length - 1;

  const aPort = atNode(pts[0]);
  const bPort = atNode(pts[last]);
  const a = aPort || atWireSeg(pts[0]);
  const b = bPort || atWireSeg(pts[last]);

  if (!a && !b) return { skeleton: out, path: orthogonalize(out) };

  if (a) { out[0].x = a.x; out[0].y = a.y; }
  if (b) { out[last].x = b.x; out[last].y = b.y; }

  // === MẶC ĐỊNH: không route/né vật cản — dùng đúng các điểm đã vẽ, chỉ ghép vuông góc ===
  if (!forceRoute) {
    return { skeleton: out, path: removeSpikes(simplifyMiddle(orthogonalize(out))) };
  }
  // === Từ đây trở xuống CHỈ chạy khi forceRoute=true (rotate/flip) ===

  const obstacles = getObstacles(nodes);
  const stubOf = (port, p) => {
    const dir = getTransformedPortDirection(port.portId, port.node);
    return { dirIdx: dirIndex(dir), pt: { x: snap(p.x + dir.x * STUB), y: snap(p.y + dir.y * STUB) } };
  };

  // Tính occupied + occupiedPaths: dữ liệu các wire KHÁC (không tính chính nó),
  // để router vừa bị PHẠT khi trùng đoạn, vừa có sẵn hàng/cột lân cận trong lưới
  // Hanan để thực sự CÓ đường thay thế mà né sang — nếu không có bước này,
  // với dây chỉ 2 điểm đầu/cuối (không có điểm giữa) thì lưới chỉ có đúng 1 hàng,
  // router bị phạt nhưng không có lựa chọn nào khác nên vẫn phải đi trùng.
  let occupied = null;
  let occupiedPaths = null;
  if (avoidOverlap) {
    occupied = new Set();
    occupiedPaths = [];
    allWires.forEach((w) => {
      if (w.id === selfId) return;
      const p = resolveWire(w.points, nodes, allWires, depth + 1, w.id, false, false).path;
      occupiedPaths.push(p);
      for (let i = 0; i < p.length - 1; i++) {
        const ax = toGridUnit(p[i].x), ay = toGridUnit(p[i].y);
        const bx = toGridUnit(p[i + 1].x), by = toGridUnit(p[i + 1].y);
        occupied.add(edgeKey(ax, ay, bx, by));
      }
    });
  }

  const result = [out[0]];
  let curPt = out[0];
  let startDir = null, firstDirs = null;
  if (aPort) {
    const s = stubOf(aPort, a);
    result.push(s.pt);
    curPt = s.pt;
    startDir = s.dirIdx;
  }

  const targets = out.slice(1, last);
  let lastDirs = null;
  if (bPort) {
    const s = stubOf(bPort, b);
    targets.push(s.pt);
    lastDirs = [0, 1, 2, 3].filter((d) => d !== s.dirIdx);
  } else {
    targets.push(out[last]);
  }

  targets.forEach((t, k) => {
    const isFirst = k === 0;
    const isLast = k === targets.length - 1;
    const seg = routeOrtho(curPt, t, obstacles, {
      startDir: isFirst ? startDir : null,
      firstDirs: isFirst ? firstDirs : null,
      lastDirs: isLast ? lastDirs : null,
      occupied,
      occupiedPaths,
    });
    result.push(...seg.slice(1, -1), t);
    curPt = t;
  });

  if (bPort) result.push(out[last]);

  return { skeleton: out, path: removeSpikes(simplifyMiddle(result)) };
}

export function resolveSkeleton(pts, nodes, allWires = [], wireId = null, forceRoute = false) {
  return resolveWire(pts, nodes, allWires, 0, wireId, true, forceRoute).skeleton;
}

// Giữ nguyên chữ ký cũ để các chỗ khác không phải sửa
export function resolvePoints(pts, nodes, lockedVertical, allWires = [], wireId = null, forceRoute = false) {
  return resolveWire(pts, nodes, allWires, 0, wireId, true, forceRoute).path;
}
