

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

import { useCircuitSync } from './realtime/useCircuitSync';
import { getCircuitId } from './realtime/circuitId';

const CIRCUIT_ID = getCircuitId();

const nodeTypes = { nmos: NmosNode, pmos: PmosNode };
const GRID = 10;
const SNAP_RADIUS = 15;

const PORTS = [
  { id: 'gate',   x: 20, y: 50 },
  { id: 'drain',  x: 50, y: 30 },
  { id: 'source', x: 50, y: 70 },
];

// Bounding box thật của ký hiệu MOSFET trong hệ tọa độ flow (đã tính xoay + lật),
// khớp với vùng viền xanh khi chọn node — dùng để box-select cho đúng kích thước
// nhìn thấy, thay vì dùng cả khung 160x100 ẩn.
function getSymbolBBox(node) {
  const rot = node.data.rot || 0;
  const flip = node.data.flip || false;
  const cx = 40, cy = 50;
  // Khớp với vùng viền xanh: left:16,top:27,width:36,height:46
  const corners = [
    { x: 16, y: 27 }, { x: 52, y: 27 },
    { x: 52, y: 73 }, { x: 16, y: 73 },
  ];
  const angle = ((rot % 360) + 360) % 360;
  const transformed = corners.map(({ x, y }) => {
    let dx = x - cx, dy = y - cy;
    if (flip) dx = -dx;
    let rx = dx, ry = dy;
    if (angle === 90) { rx = -dy; ry = dx; }
    else if (angle === 180) { rx = -dx; ry = -dy; }
    else if (angle === 270) { rx = dy; ry = -dx; }
    return { x: cx + rx, y: cy + ry };
  });
  const xs = transformed.map((p) => p.x);
  const ys = transformed.map((p) => p.y);
  return {
    x1: node.position.x + Math.min(...xs),
    y1: node.position.y + Math.min(...ys),
    x2: node.position.x + Math.max(...xs),
    y2: node.position.y + Math.max(...ys),
  };
}

// Hướng "đi ra" tự nhiên của từng port, khớp với hình vẽ ký hiệu MOSFET (chưa xoay/lật):
// gate đi ra bên trái, drain đi lên trên, source đi xuống dưới.
const PORT_OUT_DIRECTION = {
  gate: { x: -1, y: 0 },
  drain: { x: 0, y: -1 },
  source: { x: 0, y: 1 },
};

// Xoay/lật hướng đi ra theo đúng rot/flip của node — dùng CHUNG logic xoay với getTransformedPort
// nhưng không có phép tịnh tiến (vì đây là vector hướng, không phải toạ độ điểm)
function getTransformedPortDirection(portId, node) {
  const dir = PORT_OUT_DIRECTION[portId];
  if (!dir) return { x: 0, y: 0 };
  const rot = node.data.rot || 0;
  const flip = node.data.flip || false;

  let dx = dir.x, dy = dir.y;
  if (flip) dx = -dx;

  const angle = (rot % 360 + 360) % 360;
  let rx = dx, ry = dy;
  if (angle === 90) { rx = -dy; ry = dx; }
  else if (angle === 180) { rx = -dx; ry = -dy; }
  else if (angle === 270) { rx = dy; ry = -dx; }

  return { x: rx, y: ry };
}

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

  // 1. Ưu tiên 1: Snap vào chân linh kiện (Ports)
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

  // 1.5. Ưu tiên mới: Snap CHÍNH XÁC vào đầu mút của các wire có sẵn
  // (tránh lệch tọa độ do phép chiếu, gây tính sai junction dot)
  for (const w of wires) {
    const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires);
    const ends = [pts[0], pts[pts.length - 1]];
    for (const end of ends) {
      const d = Math.hypot(end.x - p.x, end.y - p.y);
      if (d < bestDist) {
        bestDist = d;
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
  if (wires) {
      // 2. Ưu tiên cuối: Snap vào giữa các đường dây
      // 2. Ưu tiên cuối: Snap vào giữa các đường dây
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
        if (d < bestDist) {
          bestDist = d;
          const sx = Math.round(projX / GRID) * GRID;
          const sy = Math.round(projY / GRID) * GRID;
          best = {
            x: sx,
            y: sy,
            onWireId: w.id,
            // đo ratio trên chính đường đã định tuyến, tại đúng điểm đã snap
            // -> resolve lại sẽ ra đúng điểm này
            
          };
        }
      }
    }

    return best || { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID };
  }
}


