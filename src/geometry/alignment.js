import { GRID, getPorts } from '../constants';
import { getTransformedPort } from './ports';
import { resolvePoints } from '../routing/resolveWire';

/**
 * Lấy danh sách toạ độ tuyệt đối của tất cả các chân (terminals) của một node.
 * @param {object} node { type, position: { x, y }, data: { rot, flip, ... } }
 * @returns {Array<{ id: string, x: number, y: number, nodeId: string }>}
 */
export function getNodeTerminals(node) {
  if (!node || !node.position || node.type === 'text' || node.type === 'rect' || node.type === 'box') {
    return [];
  }
  const ports = getPorts(node.type, node.data);
  if (!ports || ports.length === 0) return [];

  const posX = Math.round(node.position.x);
  const posY = Math.round(node.position.y);

  return ports.map((port) => {
    const tPort = getTransformedPort(port, node);
    return {
      id: port.id,
      nodeId: node.id,
      x: posX + tPort.x,
      y: posY + tPort.y,
    };
  });
}

/**
 * Trích xuất các đặc trưng căn chỉnh của một đường dây:
 * - vertices: các đỉnh (đầu mút, góc bẻ)
 * - segments: các đoạn thẳng trực giao (H và V)
 */
export function getWireAlignmentFeatures(wire, nodes, allWires = []) {
  if (!wire || !wire.points || wire.points.length < 2) {
    return { vertices: [], segments: [] };
  }
  const rp = resolvePoints(wire.points, nodes, wire.lockedVertical, allWires, wire.id, wire.routed);
  if (!rp || rp.length < 2) return { vertices: [], segments: [] };

  const vertices = rp.map((p, idx) => ({
    x: Math.round(p.x),
    y: Math.round(p.y),
    wireId: wire.id,
    isEndpoint: idx === 0 || idx === rp.length - 1,
  }));

  const segments = [];
  for (let i = 0; i < rp.length - 1; i++) {
    const p1 = rp[i];
    const p2 = rp[i + 1];
    const x1 = Math.round(p1.x), y1 = Math.round(p1.y);
    const x2 = Math.round(p2.x), y2 = Math.round(p2.y);
    if (y1 === y2 && Math.abs(x1 - x2) > 1) {
      segments.push({
        orientation: 'H',
        coord: y1,
        from: Math.min(x1, x2),
        to: Math.max(x1, x2),
        wireId: wire.id,
      });
    } else if (x1 === x2 && Math.abs(y1 - y2) > 1) {
      segments.push({
        orientation: 'V',
        coord: x1,
        from: Math.min(y1, y2),
        to: Math.max(y1, y2),
        wireId: wire.id,
      });
    }
  }

  return { vertices, segments };
}

/**
 * Tính toán các vạch căn chỉnh thẳng hàng (Alignment Guidelines) giữa các terminal / wire
 * của các đối tượng đang di chuyển / đặt (active) và các đối tượng tĩnh (static).
 *
 * @param {object} params
 * @param {Array<object>} params.nodes - Toàn bộ các nodes trên sheet
 * @param {Array<object>} params.wires - Toàn bộ các wires trên sheet
 * @param {object|null} params.moveGroup - Trạng thái nhóm đang move
 * @param {object|null} params.copyGroup - Trạng thái nhóm đang copy
 * @param {string|null} params.cursorNodeId - ID node đơn đang copy theo chuột
 * @param {object|null} params.placingType - Loại linh kiện đang đặt
 * @param {object|null} params.ghostFlowPos - Toạ độ flow của linh kiện đang đặt
 * @param {boolean} params.isWiringMode - Đang ở chế độ vẽ dây
 * @param {object|null} params.wiringCursor - Toạ độ con trỏ chuột khi vẽ dây
 * @param {Array<object>|null} params.wiringDraft - Các điểm đã chốt của dây đang vẽ
 * @returns {Array<{ orientation: 'H'|'V', coord: number, from: number, to: number, points: Array<{x: number, y: number}> }>}
 */
