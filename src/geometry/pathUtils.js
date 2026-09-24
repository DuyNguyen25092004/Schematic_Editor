import { OBSTACLE_MARGIN } from '../constants';

// Chiếu điểm p lên polyline: trả về điểm gần nhất + tỉ lệ chiều dài (0..1) của điểm đó
export function projectOnPath(pts, p) {
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

export function bind(pt, src) {
  if (src && src.nodeId) {
    return { x: pt.x, y: pt.y, nodeId: src.nodeId, portId: src.portId };
  }
  if (src && src.onWireId !== undefined) {
    return { x: pt.x, y: pt.y, onWireId: src.onWireId };
  }
  return { x: pt.x, y: pt.y };
}


export function orthoPath(a, b, preferVertical) {
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


export function pointsToPolyline(pts) {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

// Bỏ điểm trùng / thẳng hàng ở GIỮA, luôn giữ nguyên 2 đầu mút (còn nodeId/portId...)
export function simplifyMiddle(pts) {
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



// Loại bỏ "gai" nhỏ do router né vật cản không cần thiết: một đoạn đi ra
// rồi quay lại gần vị trí cũ trong khoảng ngắn (dưới NOTCH_LIMIT ô lưới)
// Loại bỏ "gai" thật sự: đoạn đi lệch ra một đoạn NGẮN rồi quay lại ĐÚNG cùng
// tọa độ vuông góc, tạo hình chữ nhật thừa do né vật cản — không đụng vào
// các đoạn rẽ có ý nghĩa (đường dây thật đi xa hơn ngưỡng nhỏ này).
export const SPIKE_DEPTH_LIMIT = OBSTACLE_MARGIN * 2; // độ "lệch ra" tối đa coi là gai (20)
export function removeSpikes(pts) {
  let res = pts.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < res.length - 2; i++) {
      const a = res[i - 1], b = res[i], c = res[i + 1], d = res[i + 2];
      if (b.nodeId || c.nodeId || b.onWireId || c.onWireId) continue;

      // Gai dọc: a->b ngang, b->c dọc ngắn, c->d ngang, a và d CÙNG y (thẳng hàng)
      const vSpike =
        Math.abs(a.y - b.y) < 1 && Math.abs(b.x - c.x) < 1 && Math.abs(c.y - d.y) < 1 &&
        Math.abs(a.y - d.y) < 1 && Math.abs(b.y - a.y) <= SPIKE_DEPTH_LIMIT;

      // Gai ngang: a->b dọc, b->c ngang ngắn, c->d dọc, a và d CÙNG x (thẳng hàng)
      const hSpike =
        Math.abs(a.x - b.x) < 1 && Math.abs(b.y - c.y) < 1 && Math.abs(c.x - d.x) < 1 &&
        Math.abs(a.x - d.x) < 1 && Math.abs(b.x - a.x) <= SPIKE_DEPTH_LIMIT;

      if (vSpike || hSpike) {
        res.splice(i, 2); // bỏ b, c — nối thẳng a với d
        changed = true;
        break;
      }
    }
  }
  return res;
}

// Chèn góc để mọi đoạn đều ngang hoặc dọc
export function orthogonalize(pts) {
  const res = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = res[res.length - 1], b = pts[i];
    if (a.x !== b.x && a.y !== b.y) res.push({ x: b.x, y: a.y });
    res.push(b);
  }
  return res;
}

// Điểm nằm giữa (theo độ dài) của một đường gấp khúc — dùng để đặt nhãn tên dây
export function midOfPolyline(pts) {
  if (!pts || pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const segLens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(d);
    total += d;
  }
  let target = total / 2;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const t = segLens[i] ? target / segLens[i] : 0;
      const a = pts[i], b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= segLens[i];
  }
  return pts[Math.floor(pts.length / 2)];
}