// Tính tổng chiều dài polyline và vị trí (arc-length ratio 0..1) của 1 điểm i, tỷ lệ t trên đoạn i
function arcLengthRatio(pts, segIndex, t) {
  let total = 0;
  const segLens = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    total += len;
  }
  if (total === 0) return 0;
  let acc = 0;
  for (let i = 0; i < segIndex; i++) acc += segLens[i];
  acc += segLens[segIndex] * t;
  return acc / total;
}
// Chiếu điểm p lên polyline: trả về điểm gần nhất + tỉ lệ chiều dài (0..1) của điểm đó
function projectOnPath(pts, p) {
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lens.push(l);
    total += l;
  }
  let best = { d: Infinity, x: pts[0].x, y: pts[0].y, along: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + dx * t, y = a.y + dy * t;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < best.d - 1e-6) best = { d, x, y, along: acc + lens[i] * t };
    acc += lens[i];
  }
  return { x: best.x, y: best.y, ratio: total ? best.along / total : 0 };
}
// Ngược lại: từ ratio (0..1), tìm điểm thực tế trên polyline hiện tại — bất kể polyline
// đã đổi số đoạn/hình dạng do rotate hay chưa, luôn tìm đúng vị trí tương ứng theo TỈ LỆ chiều dài
function pointAtArcRatio(pts, ratio) {
  const segLens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(len);
    total += len;
  }
  if (total === 0) return { x: pts[0].x, y: pts[0].y };
  let target = ratio * total;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= target || i === segLens.length - 1) {
      const localT = segLens[i] > 0 ? (target - acc) / segLens[i] : 0;
      const a = pts[i], b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT };
    }
    acc += segLens[i];
  }
  return pts[pts.length - 1];
}

// Sau khi move xong 1 wire, thử gắn lại các đầu mút tự do vào port gần nhất
// nếu nằm trong bán kính snap — để dây "hàn" lại vào terminal khi kéo về đúng vị trí.
function attachFreeEndpointsToPorts(wires, nodes) {
  const findPort = (p) => {
    let best = null, bestDist = SNAP_RADIUS;
    for (const n of nodes) {
      for (const port of PORTS) {
        const tPort = getTransformedPort(port, n);
        const px = Math.round(n.position.x) + tPort.x;
        const py = Math.round(n.position.y) + tPort.y;
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < bestDist) { bestDist = d; best = { x: px, y: py, nodeId: n.id, portId: port.id }; }
      }
    }
    return best;
  };

  return wires.map((w) => {
    if (!w.points || w.points.length < 2) return w;
    const pts = w.points.map((p) => ({ ...p }));
    const last = pts.length - 1;

    // CHỈ gắn port cho điểm THỰC SỰ tự do — không nodeId VÀ không onWireId
    if (!pts[0].nodeId && !pts[0].onWireId) {
      const found = findPort(pts[0]);
      if (found) pts[0] = found;
    }
    if (!pts[last].nodeId && !pts[last].onWireId) {
      const found = findPort(pts[last]);
      if (found) pts[last] = found;
    }
    return { ...w, points: pts };
  });
}

// Hàm quy đổi toạ độ về đơn vị lưới nguyên — DÙNG CHUNG cho mọi nơi so sánh điểm
function toGridUnit(v) {
  return Math.round(v / GRID);
}

