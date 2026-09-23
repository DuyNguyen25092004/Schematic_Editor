import { GRID, OBSTACLE_MARGIN } from '../constants';
import { toGridUnit } from '../geometry/grid';
import { getSymbolBBox } from '../geometry/ports';

// ============ ROUTER TRỰC GIAO NÉ LINH KIỆN ============
 const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]; // R, L, D, U
 const OPP = [1, 0, 3, 2];
 const BEND_COST = GRID * 3;      // phạt mỗi lần rẽ -> ưu tiên đường ít gấp khúc

 const OVERLAP_PENALTY = GRID * 25; // tăng từ GRID*8 lên GRID*25 — đảm bảo LUÔN áp đảo rõ ràng
                                     // chi phí bẻ góc (2×BEND_COST + độ lệch), không còn hoà cost
export function edgeKey(ax, ay, bx, by) {
  const k1 = `${ax},${ay}`, k2 = `${bx},${by}`;
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

export const dirIndex = (d) => DIRS.findIndex((v) => v.x === d.x && v.y === d.y);

// Vật cản = bbox thật của ký hiệu, nới lề rồi làm tròn RA NGOÀI theo lưới
export function getObstacles(nodes) {
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
export function routeOrtho(start, end, obstacles, { startDir = null, firstDirs = null, lastDirs = null, occupied = null, occupiedPaths = null } = {}) {
  if (start.x === end.x && start.y === end.y) return [start, end];

  const obs = obstacles.filter((r) => !insideRect(start, r) && !insideRect(end, r));
  const xs = new Set([start.x, end.x]);
  const ys = new Set([start.y, end.y]);
  obs.forEach((r) => { xs.add(r.x1); xs.add(r.x2); ys.add(r.y1); ys.add(r.y2); });

  // THÊM: đưa toạ độ của các dây khác vào lưới, để router có hàng/cột thay thế
  // thực sự tồn tại trong đồ thị — không chỉ bị phạt điểm mà còn PHẢI CÓ đường khác để đi.
    if (occupiedPaths) {
    occupiedPaths.forEach((path) => {
      path.forEach((p) => {
        // Mở rộng từ chỉ ±GRID thành ±GRID và ±2*GRID — thêm 1 lớp dự phòng
        // để đảm bảo luôn có hàng/cột thực sự trống để né, không chỉ hàng sát cạnh nhất
        xs.add(p.x); xs.add(p.x + GRID); xs.add(p.x - GRID);
        xs.add(p.x + GRID * 2); xs.add(p.x - GRID * 2);
        ys.add(p.y); ys.add(p.y + GRID); ys.add(p.y - GRID);
        ys.add(p.y + GRID * 2); ys.add(p.y - GRID * 2);
      });
    });
  }

  const X = [...xs].sort((a, b) => a - b);
  const Y = [...ys].sort((a, b) => a - b);
  const Ny = Y.length;
  const si = X.indexOf(start.x), sj = Y.indexOf(start.y);
  const ei = X.indexOf(end.x),   ej = Y.indexOf(end.y);

  const key = (i, j, d) => (i * Ny + j) * 5 + d;
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
      if (cur.d !== 4 && nd === OPP[cur.d]) continue;
      const ni = cur.i + DIRS[nd].x, nj = cur.j + DIRS[nd].y;
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Ny) continue;
      const a = { x: X[cur.i], y: Y[cur.j] }, b = { x: X[ni], y: Y[nj] };
      if (obs.some((r) => segHitsRect(a, b, r))) continue;

      let overlapPenalty = 0;
      if (occupied) {
        const gax = toGridUnit(a.x), gay = toGridUnit(a.y);
        const gbx = toGridUnit(b.x), gby = toGridUnit(b.y);
        const steps = Math.max(Math.abs(gbx - gax), Math.abs(gby - gay));
        const stepX = steps ? (gbx - gax) / steps : 0;
        const stepY = steps ? (gby - gay) / steps : 0;
        for (let s = 0; s < steps; s++) {
          const x1 = Math.round(gax + stepX * s), y1 = Math.round(gay + stepY * s);
          const x2 = Math.round(gax + stepX * (s + 1)), y2 = Math.round(gay + stepY * (s + 1));
          if (occupied.has(edgeKey(x1, y1, x2, y2))) { overlapPenalty += OVERLAP_PENALTY; break; }
        }
      }

      const nc = cur.c + Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
               + (cur.d !== 4 && cur.d !== nd ? BEND_COST : 0)
               + overlapPenalty;
      const nk = key(ni, nj, nd);
      if (nc < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nc);
        prev.set(nk, ck);
        open.push({ i: ni, j: nj, d: nd, c: nc, first: false });
      }
    }
  }

  if (goalKey === undefined) return [start, { x: end.x, y: start.y }, end];

  const path = [];
  for (let k = goalKey; k !== undefined; k = prev.get(k)) {
    const ij = Math.floor(k / 5);
    path.push({ x: X[Math.floor(ij / Ny)], y: Y[ij % Ny] });
  }
  return path.reverse();
}