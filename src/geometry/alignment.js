import { GRID, getPorts } from '../constants';
import { getTransformedPort } from './ports';

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
 * Tính toán các vạch căn chỉnh thẳng hàng (Alignment Guidelines) giữa các terminal
 * của các linh kiện đang di chuyển/đặt (active) và các linh kiện tĩnh (static).
 *
 * @param {object} params
 * @param {Array<object>} params.nodes - Toàn bộ các nodes trên sheet
 * @param {object|null} params.moveGroup - Trạng thái nhóm đang move
 * @param {object|null} params.copyGroup - Trạng thái nhóm đang copy
 * @param {string|null} params.cursorNodeId - ID node đơn đang copy theo chuột
 * @param {object|null} params.placingType - Loại linh kiện đang đặt
 * @param {object|null} params.ghostFlowPos - Toạ độ flow của linh kiện đang đặt
 * @returns {Array<{ orientation: 'H'|'V', coord: number, from: number, to: number, points: Array<{x: number, y: number}> }>}
 */
export function computeAlignmentGuides({
  nodes = [],
  moveGroup = null,
  copyGroup = null,
  cursorNodeId = null,
  placingType = null,
  ghostFlowPos = null,
}) {
  // Xác định tập node active (đang di chuyển hoặc đang chuẩn bị đặt)
  const activeNodes = [];
  const activeNodeIds = new Set();

  if (moveGroup && moveGroup.items && moveGroup.items.length > 0) {
    moveGroup.items.forEach((item) => {
      activeNodeIds.add(item.id);
      const n = nodes.find((node) => node.id === item.id);
      if (n) activeNodes.push(n);
    });
  } else if (copyGroup && copyGroup.items && copyGroup.items.length > 0) {
    copyGroup.items.forEach((item) => {
      activeNodeIds.add(item.id);
      const n = nodes.find((node) => node.id === item.id);
      if (n) activeNodes.push(n);
    });
  } else if (cursorNodeId) {
    activeNodeIds.add(cursorNodeId);
    const n = nodes.find((node) => node.id === cursorNodeId);
    if (n) activeNodes.push(n);
  } else if (placingType && ghostFlowPos) {
    activeNodes.push({
      id: '__ghost__',
      type: placingType.type,
      data: placingType.defaultData || {},
      position: { x: ghostFlowPos.x, y: ghostFlowPos.y },
    });
  }

  // Nếu không có node nào đang di chuyển hoặc đặt, không hiển thị vạch căn chỉnh
  if (activeNodes.length === 0) {
    return [];
  }

  // Thu thập terminals của các node active
  const activeTerminals = [];
  activeNodes.forEach((node) => {
    activeTerminals.push(...getNodeTerminals(node));
  });

  if (activeTerminals.length === 0) return [];

  // Thu thập terminals của các node tĩnh (static)
  const staticTerminals = [];
  nodes.forEach((node) => {
    if (!activeNodeIds.has(node.id)) {
      staticTerminals.push(...getNodeTerminals(node));
    }
  });

  if (staticTerminals.length === 0) return [];

  // Gom các đường gióng theo toạ độ
  // key: "H:y" hoặc "V:x"
  const hLines = new Map(); // y -> Set of terminals {x, y}
  const vLines = new Map(); // x -> Set of terminals {x, y}

  for (const aTerm of activeTerminals) {
    for (const sTerm of staticTerminals) {
      // 1. Thẳng hàng ngang: cùng tung độ Y
      if (Math.abs(aTerm.y - sTerm.y) < 1) {
        const yCoord = aTerm.y;
        if (!hLines.has(yCoord)) {
          hLines.set(yCoord, new Map());
        }
        const ptsMap = hLines.get(yCoord);
        ptsMap.set(`${aTerm.x},${aTerm.y}`, aTerm);
        ptsMap.set(`${sTerm.x},${sTerm.y}`, sTerm);
      }

      // 2. Thẳng hàng dọc: cùng hoành độ X
      if (Math.abs(aTerm.x - sTerm.x) < 1) {
        const xCoord = aTerm.x;
        if (!vLines.has(xCoord)) {
          vLines.set(xCoord, new Map());
        }
        const ptsMap = vLines.get(xCoord);
        ptsMap.set(`${aTerm.x},${aTerm.y}`, aTerm);
        ptsMap.set(`${sTerm.x},${sTerm.y}`, sTerm);
      }
    }
  }

  const guides = [];
  const PADDING = 15;

  // Xử lý các đường gióng ngang
  hLines.forEach((ptsMap, y) => {
    const pts = Array.from(ptsMap.values());
    if (pts.length < 2) return;
    const xs = pts.map((p) => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    guides.push({
      orientation: 'H',
      coord: y,
      from: minX - PADDING,
      to: maxX + PADDING,
      points: pts,
    });
  });

  // Xử lý các đường gióng dọc
  vLines.forEach((ptsMap, x) => {
    const pts = Array.from(ptsMap.values());
    if (pts.length < 2) return;
    const ys = pts.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    guides.push({
      orientation: 'V',
      coord: x,
      from: minY - PADDING,
      to: maxY + PADDING,
      points: pts,
    });
  });

  return guides;
}