// So sánh 2 điểm bằng số nguyên lưới tuyệt đối — không còn phụ thuộc ngưỡng khoảng cách nữa
function sameGridPoint(a, b) {
  return toGridUnit(a.x) === toGridUnit(b.x) && toGridUnit(a.y) === toGridUnit(b.y);
}

function getJunctionDots(wires, nodes) {
  const resolved = wires.map((w) => resolvePoints(w.points, nodes, w.lockedVertical, wires));
  const u = toGridUnit; // dùng chung hàm quy đổi lưới với mergeTouchingWires

  const candidates = [];
  resolved.forEach((pts) => {
    pts.forEach((p) => {
      if (p.nodeId) return; // bỏ qua điểm bind cứng vào chân linh kiện — không tính là junction
      candidates.push({ x: u(p.x), y: u(p.y) });
    });
  });
  const points = [];
  candidates.forEach((c) => {
    if (!points.some((p) => p.x === c.x && p.y === c.y)) points.push(c);
  });

  const dirKey = (dx, dy) => {
    if (dx === 0 && dy === 0) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'R' : 'L';
    return dy > 0 ? 'D' : 'U';
  };

  const dots = [];
  points.forEach((P) => {
    const directions = new Set();

    resolved.forEach((pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = u(pts[i].x), ay = u(pts[i].y);
        const bx = u(pts[i + 1].x), by = u(pts[i + 1].y);
        if (ax === bx && ay === by) continue;

        const isA = ax === P.x && ay === P.y;
        const isB = bx === P.x && by === P.y;

        if (isA) {
          const d = dirKey(bx - ax, by - ay);
          if (d) directions.add(d);
        } else if (isB) {
          const d = dirKey(ax - bx, ay - by);
          if (d) directions.add(d);
        } else {
          const onVertical = ax === bx && P.x === ax &&
            P.y > Math.min(ay, by) && P.y < Math.max(ay, by);
          const onHorizontal = ay === by && P.y === ay &&
            P.x > Math.min(ax, bx) && P.x < Math.max(ax, bx);

          if (onVertical) { directions.add('U'); directions.add('D'); }
          if (onHorizontal) { directions.add('L'); directions.add('R'); }
        }
      }
    });

    if (directions.size >= 3) dots.push({ x: P.x * GRID, y: P.y * GRID });
  });

  return dots;
}

function bind(pt, src) {
  if (src && src.nodeId) {
    return { x: pt.x, y: pt.y, nodeId: src.nodeId, portId: src.portId };
  }
  if (src && src.onWireId !== undefined) {
    return { x: pt.x, y: pt.y, onWireId: src.onWireId };
  }
  return { x: pt.x, y: pt.y };
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

// ============ ROUTER TRỰC GIAO NÉ LINH KIỆN ============
const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]; // R, L, D, U
const OPP = [1, 0, 3, 2];
const BEND_COST = GRID * 3;      // phạt mỗi lần rẽ -> ưu tiên đường ít gấp khúc
const OBSTACLE_MARGIN = GRID;    // khoảng hở giữa dây và thân linh kiện
const dirIndex = (d) => DIRS.findIndex((v) => v.x === d.x && v.y === d.y);

// Vật cản = bbox thật của ký hiệu, nới lề rồi làm tròn RA NGOÀI theo lưới
function getObstacles(nodes) {
  return nodes.map((n) => {
    const b = getSymbolBBox(n);
    return {
      x1: Math.floor((b.x1 - OBSTACLE_MARGIN) / GRID) * GRID,
      y1: Math.floor((b.y1 - OBSTACLE_MARGIN) / GRID) * GRID,
      x2: Math.ceil((b.x2 + OBSTACLE_MARGIN) / GRID) * GRID,
      y2: Math.ceil((b.y2 + OBSTACLE_MARGIN) / GRID) * GRID,
    };
  });
}

const insideRect = (p, r) => p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2;

