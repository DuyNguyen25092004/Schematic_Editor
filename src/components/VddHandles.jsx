import React, { useRef } from 'react';
import { GRID, VDD_BAR, VDD_MIN_LEN, VDD_MAX_EXT, getVddSpan, parseVddPort } from '../constants';
import { getTransformedPort } from '../geometry/ports';

// Hai tay nắm ở 2 đầu thanh VDD: kéo để dài ra / ngắn lại theo phương ngang.
// Kéo đầu trái không dời node — chân được đặt tên theo độ lệch nên dây không bị nhảy.
function VddHandles({ node, wires, setNodes, screenToFlowPosition }) {
  const dragRef = useRef(false);
  const { left, right } = getVddSpan(node.data);

  const posOf = (k) => {
    const p = getTransformedPort({ x: VDD_BAR.x0 + k * GRID, y: VDD_BAR.y }, node);
    return { x: Math.round(node.position.x) + p.x, y: Math.round(node.position.y) + p.y };
  };

  // Chân xa nhất (mỗi phía) đang có dây nối vào — không cho thu ngắn quá mức này
  const usedRange = () => {
    let minK = 0, maxK = 0;
    wires.forEach((w) => w.points.forEach((p) => {
      if (p.nodeId !== node.id) return;
      const k = parseVddPort(p.portId);
      if (k === null) return;
      minK = Math.min(minK, k);
      maxK = Math.max(maxK, k);
    }));
    return { minK, maxK };
  };

  // Toạ độ chuột (flow) -> toạ độ cục bộ x của node (đảo ngược: xoay rồi lật)
  const toLocalX = (pos) => {
    const rot = node.data.rot || 0;
    const flip = node.data.flip || false;
    const dx = pos.x - (Math.round(node.position.x) + 40);
    const dy = pos.y - (Math.round(node.position.y) + 50);
    const a = ((rot % 360) + 360) % 360;
    let lx = dx;
    if (a === 90) lx = dy;
    else if (a === 180) lx = -dx;
    else if (a === 270) lx = -dy;
    if (flip) lx = -lx;
    return 40 + lx;
  };

  const start = (e, side) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = true;
    const { minK, maxK } = usedRange();
    const other = side === 'right' ? left : right;          // phía còn lại giữ nguyên
    const minThis = Math.max(0, side === 'right' ? maxK : -minK, VDD_MIN_LEN - other);

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const k = Math.round((toLocalX(pos) - VDD_BAR.x0) / GRID);   // độ lệch (ô) của con trỏ
      const v = Math.min(VDD_MAX_EXT, Math.max(minThis, side === 'right' ? k : -k));
      const key = side === 'right' ? 'len' : 'left';
      setNodes((ns) => ns.map((n) => {
        if (n.id !== node.id) return n;
        const cur = getVddSpan(n.data);
        if ((side === 'right' ? cur.right : cur.left) === v) return n;
        // Ghi cả 2 phía để không bị "min tổng chiều dài" tự đổi giá trị ngầm
        return { ...n, data: { ...n.data, left: cur.left, len: cur.right, [key]: v } };
      }));
    };
    const onUp = () => {
      dragRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handle = (side, k) => {
    const p = posOf(k);
    return (
      <circle key={side} cx={p.x} cy={p.y} r={5}
        fill="#fff" stroke="#1677ff" strokeWidth={2}
        style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
        onMouseDown={(e) => start(e, side)} />
    );
  };

  return <>{handle('left', -left)}{handle('right', right)}</>;
}

export default VddHandles;