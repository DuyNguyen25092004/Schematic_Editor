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

// VDD rail: một thanh ngang dài, KHÔNG có chân riêng — dây hút vào
// BẤT KỲ điểm lưới nào dọc theo thanh (r0..r10, cách nhau 1 ô lưới).
// Chân đặt tên theo ĐỘ LỆCH (ô lưới) so với gốc x0: r-3, r0, r5...
// nên kéo dài sang trái/phải không làm đổi tên các chân đã có dây nối.
// Thanh trải từ -left đến +right (node.data.left / node.data.len, đơn vị: ô lưới).
export const VDD_BAR = { x0: 10, y: 50 };
export const VDD_DEFAULT_LEN = 10;
export const VDD_MIN_LEN = 2;      // tổng chiều dài tối thiểu (ô)
export const VDD_MAX_EXT = 60;     // tối đa mỗi phía (ô)
const clampExt = (v, d) => {
  const n = Math.round(Number(v ?? d));
  return Math.min(VDD_MAX_EXT, Math.max(0, Number.isFinite(n) ? n : d));
};
export const getVddSpan = (data) => {
  const left = clampExt(data?.left, 0);
  let right = clampExt(data?.len, VDD_DEFAULT_LEN);
  if (left + right < VDD_MIN_LEN) right = VDD_MIN_LEN - left;
  return { left, right };
};
export const makeVddPorts = ({ left, right }) => {
  const ports = [];
  for (let k = -left; k <= right; k++) {
    ports.push({ id: `r${k}`, x: VDD_BAR.x0 + k * GRID, y: VDD_BAR.y, dir: { x: 0, y: 1 } });
  }
  return ports;
};
export const VDD_PORTS = makeVddPorts({ left: 0, right: VDD_DEFAULT_LEN });
export const parseVddPort = (id) => {
  const m = /^r(-?\d+)$/.exec(id || '');
  return m ? Number(m[1]) : null;
};

// Loại linh kiện mà dây nối vào KHÔNG hiện chấm tròn giao điểm
export const NO_JUNCTION_DOT_TYPES = new Set(['vdd']);
// Tên chân cũ (file đã lưu trước khi đổi VDD sang dạng thanh) -> chân mới
const PORT_ALIASES = { vdd: { p: 'r4' } };

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

// data: chỉ VDD cần (số chân phụ thuộc độ dài thanh)
export const getPorts = (type, data) =>
  (type === 'vdd' ? makeVddPorts(getVddSpan(data)) : (PORTS_BY_TYPE[type] || PORTS));

export const findPort = (type, portId, data) => {
  const ports = getPorts(type, data);
  const id = PORT_ALIASES[type]?.[portId] || portId;
  const found = ports.find((p) => p.id === id);
  // Thanh bị thu ngắn hơn chân đang gắn -> dính vào đầu mút gần nhất thay vì mất kết nối
  if (!found && type === 'vdd') {
    const k = parseVddPort(id);
    if (k !== null) return k > 0 ? ports[ports.length - 1] : ports[0];
  }
  return found;
};

// Hộp bao của ký hiệu (toạ độ trong node 160x100, chưa xoay)
export const DEFAULT_SYMBOL_BOX = { x: 16, y: 27, w: 36, h: 46 };
export const SYMBOL_BOX_BY_TYPE = {
  res: { x: 40, y: 27, w: 20, h: 46 },
  cap: { x: 40, y: 27, w: 20, h: 46 },
  vdd: { x: 6, y: 42, w: 108, h: 16 },
  gnd: { x: 40, y: 27, w: 20, h: 28 },
  opamp: { x: 6, y: 16, w: 78, h: 68 },
  fdopamp: { x: 6, y: 16, w: 78, h: 68 },
};
export const getSymbolBox = (type, data) => {
  if (type === 'vdd') {
    const { left, right } = getVddSpan(data);
    return { x: 6 - left * GRID, y: 42, w: (left + right) * GRID + 8, h: 16 };
  }
  return SYMBOL_BOX_BY_TYPE[type] || DEFAULT_SYMBOL_BOX;
};

export const MID_WIRE_SNAP_RADIUS = 5; // chỉ hút vào GIỮA dây khi click rất sát (nửa ô lưới)

export const OBSTACLE_MARGIN = GRID;    // khoảng hở giữa dây và thân linh kiện

// Nhóm hiển thị trong sidebar (theo thứ tự). Mỗi linh kiện có `category` trỏ tới id ở đây
// và `short` = tên ngắn hiện dưới icon (label = tên đầy đủ, dùng làm tooltip / menu nhanh).
export const COMPONENT_CATEGORIES = [
  { id: 'transistors', label: 'Transistors' },
  { id: 'passives',    label: 'Passives' },
  { id: 'power',       label: 'Power and Ports' },
  { id: 'analog',      label: 'Analog Blocks' },
];

// ============ THƯ VIỆN LINH KIỆN ============
export const COMPONENT_LIBRARY = [
  { type: 'nmos',    category: 'transistors', short: 'NMOS',    label: 'NMOS',      refPrefix: 'M',   defaultData: { w: '1u', l: '150n' } },
  { type: 'pmos',    category: 'transistors', short: 'PMOS',    label: 'PMOS',      refPrefix: 'M',   defaultData: { w: '1u', l: '150n' } },
  { type: 'npn',     category: 'transistors', short: 'NPN',     label: 'BJT NPN',   refPrefix: 'Q',   defaultData: {} },
  { type: 'pnp',     category: 'transistors', short: 'PNP',     label: 'BJT PNP',   refPrefix: 'Q',   defaultData: {} },
  { type: 'res',     category: 'passives',    short: 'Res',     label: 'Điện trở',  refPrefix: 'R',   defaultData: { value: '1k' } },
  { type: 'cap',     category: 'passives',    short: 'Cap',     label: 'Tụ điện',   refPrefix: 'C',   defaultData: { value: '1p' } },
  { type: 'vdd',     category: 'power',       short: 'VDD',     label: 'VDD rail',  refPrefix: 'VDD', defaultData: { reference: 'VDD' } },
  { type: 'gnd',     category: 'power',       short: 'Ground',  label: 'Ground',    refPrefix: 'GND', defaultData: {} },
  { type: 'opamp',   category: 'analog',      short: 'Opamp',   label: 'Opamp',     refPrefix: 'U',   defaultData: {} },
  { type: 'fdopamp', category: 'analog',      short: 'FD Opamp', label: 'FD opamp', refPrefix: 'U',   defaultData: {} },
];