// Đoạn trực giao có cắt phần LÕI của hình chữ nhật không (chạm viền thì vẫn cho phép)
function segHitsRect(a, b, r) {
  if (a.y === b.y) {
    if (!(a.y > r.y1 && a.y < r.y2)) return false;
    return Math.min(Math.max(a.x, b.x), r.x2) > Math.max(Math.min(a.x, b.x), r.x1);
  }
  if (a.x === b.x) {
    if (!(a.x > r.x1 && a.x < r.x2)) return false;
    return Math.min(Math.max(a.y, b.y), r.y2) > Math.max(Math.min(a.y, b.y), r.y1);
  }
  return true;
}

// Dijkstra trên "lưới Hanan" (các toạ độ x/y của điểm đầu, điểm cuối và viền vật cản).
// startDir : hướng đang đi khi rời start (vd: hướng stub) -> cấm quay đầu 180°
// firstDirs: các hướng được phép cho bước đi đầu tiên (null = tự do)
// lastDirs : các hướng được phép khi đi vào end (null = tự do)
function routeOrtho(start, end, obstacles, { startDir = null, firstDirs = null, lastDirs = null } = {}) {
  if (start.x === end.x && start.y === end.y) return [start, end];

  const obs = obstacles.filter((r) => !insideRect(start, r) && !insideRect(end, r));
  const xs = new Set([start.x, end.x]);
  const ys = new Set([start.y, end.y]);
  obs.forEach((r) => { xs.add(r.x1); xs.add(r.x2); ys.add(r.y1); ys.add(r.y2); });
  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const Ny = Y.length;
  const si = X.indexOf(start.x), sj = Y.indexOf(start.y);
  const ei = X.indexOf(end.x),   ej = Y.indexOf(end.y);

  const key = (i, j, d) => (i * Ny + j) * 5 + d; // d = 4: chưa có hướng
  const s0 = startDir === null ? 4 : startDir;
  const dist = new Map([[key(si, sj, s0), 0]]);
  const prev = new Map();
  const open = [{ i: si, j: sj, d: s0, c: 0, first: true }];
  let goalKey;

  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].c < open[bi].c) bi = k;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.i, cur.j, cur.d);
    if (cur.c > (dist.get(ck) ?? Infinity)) continue;

    if (cur.i === ei && cur.j === ej && (!lastDirs || lastDirs.includes(cur.d))) { goalKey = ck; break; }

    for (let nd = 0; nd < 4; nd++) {
      if (cur.first && firstDirs && !firstDirs.includes(nd)) continue;
      if (cur.d !== 4 && nd === OPP[cur.d]) continue; // không quay đầu
      const ni = cur.i + DIRS[nd].x, nj = cur.j + DIRS[nd].y;
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Ny) continue;
      const a = { x: X[cur.i], y: Y[cur.j] }, b = { x: X[ni], y: Y[nj] };
      if (obs.some((r) => segHitsRect(a, b, r))) continue;

      const nc = cur.c + Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
               + (cur.d !== 4 && cur.d !== nd ? BEND_COST : 0);
      const nk = key(ni, nj, nd);
      if (nc < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nc);
        prev.set(nk, ck);
        open.push({ i: ni, j: nj, d: nd, c: nc, first: false });
      }
    }
  }

  if (goalKey === undefined) return [start, { x: end.x, y: start.y }, end]; // fallback: chữ L

  const path = [];
  for (let k = goalKey; k !== undefined; k = prev.get(k)) {
    const ij = Math.floor(k / 5);
    path.push({ x: X[Math.floor(ij / Ny)], y: Y[ij % Ny] });
  }
  return path.reverse();
}

// Bỏ điểm trùng / thẳng hàng ở GIỮA, luôn giữ nguyên 2 đầu mút (còn nodeId/portId...)
function simplifyMiddle(pts) {
  const res = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const prev = res[res.length - 1];
    const isLast = i === pts.length - 1;
    if (prev.x === p.x && prev.y === p.y) {
      if (isLast) { if (res.length > 1) res.pop(); res.push(p); }
      continue;
    }
    if (!isLast) {
      const next = pts[i + 1];
      if ((prev.x === p.x && p.x === next.x) || (prev.y === p.y && p.y === next.y)) continue;
    }
    res.push(p);
  }
  return res;
}

