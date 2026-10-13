import { GRID, NO_JUNCTION_DOT_TYPES } from '../constants';
import { toGridUnit, sameGridPoint } from '../geometry/grid';
import { resolvePoints } from '../routing/resolveWire';
import { pointAtRatio, projectOnPath, simplifyMiddle } from '../geometry/pathUtils';

export function getJunctionDots(wires, nodes, resolvedMap = null) {
  const dots = [];
  const seen = new Set();
  const portCount = new Map();
  const wireIdSet = new Set(wires.map((w) => w.id));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  wires.forEach((w) => {
    const raw = w.points;
    if (!raw || raw.length < 2) return;
    const res = resolvedMap?.get(w.id) || resolvePoints(raw, nodes, w.lockedVertical, wires, w.id, w.routed);
    [[raw[0], res[0]], [raw[raw.length - 1], res[res.length - 1]]].forEach(([r, p]) => {
      if (r.nodeId) {
        const hostNode = nodeMap.get(r.nodeId);
        if (hostNode && NO_JUNCTION_DOT_TYPES.has(hostNode.type)) return;
        const k = `${r.nodeId}.${r.portId}`;
        const c = portCount.get(k) || { n: 0, x: p.x, y: p.y };
        c.n += 1;
        portCount.set(k, c);
        return;
      }
      if (!r.onWireId) return;
      if (!wireIdSet.has(r.onWireId)) return;
      const key = `${toGridUnit(p.x)},${toGridUnit(p.y)}`;
      if (seen.has(key)) return;
      seen.add(key);
      dots.push({ x: toGridUnit(p.x) * GRID, y: toGridUnit(p.y) * GRID });
    });
  });

  portCount.forEach((c) => {
    if (c.n >= 2) dots.push({ x: toGridUnit(c.x) * GRID, y: toGridUnit(c.y) * GRID });
  });
  return dots;
}

