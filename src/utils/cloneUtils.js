import { GRID } from '../constants';
import { resolvePoints } from '../routing/resolveWire';

/**
 * Sinh ID / Reference ID duy nhất không bị trùng lặp với danh sách nodes hiện tại.
 */
export function generateUniqueId(rawPrefix, existingNodes = [], reserved = new Set()) {
  const existingIds = new Set(existingNodes.map((n) => n.id));
  const existingRefs = new Set(existingNodes.map((n) => n.data?.reference).filter(Boolean));

  let i = 1;
  const cleanPrefix = rawPrefix.replace(/_$/, '');
  const isDevicePrefix = ['M', 'Q', 'R', 'C', 'U', 'V', 'I'].includes(cleanPrefix) || rawPrefix.endsWith('_');
  const checkExists = (num) => {
    const v1 = `${cleanPrefix}_{${num}}`;
    const v2 = `${cleanPrefix}_${num}`;
    const v3 = `${cleanPrefix}${num}`;
    const v4 = `${rawPrefix}${num}`;
    return (
      existingIds.has(v1) ||
      existingIds.has(v2) ||
      existingIds.has(v3) ||
      existingIds.has(v4) ||
      existingRefs.has(v1) ||
      existingRefs.has(v2) ||
      existingRefs.has(v3) ||
      existingRefs.has(v4) ||
      reserved.has(v1) ||
      reserved.has(v2) ||
      reserved.has(v3) ||
      reserved.has(v4)
    );
  };
  while (checkExists(i)) {
    i++;
  }
  const id = isDevicePrefix ? `${cleanPrefix}_{${i}}` : `${rawPrefix}${i}`;
  reserved.add(id);
  return id;
}

/**
 * Nhân bản khối templateNodes + templateWires cho một Sheet đích bất kỳ (hỗ trợ cả cùng sheet hoặc xuyên sheet).
 */
export function instantiateClonedBlock({
  templateNodes = [],
  templateWires = [],
  anchor = { x: 0, y: 0 },
  targetFlowPos = { x: 0, y: 0 },
  destNodes = [],
  destWires = [],
}) {
  const dx = Math.round((targetFlowPos.x - anchor.x) / GRID) * GRID;
  const dy = Math.round((targetFlowPos.y - anchor.y) / GRID) * GRID;

  const reserved = new Set();
  const idMap = new Map(); // oldId -> newId

  const newNodes = templateNodes.map((n) => {
    const rawPrefix = n.type === 'text' ? 'TXT' : ((n.data?.reference || 'U').replace(/[0-9{}]/g, '') || 'U');
    const prefix = ['M', 'Q', 'R', 'C', 'U', 'V', 'I'].includes(rawPrefix.replace(/_$/, ''))
      ? `${rawPrefix.replace(/_$/, '')}_`
      : rawPrefix;
    const newId = generateUniqueId(prefix, destNodes, reserved);
    idMap.set(n.id, newId);
    return {
      ...n,
      id: newId,
      data: n.type === 'text' ? { ...n.data } : { ...n.data, reference: n.type === 'vdd' ? n.data.reference : newId },
      position: { x: n.position.x + dx, y: n.position.y + dy },
      selected: false,
    };
  });

  const templateWireIdSet = new Set(templateWires.map((w) => w.id));
  const wireIdMap = new Map();
  const resolvedMap = new Map(
    templateWires.map((w) => [w.id, resolvePoints(w.points, templateNodes, w.lockedVertical, templateWires, w.id, w.routed)])
  );

  templateWires.forEach((w) => {
    wireIdMap.set(w.id, `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  });

  const newWires = templateWires.map((w) => {
    const rp = resolvedMap.get(w.id) || [];
    const points = w.points.map((p, i) => {
      if (p.nodeId) {
        if (idMap.has(p.nodeId)) return { ...p, nodeId: idMap.get(p.nodeId) };
        const q = (i === 0 ? rp[0] : rp[rp.length - 1]) || { x: p.x || 0, y: p.y || 0 };
        return { x: q.x + dx, y: q.y + dy };
      }
      if (p.onWireId) {
        if (templateWireIdSet.has(p.onWireId)) return { ...p, onWireId: wireIdMap.get(p.onWireId) };
        return { x: (p.x || 0) + dx, y: (p.y || 0) + dy };
      }
      return { ...p, x: (p.x || 0) + dx, y: (p.y || 0) + dy };
    });
    return {
      id: wireIdMap.get(w.id),
      points,
      net: w.net,
      name: w.name,
      color: w.color,
      labels: (w.labels || []).map((l) => ({ ...l })),
      selected: false,
    };
  });

  return {
    newNodes,
    newWires,
    copyGroup: {
      startX: targetFlowPos.x,
      startY: targetFlowPos.y,
      items: newNodes.map((n) => ({ id: n.id, initialX: n.position.x, initialY: n.position.y })),
      wireItems: newWires.map((w) => ({ id: w.id, initialPoints: w.points.map((p) => ({ ...p })) })),
      templateNodes,
      templateWires,
      anchor: targetFlowPos,
    },
  };
}