function resolveWire(pts, nodes, allWires = [], depth = 0) {
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

  // Điểm T: lấy vị trí theo tỉ lệ trên KHUNG XƯƠNG của dây chủ,
  // rồi chiếu vào đường đã định tuyến để chắc chắn nằm trên dây chủ
    // Điểm T: lấy theo tỉ lệ chiều dài trên ĐƯỜNG ĐÃ ĐỊNH TUYẾN của dây chủ
  const atWireSeg = (p) => {
    if (!p.onWireId || depth > 5) return null;
    const host = allWires.find((w) => w.id === p.onWireId);
    if (!host) return null;
    const h = resolveWire(host.points, nodes, allWires, depth + 1);
    const q = projectOnPath(h.path, { x: p.x, y: p.y });
    return { x: snap(q.x), y: snap(q.y) };
  };

  const out = pts.map((p) => ({ ...p, x: snap(p.x), y: snap(p.y) }));
  const last = out.length - 1;

  const aPort = atNode(pts[0]);
  const bPort = atNode(pts[last]);
  const a = aPort || atWireSeg(pts[0]);
  const b = bPort || atWireSeg(pts[last]);
  if (!a && !b) return { skeleton: out, path: out };

  if (a) { out[0].x = a.x; out[0].y = a.y; }
  if (b) { out[last].x = b.x; out[last].y = b.y; }

  const obstacles = getObstacles(nodes);
  const stubOf = (port, p) => {
    const dir = getTransformedPortDirection(port.portId, port.node);
    return { dirIdx: dirIndex(dir), pt: { x: snap(p.x + dir.x * STUB), y: snap(p.y + dir.y * STUB) } };
  };

  const result = [out[0]];
  let curPt = out[0];
  let startDir = null, firstDirs = null;
  if (aPort) {
    const s = stubOf(aPort, a);
    result.push(s.pt);
    curPt = s.pt;
    startDir = s.dirIdx;
  } else if (a) {
    // dùng out (đã cập nhật vị trí điểm T) thay vì pts gốc có thể đã cũ
    const vertical = Math.abs(out[0].x - out[1].x) < Math.abs(out[0].y - out[1].y);
    firstDirs = vertical ? [2, 3] : [0, 1];
  }

// Cả 2 đầu đã bám vào port/dây khác -> tự định tuyến, bỏ điểm trung gian cũ
  const targets = (a && b) ? [] : out.slice(1, last);  let lastDirs = null;
  if (bPort) {
    const s = stubOf(bPort, b);
    targets.push(s.pt);
    lastDirs = [0, 1, 2, 3].filter((d) => d !== s.dirIdx);
  } else {
    targets.push(out[last]);
    if (b) {
      const vertical = Math.abs(out[last].x - out[last - 1].x) < Math.abs(out[last].y - out[last - 1].y);
      lastDirs = vertical ? [2, 3] : [0, 1];
    }
  }

  targets.forEach((t, k) => {
    const isFirst = k === 0;
    const isLast = k === targets.length - 1;
    const seg = routeOrtho(curPt, t, obstacles, {
      startDir: isFirst ? startDir : null,
      firstDirs: isFirst ? firstDirs : null,
      lastDirs: isLast ? lastDirs : null,
    });
    result.push(...seg.slice(1, -1), t);
    curPt = t;
  });

  if (bPort) result.push(out[last]);

  return { skeleton: out, path: simplifyMiddle(result) };
}

