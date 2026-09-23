
// Bounding box thật của ký hiệu MOSFET trong hệ tọa độ flow (đã tính xoay + lật),
// khớp với vùng viền xanh khi chọn node — dùng để box-select cho đúng kích thước
// nhìn thấy, thay vì dùng cả khung 160x100 ẩn.
export function getSymbolBBox(node) {
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
export const PORT_OUT_DIRECTION = {
  gate: { x: -1, y: 0 },
  drain: { x: 0, y: -1 },
  source: { x: 0, y: 1 },
};

// Xoay/lật hướng đi ra theo đúng rot/flip của node — dùng CHUNG logic xoay với getTransformedPort
// nhưng không có phép tịnh tiến (vì đây là vector hướng, không phải toạ độ điểm)
export function getTransformedPortDirection(portId, node) {
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

export function getTransformedPort(port, node) {
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