// Chuẩn hoá: gộp mọi cặp wire có đầu mút tự do trùng nhau thành 1 wire liền mạch.
// Chạy lặp cho tới khi không còn cặp nào để gộp — đảm bảo dù bug xảy ra ở đâu,
// trạng thái wires luôn "sạch" trước khi vẽ junction dot.
// Trong mergeTouchingWires: thay isNear(...) bằng sameGridPoint(...)
export function mergeTouchingWires(wires, nodes) {
  if (!wires || wires.length < 2) return wires;

  // Fast pre-check O(N): kiểm tra xem có 2 đầu mút tự do nào trùng toạ độ lưới không
  const freeGridCounts = new Map();
  let hasPotentialMerge = false;

  for (let i = 0; i < wires.length; i++) {
    const w = wires[i];
    if (!w.points || w.points.length < 2) continue;
    const pFirst = w.points[0];
    const pLast = w.points[w.points.length - 1];

    if (!pFirst.nodeId && !pFirst.onWireId) {
      const k = `${toGridUnit(pFirst.x)},${toGridUnit(pFirst.y)}`;
      const c = (freeGridCounts.get(k) || 0) + 1;
      if (c >= 2) { hasPotentialMerge = true; break; }
      freeGridCounts.set(k, c);
    }
    if (!pLast.nodeId && !pLast.onWireId) {
      const k = `${toGridUnit(pLast.x)},${toGridUnit(pLast.y)}`;
      const c = (freeGridCounts.get(k) || 0) + 1;
      if (c >= 2) { hasPotentialMerge = true; break; }
      freeGridCounts.set(k, c);
    }
  }

  // Nếu không có bất kỳ đầu mút tự do nào trùng toạ độ lưới, trả về nguyên bản trong O(N)
  if (!hasPotentialMerge) return wires;

  let list = wires.map((w) => ({ ...w }));
  let mergedAny = true;

  while (mergedAny) {
    mergedAny = false;

    outer:
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      if (!A.points || A.points.length < 2) continue;
      const freeA1 = !A.points[0].nodeId && !A.points[0].onWireId;
      const freeALast = !A.points[A.points.length - 1].nodeId && !A.points[A.points.length - 1].onWireId;
      if (!freeA1 && !freeALast) continue;

      const aFirst = A.points[0];
      const aLast = A.points[A.points.length - 1];

      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const B = list[j];
        if (!B.points || B.points.length < 2) continue;

        const freeB1 = !B.points[0].nodeId && !B.points[0].onWireId;
        const freeBLast = !B.points[B.points.length - 1].nodeId && !B.points[B.points.length - 1].onWireId;
        if (!freeB1 && !freeBLast) continue;

        const bFirst = B.points[0];
        const bLast = B.points[B.points.length - 1];

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
          let labels = [];
          if ((A.labels && A.labels.length) || (B.labels && B.labels.length)) {
            const ptsA = resolvePoints(A.points, nodes, A.lockedVertical, wires, A.id, A.routed);
            const ptsB = resolvePoints(B.points, nodes, B.lockedVertical, wires, B.id, B.routed);
            const remap = (lbls, pts) => (lbls || []).map((l) => {
              const pt = pointAtRatio(pts, l.ratio);
              return { ...l, ratio: projectOnPath(mergedPoints, pt).ratio };
            });
            labels = [...remap(A.labels, ptsA), ...remap(B.labels, ptsB)];
          }
          const merged = {
            ...A, points: mergedPoints, lockedVertical: undefined,
            net: A.net || B.net, name: A.name || B.name, color: A.color || B.color,
            ...(labels.length ? { labels } : {}),
          };
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



// Kéo LỆCH 1 đoạn thẳng (giữa points[i] và points[i+1]) theo trục vuông góc với nó.
// Nếu 1 đầu đã bind (nodeId/onWireId) -> chèn thêm 1 điểm gấp khúc (elbow) tự do
// ngay cạnh nó thay vì di chuyển đầu đó; nếu đầu tự do -> dịch chuyển trực tiếp.
export function offsetSegment(points, i, newVal) {
  const out = points.map((p) => ({ ...p }));
  const pi = out[i], pj = out[i + 1];
  const horizontal = Math.abs(pi.y - pj.y) < 1;
  const axis = horizontal ? 'y' : 'x';
  const along = horizontal ? 'x' : 'y';

  const piPinned = !!(pi.nodeId || pi.onWireId);
  const pjPinned = !!(pj.nodeId || pj.onWireId);
  const mid = [];

  if (piPinned) {
    mid.push({ [along]: pi[along], [axis]: newVal });
  } else {
    pi[axis] = newVal;
  }
  if (pjPinned) {
    mid.push({ [along]: pj[along], [axis]: newVal });
  } else {
    pj[axis] = newVal;
  }

  const before = out.slice(0, i + 1);
  const after = out.slice(i + 1);
  return [...before, ...mid, ...after];
}




// So với bản cũ: KHÔNG đoán trục theo khoảng cách kéo nữa (gây bất đối xứng
// giữa 2 đầu), mà dùng ĐÚNG hướng ngang/dọc mà đoạn dây đó VỐN CÓ trước khi
// kéo — nên đầu trái và đầu phải luôn hành xử giống hệt nhau.
export function fixOrthogonalChain(pointsBefore, pointsAfter, pivotIndex) {
  const pts = pointsAfter.map((p) => ({ ...p }));
  if (pivotIndex < 0 || pivotIndex >= pts.length || pivotIndex >= pointsBefore.length) return pts; // guard

  for (let i = pivotIndex; i > 0; i--) {
    const prev = pts[i - 1];
    const beforeCur = pointsBefore[i], beforePrev = pointsBefore[i - 1];
    if (!prev || !beforeCur || !beforePrev) break;   // guard
    if (prev.nodeId || prev.onWireId) continue;
    const wasHorizontal = Math.abs(beforeCur.y - beforePrev.y) < 1;
    if (wasHorizontal) prev.y = pts[i].y;
    else prev.x = pts[i].x;
  }

  for (let i = pivotIndex; i < pts.length - 1; i++) {
    const next = pts[i + 1];
    const beforeCur = pointsBefore[i], beforeNext = pointsBefore[i + 1];
    if (!next || !beforeCur || !beforeNext) break;   // guard
    if (next.nodeId || next.onWireId) continue;
    const wasHorizontal = Math.abs(beforeCur.y - beforeNext.y) < 1;
    if (wasHorizontal) next.y = pts[i].y;
    else next.x = pts[i].x;
  }

  return pts;
}

// Tính toán kéo thân dây (segment drag) thuần túy từ mốc initialPoints ban đầu.
// Loại bỏ hoàn toàn lỗi cộng dồn sai số qua từng frame và lỗi lệch segIndex khi mảng co lại.
export function computeDraggedWire(initialPoints, segIndex, newVal) {
  if (!initialPoints || initialPoints.length < 2) return initialPoints;
  const A = initialPoints[segIndex];
  const B = initialPoints[segIndex + 1];
  if (!A || !B) return initialPoints;

  const horizontal = Math.abs(A.y - B.y) < 1;
  const axis = horizontal ? 'y' : 'x';
  const along = horizontal ? 'x' : 'y';

  const aPinned = segIndex === 0 && !!(A.nodeId || A.onWireId);
  const bPinned = (segIndex + 1 === initialPoints.length - 1) && !!(B.nodeId || B.onWireId);

  let newSeg = [];
  if (aPinned) {
    newSeg.push({ ...A });
    newSeg.push({ [along]: A[along], [axis]: newVal });
  } else {
    newSeg.push({ ...A, [axis]: newVal });
  }

  if (bPinned) {
    newSeg.push({ [along]: B[along], [axis]: newVal });
    newSeg.push({ ...B });
  } else {
    newSeg.push({ ...B, [axis]: newVal });
  }

  const before = initialPoints.slice(0, segIndex);
  const after = initialPoints.slice(segIndex + 2);

  const raw = [...before, ...newSeg, ...after];
  return simplifyMiddle(raw);
}

// Tính toán kéo đầu mút dây (endpoint drag) bảo toàn tính trực giao (orthogonal).
// Tự động chèn điểm gấp khúc (elbow) vào mảng điểm thực tế khi kéo đầu mút lệch góc,
// đảm bảo wire.points luôn lưu trữ đường gấp khúc trực giao chuẩn xác thay vì đường chéo thô.
export function computeEndpointDrag(initialPoints, isStart, snapped) {
  if (!initialPoints || initialPoints.length < 2) return initialPoints;
  const pts = initialPoints.map((p) => ({ ...p }));
  const last = pts.length - 1;
  const endIdx = isStart ? 0 : last;
  const fixedIdx = isStart ? last : 0;
  const fixed = pts[fixedIdx];

  if (pts.length === 2) {
    const origEnd = pts[endIdx];
    const wasHorizontal = Math.abs(fixed.y - origEnd.y) < 1;

    // Nếu di chuyển thẳng hàng với điểm neo còn lại
    if (Math.abs(snapped.x - fixed.x) < 1 || Math.abs(snapped.y - fixed.y) < 1) {
      pts[endIdx] = { ...snapped };
      return simplifyMiddle(pts);
    }

    // Nếu di chuyển lệch hướng tạo góc L:
    let elbow;
    if (wasHorizontal) {
      // Dây ban đầu nằm ngang: kéo tiếp ngang từ fixed tới snapped.x, rồi bẻ góc dọc tới snapped.y
      elbow = { x: snapped.x, y: fixed.y };
    } else {
      // Dây ban đầu nằm dọc: kéo tiếp dọc từ fixed tới snapped.y, rồi bẻ góc ngang tới snapped.x
      elbow = { x: fixed.x, y: snapped.y };
    }

    const newPts = isStart
      ? [{ ...snapped }, elbow, { ...fixed }]
      : [{ ...fixed }, elbow, { ...snapped }];
    return simplifyMiddle(newPts);
  }

  // Nếu pts có từ 3 điểm trở lên:
  const neighborIdx = isStart ? 1 : last - 1;
  const prevNeighborIdx = isStart ? 2 : last - 2;
  const neighbor = pts[neighborIdx];
  const prevNeighbor = pts[prevNeighborIdx];
  const prevHorizontal = prevNeighbor ? Math.abs(prevNeighbor.y - neighbor.y) < 1 : false;

  // Kiểm tra xem snapped có thẳng hàng với neighbor hay không
  if (Math.abs(snapped.x - neighbor.x) < 1 || Math.abs(snapped.y - neighbor.y) < 1) {
    pts[endIdx] = { ...snapped };
    return simplifyMiddle(pts);
  }

  // Chéo góc với neighbor -> chèn thêm elbow vuông góc
  let elbow;
  if (prevHorizontal) {
    elbow = { x: neighbor.x, y: snapped.y };
  } else {
    elbow = { x: snapped.x, y: neighbor.y };
  }

  const newPts = isStart
    ? [{ ...snapped }, elbow, ...pts.slice(1)]
    : [...pts.slice(0, last), elbow, { ...snapped }];
  return simplifyMiddle(newPts);
}