// Giữ nguyên chữ ký cũ để các chỗ khác không phải sửa
function resolvePoints(pts, nodes, lockedVertical, allWires = []) {
  return resolveWire(pts, nodes, allWires).path;
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
// Chuẩn hoá: gộp mọi cặp wire có đầu mút tự do trùng nhau thành 1 wire liền mạch.
// Chạy lặp cho tới khi không còn cặp nào để gộp — đảm bảo dù bug xảy ra ở đâu,
// trạng thái wires luôn "sạch" trước khi vẽ junction dot.
// Trong mergeTouchingWires: thay isNear(...) bằng sameGridPoint(...)
function mergeTouchingWires(wires, nodes) {
  let list = wires.map((w) => ({ ...w }));
  let mergedAny = true;

  while (mergedAny) {
    mergedAny = false;

    outer:
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const A = list[i];
        const B = list[j];

        const ptsA = resolvePoints(A.points, nodes, A.lockedVertical, wires);
        const ptsB = resolvePoints(B.points, nodes, B.lockedVertical, wires);
        const aFirst = ptsA[0], aLast = ptsA[ptsA.length - 1];
        const bFirst = ptsB[0], bLast = ptsB[ptsB.length - 1];

        // Chỉ coi là "tự do, có thể gộp" khi KHÔNG bind port VÀ KHÔNG bind dây khác
        const freeA1 = !A.points[0].nodeId && !A.points[0].onWireId;
        const freeALast = !A.points[A.points.length - 1].nodeId && !A.points[A.points.length - 1].onWireId;
        const freeB1 = !B.points[0].nodeId && !B.points[0].onWireId;
        const freeBLast = !B.points[B.points.length - 1].nodeId && !B.points[B.points.length - 1].onWireId;

        let mergedPoints = null;

        if (freeALast && freeB1 && sameGridPoint(aLast, bFirst)) {
          mergedPoints = [...A.points.slice(0, -1), ...B.points];
        } else if (freeALast && freeBLast && sameGridPoint(aLast, bLast)) {
          mergedPoints = [...A.points.slice(0, -1), ...[...B.points].reverse()];
        } else if (freeA1 && freeBLast && sameGridPoint(aFirst, bLast)) {
          mergedPoints = [...B.points.slice(0, -1), ...A.points];
        } else if (freeA1 && freeB1 && sameGridPoint(aFirst, bFirst)) {
          mergedPoints = [...[...B.points].reverse().slice(0, -1), ...A.points];
        }

        if (mergedPoints) {
          const merged = { ...A, points: mergedPoints, lockedVertical: undefined, net: A.net || B.net };
          list = list
            .filter((_, idx) => idx !== i && idx !== j)
            .map((w) => ({
              ...w,
              points: w.points.map((p) => (p.onWireId === B.id ? { ...p, onWireId: A.id } : p)),
            }));
          list.push(merged);
          mergedAny = true;
          break outer;
        }
      }
    }
  }

  return list;
}