export function computeAlignmentGuides({
  nodes = [],
  wires = [],
  moveGroup = null,
  copyGroup = null,
  cursorNodeId = null,
  placingType = null,
  ghostFlowPos = null,
  isWiringMode = false,
  wiringCursor = null,
  wiringDraft = null,
}) {
  // 1. Xác định tập Active (đang chuyển động)
  const activePoints = [];
  const activeNodeIds = new Set();
  const activeWireIds = new Set();

  if (moveGroup && moveGroup.items && moveGroup.items.length > 0) {
    moveGroup.items.forEach((item) => {
      activeNodeIds.add(item.id);
      const n = nodes.find((node) => node.id === item.id);
      if (n) {
        activePoints.push(...getNodeTerminals(n));
      }
    });
    if (moveGroup.wireItems) {
      moveGroup.wireItems.forEach((wi) => {
        activeWireIds.add(wi.id);
        const w = wires.find((wire) => wire.id === wi.id);
        if (w) {
          const { vertices } = getWireAlignmentFeatures(w, nodes, wires);
          activePoints.push(...vertices);
        }
      });
    }
  } else if (copyGroup && copyGroup.items && copyGroup.items.length > 0) {
    copyGroup.items.forEach((item) => {
      activeNodeIds.add(item.id);
      const n = nodes.find((node) => node.id === item.id);
      if (n) {
        activePoints.push(...getNodeTerminals(n));
      }
    });
    if (copyGroup.wireItems) {
      copyGroup.wireItems.forEach((wi) => {
        activeWireIds.add(wi.id);
        const w = wires.find((wire) => wire.id === wi.id);
        if (w) {
          const { vertices } = getWireAlignmentFeatures(w, nodes, wires);
          activePoints.push(...vertices);
        }
      });
    }
  } else if (cursorNodeId) {
    activeNodeIds.add(cursorNodeId);
    const n = nodes.find((node) => node.id === cursorNodeId);
    if (n) {
      activePoints.push(...getNodeTerminals(n));
    }
  } else if (placingType && ghostFlowPos) {
    activePoints.push(...getNodeTerminals({
      id: '__ghost__',
      type: placingType.type,
      data: placingType.defaultData || {},
      position: { x: ghostFlowPos.x, y: ghostFlowPos.y },
    }));
  } else if (isWiringMode && wiringCursor) {
    activePoints.push({
      id: '__wiring_cursor__',
      x: Math.round(wiringCursor.x),
      y: Math.round(wiringCursor.y),
      kind: 'cursor',
    });
  }

  // Nếu không có điểm nào đang di chuyển hoặc vẽ, trả về rỗng
  if (activePoints.length === 0) {
    return [];
  }

  // Điểm neo của draft hiện tại (để tránh gióng ngược lại điểm đầu của chính đoạn dây đang vẽ)
  const draftAnchor = (isWiringMode && wiringDraft && wiringDraft.length > 0)
    ? wiringDraft[wiringDraft.length - 1]
    : null;

  // 2. Thu thập tập Static (Linh kiện tĩnh & Dây tĩnh)
  const staticPoints = [];
  const staticSegments = [];

  // Terminal của các linh kiện tĩnh
  nodes.forEach((node) => {
    if (!activeNodeIds.has(node.id)) {
      staticPoints.push(...getNodeTerminals(node));
    }
  });

  // Đỉnh và đoạn thẳng của các dây tĩnh
  wires.forEach((wire) => {
    if (!activeWireIds.has(wire.id)) {
      const feat = getWireAlignmentFeatures(wire, nodes, wires);
      staticPoints.push(...feat.vertices);
      staticSegments.push(...feat.segments);
    }
  });

  if (staticPoints.length === 0 && staticSegments.length === 0) {
    return [];
  }

  // 3. So khớp toạ độ
  const hLines = new Map(); // y -> { ptsMap: Map, from, to }
  const vLines = new Map(); // x -> { ptsMap: Map, from, to }

  for (const aPt of activePoints) {
    // 3A. So khớp với các điểm tĩnh (Terminals & Wire Vertices)
    for (const sPt of staticPoints) {
      // Bỏ qua điểm neo draft của chính dây đang vẽ
      if (draftAnchor && Math.abs(sPt.x - draftAnchor.x) < 1 && Math.abs(sPt.y - draftAnchor.y) < 1) {
        continue;
      }
      // Bỏ qua nếu chính là aPt
      if (Math.abs(aPt.x - sPt.x) < 1 && Math.abs(aPt.y - sPt.y) < 1) {
        continue;
      }

      // Thẳng hàng ngang
      if (Math.abs(aPt.y - sPt.y) < 1) {
        const y = aPt.y;
        if (!hLines.has(y)) {
          hLines.set(y, { ptsMap: new Map(), from: Infinity, to: -Infinity });
        }
        const lineData = hLines.get(y);
        lineData.ptsMap.set(`${aPt.x},${aPt.y}`, aPt);
        lineData.ptsMap.set(`${sPt.x},${sPt.y}`, sPt);
        lineData.from = Math.min(lineData.from, aPt.x, sPt.x);
        lineData.to = Math.max(lineData.to, aPt.x, sPt.x);
      }

      // Thẳng hàng dọc
      if (Math.abs(aPt.x - sPt.x) < 1) {
        const x = aPt.x;
        if (!vLines.has(x)) {
          vLines.set(x, { ptsMap: new Map(), from: Infinity, to: -Infinity });
        }
        const lineData = vLines.get(x);
        lineData.ptsMap.set(`${aPt.x},${aPt.y}`, aPt);
        lineData.ptsMap.set(`${sPt.x},${sPt.y}`, sPt);
        lineData.from = Math.min(lineData.from, aPt.y, sPt.y);
        lineData.to = Math.max(lineData.to, aPt.y, sPt.y);
      }
    }

    // 3B. So khớp với các đoạn thẳng của dây tĩnh (Wire Segments)
    for (const seg of staticSegments) {
      if (seg.orientation === 'H') {
        if (Math.abs(aPt.y - seg.coord) < 1) {
          const y = seg.coord;
          if (!hLines.has(y)) {
            hLines.set(y, { ptsMap: new Map(), from: Infinity, to: -Infinity });
          }
          const lineData = hLines.get(y);
          // Điểm trên đoạn dây gần nhất với aPt
          const segPtX = Math.max(seg.from, Math.min(seg.to, aPt.x));
          lineData.ptsMap.set(`${aPt.x},${aPt.y}`, aPt);
          lineData.ptsMap.set(`${segPtX},${y}`, { x: segPtX, y, isSegment: true });
          lineData.from = Math.min(lineData.from, aPt.x, seg.from);
          lineData.to = Math.max(lineData.to, aPt.x, seg.to);
        }
      } else if (seg.orientation === 'V') {
        if (Math.abs(aPt.x - seg.coord) < 1) {
          const x = seg.coord;
          if (!vLines.has(x)) {
            vLines.set(x, { ptsMap: new Map(), from: Infinity, to: -Infinity });
          }
          const lineData = vLines.get(x);
          const segPtY = Math.max(seg.from, Math.min(seg.to, aPt.y));
          lineData.ptsMap.set(`${aPt.x},${aPt.y}`, aPt);
          lineData.ptsMap.set(`${x},${segPtY}`, { x, y: segPtY, isSegment: true });
          lineData.from = Math.min(lineData.from, aPt.y, seg.from);
          lineData.to = Math.max(lineData.to, aPt.y, seg.to);
        }
      }
    }
  }

  const guides = [];
  const PADDING = 15;

  hLines.forEach((data, y) => {
    const pts = Array.from(data.ptsMap.values());
    if (pts.length < 2 && data.from === data.to) return;
    guides.push({
      orientation: 'H',
      coord: y,
      from: data.from - PADDING,
      to: data.to + PADDING,
      points: pts,
    });
  });

  vLines.forEach((data, x) => {
    const pts = Array.from(data.ptsMap.values());
    if (pts.length < 2 && data.from === data.to) return;
    guides.push({
      orientation: 'V',
      coord: x,
      from: data.from - PADDING,
      to: data.to + PADDING,
      points: pts,
    });
  });

  return guides;
}
