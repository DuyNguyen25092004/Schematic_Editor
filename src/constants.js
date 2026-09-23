export const GRID = 10;
export const SNAP_RADIUS = 15;

export const PORTS = [
  { id: 'gate',   x: 20, y: 50 },
  { id: 'drain',  x: 50, y: 30 },
  { id: 'source', x: 50, y: 70 },
];

export const MID_WIRE_SNAP_RADIUS = 5; // chỉ hút vào GIỮA dây khi click rất sát (nửa ô lưới)

export const OBSTACLE_MARGIN = GRID;    // khoảng hở giữa dây và thân linh kiện

// ============ THƯ VIỆN LINH KIỆN ============
export const COMPONENT_LIBRARY = [
  { type: 'nmos', label: 'NMOS', refPrefix: 'M', defaultData: { w: '1u', l: '150n' } },
  // Thêm linh kiện khác ở đây sau này, ví dụ:
  { type: 'pmos', label: 'PMOS', refPrefix: 'M', defaultData: { w: '1u', l: '150n' } },
];