function findExtendableWire(point, wires, nodes) {
  for (const w of wires) {
    const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const freeFirst = !w.points[0].nodeId && !w.points[0].onWireId;
    const freeLast = !w.points[w.points.length - 1].nodeId && !w.points[w.points.length - 1].onWireId;
    if (freeFirst && sameGridPoint(first, point)) return { wireId: w.id, atStart: true };
    if (freeLast && sameGridPoint(last, point)) return { wireId: w.id, atStart: false };
  }
  return null;
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
    const p = toFlow(e); // p có thể có onWireId/arcRatio từ snapPoint
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setDraft((prev) => {
        if (!prev) return [p]; // OK — p giữ nguyên object đầy đủ field từ snapPoint
        const last = prev[prev.length - 1];
        if (Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) return prev;
        return [...prev, ...orthoPath(last, p).slice(1)]; // orthoPath giờ dùng bind() đã sửa — giữ được onWireId
      });
    }, 220);
  };
    const draftRef = useRef(null);
    useEffect(() => { draftRef.current = draft; }, [draft]);
    
    const handleDoubleClick = (e) => {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      const prev = draftRef.current;
      if (!prev) return;
      const p = toFlow(e);
      const last = prev[prev.length - 1];
      const pts = (Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1)
        ? prev
        : [...prev, ...orthoPath(last, p).slice(1)];
      if (pts.length >= 2) {
        const id = `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setWires((ws) => [...ws, { id, points: pts }]);
      }
      setDraft(null);
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
            const pts = pointsToPolyline(resolvePoints(w.points, nodes, w.lockedVertical, wires)); // thêm tham số
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
              r={cursor.portId || cursor.onWireId ? 4 : 2.5}
              fill={cursor.portId ? '#ff4d4f' : (cursor.onWireId ? '#000' : '#888')} 
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
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  
  const [edges, , onEdgesChange] = useEdgesState([]);

  // ĐỔI: useState đổi tên thành setWiresRaw (nội bộ), rồi định nghĩa setWires bọc bên dưới
  const [wires, setWiresRaw] = useState([]);

  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const setWires = useCallback((updater) => {
    setWiresRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return mergeTouchingWires(next, nodesRef.current);
    });
  }, []);
  
  const [isWiringMode, setIsWiringMode] = useState(false);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  
  const [moveGroup, setMoveGroup] = useState(null); 
  const [cursorNodeId, setCursorNodeId] = useState(null); 
  
  useCircuitSync({
    circuitId: CIRCUIT_ID,
    nodes, wires, setNodes, setWiresRaw,
    isEditingLocally: !!(moveGroup || cursorNodeId),
    seedNodes: initialNodes,
  });

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
     const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires);
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
      const groupIds = new Set(moveGroup.wireItems.map((i) => i.id));
      setWires((ws) => ws.map((w) => {
        const item = moveGroup.wireItems.find((i) => i.id === w.id);
        if (!item) return w;
        const newPoints = item.initialPoints.map((p) => {
          if (p.nodeId) return p;
          if (p.onWireId) {
            return groupIds.has(p.onWireId) ? { ...p, x: p.x + dx, y: p.y + dy } : p;
          }
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

  const handleNodesChange = useCallback((changes) => {
    // Loại bỏ các thay đổi type 'select' do React Flow tự phát sinh khi box-select
    // hoặc click — để tránh nó tự chọn node theo khung 160x100 ẩn, giẫm lên logic
    // getSymbolBBox tự viết. Selection giờ CHỈ được quyết định bởi handleMouseUp
    // (box-select) và onNodeClick (click đơn) trong code của bạn.
    const filtered = changes.filter((c) => c.type !== 'select');
    onNodesChange(filtered);
  }, [onNodesChange]);

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
        const box = getSymbolBBox(n);
        const fullyInside = box.x1 >= minX && box.x2 <= maxX && box.y1 >= minY && box.y2 <= maxY;
        return { ...n, selected: fullyInside };
      }));

      // --- Chọn WIRE: TẤT CẢ các điểm của dây phải nằm trong vùng kéo ---
      setWires((ws) => ws.map((w) => {
        const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires); // thêm tham số
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
        setWires((ws) => {
          const cleaned = ws.map((w) => {
            if (w.lockedVertical === undefined) return w;
            const { lockedVertical, ...rest } = w;
            return rest;
          });
          return attachFreeEndpointsToPorts(cleaned, nodesRef.current);
        });
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

        let targetWires = activeWires.length > 0
          ? activeWires
          : (selected?.kind === 'wire' ? [wires.find((w) => w.id === selected.id)].filter(Boolean) : []);

        // --- MỞ RỘNG targetWires: kéo theo mọi dây chạm đầu tự do vào dây đang chọn (lan truyền) ---
        const isSamePoint = (p1, p2) => Math.abs(p1.x - p2.x) < 1 && Math.abs(p1.y - p2.y) < 1;
        const resolvedWires = wires.map((w) => ({ w, pts: resolvePoints(w.points, nodes, w.lockedVertical, wires) }));

        let changed = true;
        const includedIds = new Set(targetWires.map((w) => w.id));
        while (changed) {
          changed = false;
          const currentFreeEndpoints = [];
          resolvedWires.forEach(({ w, pts }) => {
            if (!includedIds.has(w.id)) return;
            if (!pts[0].nodeId) currentFreeEndpoints.push(pts[0]);
            if (!pts[pts.length - 1].nodeId) currentFreeEndpoints.push(pts[pts.length - 1]);
          });

          resolvedWires.forEach(({ w, pts }) => {
            if (includedIds.has(w.id)) return;
            const wEndpoints = [];
            if (!pts[0].nodeId) wEndpoints.push(pts[0]);
            if (!pts[pts.length - 1].nodeId) wEndpoints.push(pts[pts.length - 1]);

            const touches = wEndpoints.some((ep) => currentFreeEndpoints.some((fp) => isSamePoint(ep, fp)));
            if (touches) {
              includedIds.add(w.id);
              changed = true;
            }
          });
        }
        targetWires = wires.filter((w) => includedIds.has(w.id));
        // ------------------------------------------------------------------------------------------

        const targetNodeIds = targetNodes.map((n) => n.id);

        if (targetNodes.length > 0 || targetWires.length > 0) {
          const flowPos = screenToFlowPosition(lastMouse.current);

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
            wireItems: targetWires.map((w) => ({
              id: w.id,
              initialPoints: w.points.map((p) => {
              // Giữ nguyên MỌI loại binding (nodeId hoặc onWireId) nếu điểm đó không
              // cần gỡ neo — chỉ tước binding khi node chủ KHÔNG nằm trong cụm move.
              // Trước đây chỉ check p.nodeId, bỏ sót p.onWireId khiến nhánh dây rẽ
              // (bind vào giữa 1 dây khác) bị mất kết nối khi move/rotate cả cụm.
              if (p.nodeId && targetNodeIds.includes(p.nodeId)) return { ...p };
              if (p.onWireId) return { ...p }; // luôn giữ binding vào dây chủ — dây chủ tự resolve đúng vị trí mới
              return { x: p.x, y: p.y };
            }),
            })),
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
        setWires((ws) => {
          const cleaned = ws.map((w) => {
            if (w.lockedVertical === undefined) return w;
            const { lockedVertical, ...rest } = w;
            return rest;
          });
          return attachFreeEndpointsToPorts(cleaned, nodesRef.current);
        });
        setMoveGroup(null);
        setCursorNodeId(null);
        setIsMoveMode(false);
        setIsCopyMode(false);
      }
    };
    window.addEventListener('mousedown', forceDropOnClick, { capture: true });
    return () => window.removeEventListener('mousedown', forceDropOnClick, { capture: true });
  }, [moveGroup, cursorNodeId]);
  const handlePaneClick = () => {
    if (moveGroup || cursorNodeId) {
      setMoveGroup(null);
      setCursorNodeId(null);
      setIsMoveMode(false);
      setIsCopyMode(false);
    } else if (!isWiringMode && !placingType) {
      setSelected(null);
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
      setWires((ws) => ws.map((w) => ({ ...w, selected: false })));
    }
  };

  // Click có nằm trong vùng xanh (bbox thật của ký hiệu) không
  const isInsideSymbol = (e, node) => {
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const b = getSymbolBBox(node);
    return p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2;
  };
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
        style={{ position: 'relative', flex: 1, height: '100%', minWidth: 0 }}
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
          onNodesChange={handleNodesChange}
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
          
          onNodeClick={(e, node) => {
            if (moveGroup || cursorNodeId) {
              setMoveGroup(null);
              setCursorNodeId(null);
              setIsMoveMode(false);
              setIsCopyMode(false);
              return;
            }

            // Click ngoài vùng xanh -> xử lý như click ra nền
            if (!isInsideSymbol(e, node)) {
              handlePaneClick();
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
              setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === node.id })));
              setWires(ws => ws.map(w => ({ ...w, selected: false })));
            }
          }}
          onPaneClick={handlePaneClick}
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