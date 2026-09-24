export const GRID = 10;
export const SNAP_RADIUS = 15;

export const PORTS = [
  { id: 'gate',   x: 20, y: 50 },
  { id: 'drain',  x: 50, y: 30 },
  { id: 'source', x: 50, y: 70 },
];

export const NPN_PORTS = [
  { id: 'base',      x: 20, y: 50, dir: { x: -1, y: 0 } },
  { id: 'collector', x: 50, y: 30, dir: { x: 0, y: -1 } },
  { id: 'emitter',   x: 50, y: 70, dir: { x: 0, y: 1 } },
];
// PNP: emitter nằm TRÊN, collector nằm DƯỚI
export const PNP_PORTS = [
  { id: 'base',      x: 20, y: 50, dir: { x: -1, y: 0 } },
  { id: 'emitter',   x: 50, y: 30, dir: { x: 0, y: -1 } },
  { id: 'collector', x: 50, y: 70, dir: { x: 0, y: 1 } },
];

// Linh kiện 2 chân (điện trở, tụ điện)
export const TWO_TERM_PORTS = [
  { id: 'p1', x: 50, y: 30, dir: { x: 0, y: -1 } },
  { id: 'p2', x: 50, y: 70, dir: { x: 0, y: 1 } },
];

export const VDD_PORTS = [{ id: 'p', x: 50, y: 70, dir: { x: 0, y: 1 } }];
export const GND_PORTS = [{ id: 'p', x: 50, y: 30, dir: { x: 0, y: -1 } }];
export const OPAMP_PORTS = [
  { id: 'inn', x: 10, y: 30, dir: { x: -1, y: 0 } },
  { id: 'inp', x: 10, y: 70, dir: { x: -1, y: 0 } },
  { id: 'out', x: 80, y: 50, dir: { x: 1, y: 0 } },
];
export const FD_OPAMP_PORTS = [
  { id: 'inp',  x: 10, y: 30, dir: { x: -1, y: 0 } },
  { id: 'inn',  x: 10, y: 70, dir: { x: -1, y: 0 } },
  { id: 'outn', x: 80, y: 30, dir: { x: 1, y: 0 } },
  { id: 'outp', x: 80, y: 70, dir: { x: 1, y: 0 } },
];

export const PORTS_BY_TYPE = {
  npn: NPN_PORTS, pnp: PNP_PORTS, res: TWO_TERM_PORTS, cap: TWO_TERM_PORTS,
  vdd: VDD_PORTS, gnd: GND_PORTS, opamp: OPAMP_PORTS, fdopamp: FD_OPAMP_PORTS,
};

export const getPorts = (type) => PORTS_BY_TYPE[type] || PORTS;

// Hộp bao của ký hiệu (toạ độ trong node 160x100, chưa xoay)
export const DEFAULT_SYMBOL_BOX = { x: 16, y: 27, w: 36, h: 46 };
export const SYMBOL_BOX_BY_TYPE = {
  res: { x: 40, y: 27, w: 20, h: 46 },
  cap: { x: 40, y: 27, w: 20, h: 46 },
  vdd: { x: 36, y: 46, w: 28, h: 26 },
  gnd: { x: 40, y: 27, w: 20, h: 28 },
  opamp: { x: 6, y: 16, w: 78, h: 68 },
  fdopamp: { x: 6, y: 16, w: 78, h: 68 },
};
export const getSymbolBox = (type) => SYMBOL_BOX_BY_TYPE[type] || DEFAULT_SYMBOL_BOX;

export const MID_WIRE_SNAP_RADIUS = 5; // chỉ hút vào GIỮA dây khi click rất sát (nửa ô lưới)

export const OBSTACLE_MARGIN = GRID;    // khoảng hở giữa dây và thân linh kiện

// ============ THƯ VIỆN LINH KIỆN ============
export const COMPONENT_LIBRARY = [
  { type: 'nmos', label: 'NMOS', refPrefix: 'M', defaultData: { w: '1u', l: '150n' } },
  // Thêm linh kiện khác ở đây sau này, ví dụ:
  { type: 'pmos', label: 'PMOS', refPrefix: 'M', defaultData: { w: '1u', l: '150n' } },
  
  { type: 'npn', label: 'BJT NPN', refPrefix: 'Q', defaultData: {} },
  
  { type: 'pnp', label: 'BJT PNP', refPrefix: 'Q', defaultData: {} },
  
  { type: 'res', label: 'Điện trở', refPrefix: 'R', defaultData: { value: '1k' } },
  
  { type: 'cap', label: 'Tụ điện', refPrefix: 'C', defaultData: { value: '1p' } },
  
  { type: 'vdd', label: 'VDD rail', refPrefix: 'VDD', defaultData: { reference: 'VDD' } },
  
  { type: 'gnd', label: 'Ground', refPrefix: 'GND', defaultData: {} },
  
  { type: 'opamp', label: 'Opamp', refPrefix: 'U', defaultData: {} },
  
  { type: 'fdopamp', label: 'FD opamp', refPrefix: 'U', defaultData: {} },
];