import { getPorts, NO_JUNCTION_DOT_TYPES } from '../constants.js';
import { toGridUnit } from '../geometry/grid.js';
import { getTransformedPort } from '../geometry/ports.js';
import { resolvePoints } from '../routing/resolveWire.js';

/**
 * Cấu trúc Disjoint Set Union (DSU) để nhóm các điểm/dây có kết nối điện với nhau
 */
class DSU {
  constructor() {
    this.parent = new Map();
  }

  find(i) {
    if (!this.parent.has(i)) {
      this.parent.set(i, i);
      return i;
    }
    if (this.parent.get(i) === i) return i;
    const root = this.find(this.parent.get(i));
    this.parent.set(i, root);
    return root;
  }

  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent.set(rootI, rootJ);
    }
  }
}

/**
 * Chuẩn hóa tên định danh SPICE: loại bỏ ký tự LaTeX, khoảng trắng
 */
export function cleanSpiceName(name) {
  if (!name) return '';
  let s = String(name).trim();
  // Bóc tách dấu bao bọc toán học $...$
  s = s.replace(/^\$+|\$+$/g, '');
  // Loại bỏ các lệnh định dạng chữ LaTeX: \text{abc}, \mathrm{abc}, v.v.
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|textit)\{([^}]*)\}/g, '$1');
  // Chuyển đổi lệnh gạch ngang đầu: \overline{Q} -> Q_b
  s = s.replace(/\\(?:overline|bar)\{([^}]*)\}/g, '$1_b');
  // Chuyển đổi chỉ số dưới LaTeX: V_{DD} -> VDD, V_{out} -> Vout, A_{1} -> A1
  s = s.replace(/_\{([^}]*)\}/g, '$1');
  // Chuyển đổi chỉ số trên LaTeX: A^{2} -> A2
  s = s.replace(/\^\{([^}]*)\}/g, '$1');
  // Chuyển đổi các chữ cái Hy Lạp phổ biến
  s = s.replace(/\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|phi|omega)/gi, '$1');
  // Xóa các ký tự \ và {} còn sót lại
  s = s.replace(/[\\{}]/g, '');
  // Thay thế khoảng trắng bằng dấu gạch dưới
  s = s.replace(/\s+/g, '_');
  // Giữ lại ký tự hợp lệ trong định danh SPICE: chữ, số, dấu gạch dưới và dấu chấm
  s = s.replace(/[^a-zA-Z0-9_\.]/g, '');
  return s;
}

/**
 * Định dạng tên gọi linh kiện Subcircuit trong SPICE:
 * Ký tự đầu tiên bắt buộc phải là X theo chuẩn SPICE/Spectre.
 * Nếu ref là R1, C1, R_1... -> chuyển chữ đầu thành X: X1, X2, X_1...
 * Tránh trùng tên bằng cách dùng Set usedSet (ví dụ X1 đã có thì C1 -> XC1).
 * Nếu ref đã bắt đầu bằng X -> giữ nguyên.
 */
export function formatSubcktRef(ref, usedSet) {
  if (!ref) {
    let idx = 1;
    while (usedSet && usedSet.has(`X${idx}`)) idx++;
    const res = `X${idx}`;
    if (usedSet) usedSet.add(res);
    return res;
  }
  const clean = cleanSpiceName(ref);
  if (/^[Xx]/i.test(clean)) {
    let res = clean;
    if (usedSet && usedSet.has(res)) {
      let idx = 1;
      while (usedSet.has(`${res}_${idx}`)) idx++;
      res = `${res}_${idx}`;
    }
    if (usedSet) usedSet.add(res);
    return res;
  }

  // Chuyển ký tự đầu R/C thành X: R1 -> X1, C2 -> X2, R_1 -> X_1
  let cand = clean;
  if (/^[RCrc]_?\d+$/.test(clean)) {
    cand = clean.replace(/^[RCrc]/i, 'X');
  } else if (/^[RCrc]_/i.test(clean)) {
    cand = clean.replace(/^[RCrc]_/i, 'X_');
  } else {
    cand = `X_${clean}`;
  }

  if (!usedSet || !usedSet.has(cand)) {
    if (usedSet) usedSet.add(cand);
    return cand;
  }

  // Nếu bị trùng (ví dụ cả R1 và C1 cùng muốn thành X1): thêm tiền tố X vào tên gốc XR1, XC1
  const cand2 = `X${clean}`;
  if (!usedSet.has(cand2)) {
    usedSet.add(cand2);
    return cand2;
  }

  // Nếu vẫn trùng thì thêm hậu tố số
  let idx = 1;
  while (usedSet.has(`${cand}_${idx}`)) idx++;
  const finalName = `${cand}_${idx}`;
  usedSet.add(finalName);
  return finalName;
}

/**
 * Trích xuất danh sách Net và sinh Netlist chuẩn SPICE từ nodes & wires
 */
/**
 * Định dạng giá trị nguồn điện (DC, PULSE, SIN, PWL) theo chuẩn SPICE
 */
function formatSourceValue(data, isVoltage) {
  const sType = data?.sourceType || 'dc';
  if (sType === 'pulse') {
    const v1 = data?.pulse_v1 ?? '0';
    const v2 = data?.pulse_v2 ?? (isVoltage ? '1.8V' : '1mA');
    const td = data?.pulse_td ?? '0';
    const tr = data?.pulse_tr ?? '1n';
    const tf = data?.pulse_tf ?? '1n';
    const pw = data?.pulse_pw ?? '5n';
    const per = data?.pulse_per ?? '10n';
    return `PULSE(${v1} ${v2} ${td} ${tr} ${tf} ${pw} ${per})`;
  }
  if (sType === 'sin') {
    const vo = data?.sin_vo ?? '0';
    const va = data?.sin_va ?? (isVoltage ? '1V' : '1mA');
    const freq = data?.sin_freq ?? '1k';
    const td = data?.sin_td ?? '0';
    const theta = data?.sin_theta ?? '0';
    const phase = data?.sin_phase ?? '0';
    return `SIN(${vo} ${va} ${freq} ${td} ${theta} ${phase})`;
  }
  if (sType === 'pwl') {
    if (Array.isArray(data?.pwl_pairs) && data.pwl_pairs.length > 0) {
      const pts = data.pwl_pairs
        .filter((p) => p && (p.t || p.v))
        .map((p) => `${p.t || '0'} ${p.v || '0'}`)
        .join(' ');
      return `PWL(${pts})`;
    }
    const pts = (data?.pwl_points ?? (isVoltage ? '0 0 1n 1.8 5n 1.8 6n 0' : '0 0 1n 1m 5n 1m 6n 0')).trim();
    return `PWL(${pts})`;
  }
  const val = data?.value ?? (isVoltage ? '1V' : '1mA');
  return `DC ${val}`;
}

export function generateSpiceNetlist(nodes = [], wires = [], options = {}) {
  const {
    circuitName = 'Schematic_Circuit',
    sheetName = 'Sheet 1',
    includeModels = true,
  } = options;

  const dsu = new DSU();

  // 1. Phân giải tọa độ tất cả các chân linh kiện (Ports)
  // portKey -> { nodeId, portId, x, y, node }
  const portMap = new Map(); // key: `nodeId.portId`
  const coordToPorts = new Map(); // key: `${gx},${gy}` -> [portObj, ...]
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    if (n.type === 'rect' || n.type === 'text') continue;
    const ports = getPorts(n.type, n.data);
    for (const p of ports) {
      const tPort = getTransformedPort(p, n);
      const px = Math.round(n.position.x) + tPort.x;
      const py = Math.round(n.position.y) + tPort.y;
      const gx = toGridUnit(px);
      const gy = toGridUnit(py);
      const coordKey = `${gx},${gy}`;
      const portKey = `${n.id}.${p.id}`;

      const portObj = { nodeId: n.id, portId: p.id, gx, gy, coordKey, portKey, node: n };
      portMap.set(portKey, portObj);

      if (!coordToPorts.has(coordKey)) {
        coordToPorts.set(coordKey, []);
      }
      coordToPorts.get(coordKey).push(portObj);
    }
  }

  // 2. Phân giải tất cả các dây (Wires) và xây dựng liên kết trong DSU
  // Dây nào chạm vào nhau hoặc chạm vào port sẽ được union
  const wireResolvedPaths = [];
  for (const w of wires) {
    if (!w.points || w.points.length < 2) continue;
    const res = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);
    if (!res || res.length < 2) continue;
    wireResolvedPaths.push({ wire: w, res });
  }

  // Khởi tạo DSU node cho mỗi dây: `wire:<wireId>`
  for (const { wire } of wireResolvedPaths) {
    dsu.find(`wire:${wire.id}`);
  }

  // Kiểm tra mối nối giữa các dây và giữa dây với chân linh kiện:
  // Duyệt qua từng đoạn thẳng của mỗi dây
  for (let idxA = 0; idxA < wireResolvedPaths.length; idxA++) {
    const { wire: wA, res: resA } = wireResolvedPaths[idxA];
    const wireKeyA = `wire:${wA.id}`;

    // Kiểm tra xem đầu mút wA có gắn trực tiếp vào port không
    [wA.points[0], wA.points[wA.points.length - 1]].forEach((pt) => {
      if (pt.nodeId && pt.portId) {
        const portKey = `${pt.nodeId}.${pt.portId}`;
        dsu.union(wireKeyA, `port:${portKey}`);
      }
    });

    for (let i = 0; i < resA.length - 1; i++) {
      const p1 = resA[i];
      const p2 = resA[i + 1];
      const minX = Math.min(toGridUnit(p1.x), toGridUnit(p2.x));
      const maxX = Math.max(toGridUnit(p1.x), toGridUnit(p2.x));
      const minY = Math.min(toGridUnit(p1.y), toGridUnit(p2.y));
      const maxY = Math.max(toGridUnit(p1.y), toGridUnit(p2.y));
      const isH = minY === maxY;

      // a) Nối dây wA với bất kỳ port nào nằm trên đoạn thẳng này
      for (const [coordKey, portsAtCoord] of coordToPorts.entries()) {
        const [cx, cy] = coordKey.split(',').map(Number);
        const onSeg = isH ? (cy === minY && cx >= minX && cx <= maxX) : (cx === minX && cy >= minY && cy <= maxY);
        if (onSeg) {
          for (const portObj of portsAtCoord) {
            dsu.union(wireKeyA, `port:${portObj.portKey}`);
          }
        }
      }

      // b) Nối dây wA với các dây khác nếu chạm nhau
      for (let idxB = idxA + 1; idxB < wireResolvedPaths.length; idxB++) {
        const { wire: wB, res: resB } = wireResolvedPaths[idxB];
        const wireKeyB = `wire:${wB.id}`;

        for (let j = 0; j < resB.length - 1; j++) {
          const q1 = resB[j];
          const q2 = resB[j + 1];
          const qMinX = Math.min(toGridUnit(q1.x), toGridUnit(q2.x));
          const qMaxX = Math.max(toGridUnit(q1.x), toGridUnit(q2.x));
          const qMinY = Math.min(toGridUnit(q1.y), toGridUnit(q2.y));
          const qMaxY = Math.max(toGridUnit(q1.y), toGridUnit(q2.y));
          const isHB = qMinY === qMaxY;

          // Kiểm tra tiếp xúc đầu mút hoặc giao nhau có nối (onWireId)
          const shareEndpoint =
            (toGridUnit(p1.x) === toGridUnit(q1.x) && toGridUnit(p1.y) === toGridUnit(q1.y)) ||
            (toGridUnit(p1.x) === toGridUnit(q2.x) && toGridUnit(p1.y) === toGridUnit(q2.y)) ||
            (toGridUnit(p2.x) === toGridUnit(q1.x) && toGridUnit(p2.y) === toGridUnit(q1.y)) ||
            (toGridUnit(p2.x) === toGridUnit(q2.x) && toGridUnit(p2.y) === toGridUnit(q2.y));

          const hasTap =
            wB.points.some((pt) => pt.onWireId === wA.id) ||
            wA.points.some((pt) => pt.onWireId === wB.id);

          if (shareEndpoint || hasTap) {
            dsu.union(wireKeyA, wireKeyB);
          }
        }
      }
    }
  }

  // Union các port trùng tọa độ trực tiếp (không cần dây)
  for (const [, portsAtCoord] of coordToPorts.entries()) {
    if (portsAtCoord.length > 1) {
      for (let k = 1; k < portsAtCoord.length; k++) {
        dsu.union(`port:${portsAtCoord[0].portKey}`, `port:${portsAtCoord[k].portKey}`);
      }
    }
  }

  // 3. Phân giải Tên Net cho từng nhóm tương đương (Net Name Resolution)
  const rootGroups = new Map(); // rootId -> Array of items ('wire:...', 'port:...')

  // Gom các port vào root
  for (const portKey of portMap.keys()) {
    const itemKey = `port:${portKey}`;
    const root = dsu.find(itemKey);
    if (!rootGroups.has(root)) rootGroups.set(root, []);
    rootGroups.get(root).push(itemKey);
  }

  // Gom các wire vào root
  for (const { wire } of wireResolvedPaths) {
    const itemKey = `wire:${wire.id}`;
    const root = dsu.find(itemKey);
    if (!rootGroups.has(root)) rootGroups.set(root, []);
    rootGroups.get(root).push(itemKey);
  }

  const rootToNetName = new Map();
  let autoNetCounter = 1;

  for (const [root, items] of rootGroups.entries()) {
    let resolvedName = null;

    // Ưu tiên 1: Nút Đất (GND) -> tên bắt buộc là '0'
    for (const item of items) {
      if (item.startsWith('port:')) {
        const pk = item.slice(5);
        const [nodeId] = pk.split('.');
        const node = nodeMap.get(nodeId);
        if (node && node.type === 'gnd') {
          resolvedName = '0';
          break;
        }
      }
    }

    // Ưu tiên 2: Nguồn VDD
    if (!resolvedName) {
      for (const item of items) {
        if (item.startsWith('port:')) {
          const pk = item.slice(5);
          const [nodeId] = pk.split('.');
          const node = nodeMap.get(nodeId);
          if (node && node.type === 'vdd') {
            resolvedName = cleanSpiceName(node.data?.reference || 'VDD') || 'VDD';
            break;
          }
        }
      }
    }

    // Ưu tiên 3: Tên do người dùng đặt (wire.name hoặc wire.labels)
    if (!resolvedName) {
      for (const item of items) {
        if (item.startsWith('wire:')) {
          const wId = item.slice(5);
          const w = wires.find((wire) => wire.id === wId);
          if (w) {
            if (w.name) {
              resolvedName = cleanSpiceName(w.name);
              if (resolvedName) break;
            }
            if (w.label) {
              resolvedName = cleanSpiceName(typeof w.label === 'string' ? w.label : w.label.text);
              if (resolvedName) break;
            }
            if (w.labels && w.labels.length > 0) {
              const lbl = w.labels[0].text || w.labels[0].name;
              resolvedName = cleanSpiceName(lbl);
              if (resolvedName) break;
            }
          }
        }
      }
    }

    // Ưu tiên 4: Tự động đặt tên N_1, N_2...
    if (!resolvedName) {
      resolvedName = `N_${autoNetCounter++}`;
    }

    rootToNetName.set(root, resolvedName);
  }

  // Hàm tra cứu tên Net của một port cụ thể
  const getPortNet = (nodeId, portId) => {
    const itemKey = `port:${nodeId}.${portId}`;
    const root = dsu.find(itemKey);
    return rootToNetName.get(root) || `NC_${nodeId}_${portId}`;
  };

  // 4. Sinh các dòng thẻ linh kiện SPICE (SPICE Element Lines)
  const lines = [];
  const modelUsage = new Map();
  const subcktUsage = new Set();
  const usedInstanceNames = new Set();

  lines.push(`* ========================================================`);
  lines.push(`* Schematic Editor SPICE Netlist Export`);
  lines.push(`* Circuit: ${circuitName} - Sheet: ${sheetName}`);
  lines.push(`* Exported Date: ${new Date().toLocaleString('en-US')}`);
  lines.push(`* ========================================================`);
  lines.push(``);

  // Nhóm linh kiện theo nhóm chức năng
  const vSources = [];
  const iSources = [];
  const passives = [];
  const transistors = [];
  const subcircuits = [];

  // Xác định tên Net nguồn VDD ưu tiên trong mạch (mặc định 'VDD')
  const vddNode = nodes.find((n) => n.type === 'vdd');
  const vddNetName = vddNode ? (cleanSpiceName(vddNode.data?.reference || 'VDD') || 'VDD') : 'VDD';

  for (const n of nodes) {
    if (n.type === 'gnd' || n.type === 'vdd' || n.type === 'rect' || n.type === 'text') continue;

    const ref = cleanSpiceName(n.data?.reference || n.id);

    const hasMultiplier = ['nmos', 'pmos', 'npn', 'pnp', 'res', 'cap'].includes(n.type);
    const mStr = hasMultiplier ? ` M=${n.data?.m ?? 1}` : '';

    switch (n.type) {
      case 'res': {
        const p1 = getPortNet(n.id, 'p1');
        const p2 = getPortNet(n.id, 'p2');
        const val = n.data?.value ? String(n.data.value).trim() : '';
        const model = cleanSpiceName(n.data?.model);
        const isDim = n.data?.resMode === 'dimension' || (!val && n.data?.w && n.data?.l);
        const m = n.data?.m ?? 1;

        if (isDim || model) {
          const w = n.data?.w || '1u';
          const l = n.data?.l || '10u';
          const rModel = model || 'RPOLY';
          const xName = formatSubcktRef(ref, usedInstanceNames);
          modelUsage.set(rModel, 'RES_SUBCKT');
          if (isDim) {
            passives.push(`${xName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${rModel.padEnd(8)} w=${w} l=${l} m=${m}`);
          } else {
            if (n.data?.w && n.data?.l) {
              passives.push(`${xName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${rModel.padEnd(8)} w=${w} l=${l} m=${m}`);
            } else {
              passives.push(`${xName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${rModel.padEnd(8)} ${val || '1k'} m=${m}`);
            }
          }
        } else {
          // Điện trở thuần lý tưởng (không model, chỉ có giá trị ohm) -> Bắt đầu bằng R
          const rName = ref.startsWith('R') ? ref : `R_${ref}`;
          usedInstanceNames.add(rName);
          passives.push(`${rName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${val || '1k'}${mStr}`);
        }
        break;
      }
      case 'cap': {
        const p1 = getPortNet(n.id, 'p1');
        const p2 = getPortNet(n.id, 'p2');
        const val = n.data?.value ? String(n.data.value).trim() : '';
        const model = cleanSpiceName(n.data?.model);
        const capMode = n.data?.capMode || 'value';
        const m = n.data?.m ?? 1;

        if (capMode === 'mom') {
          const w = n.data?.w || '2u';
          const l = n.data?.l || '10u';
          const fingers = n.data?.fingers ?? 10;
          const bot = n.data?.bot_layer || 'M2';
          const top = n.data?.top_layer || 'M5';
          const cModel = model || 'CMOM';
          const xName = formatSubcktRef(ref, usedInstanceNames);
          modelUsage.set(cModel, 'CAP_MOM');
          passives.push(`${xName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${cModel.padEnd(8)} w=${w} l=${l} fingers=${fingers} bot_layer=${bot} top_layer=${top} m=${m}`);
        } else if (capMode === 'mim') {
          const w = n.data?.w || '10u';
          const l = n.data?.l || '10u';
          const cModel = model || 'CMIM';
          const xName = formatSubcktRef(ref, usedInstanceNames);
          modelUsage.set(cModel, 'CAP_MIM');
          passives.push(`${xName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${cModel.padEnd(8)} w=${w} l=${l} m=${m}`);
        } else if (model) {
          const xName = formatSubcktRef(ref, usedInstanceNames);
          modelUsage.set(model, 'CAP_SUBCKT');
          passives.push(`${xName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${model.padEnd(8)} ${val || '1p'} m=${m}`);
        } else {
          // Tụ điện thuần lý tưởng (không model, chỉ có giá trị F) -> Bắt đầu bằng C
          const cName = ref.startsWith('C') ? ref : `C_${ref}`;
          usedInstanceNames.add(cName);
          passives.push(`${cName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${val || '1p'}${mStr}`);
        }
        break;
      }
      case 'vsource': {
        const p1 = getPortNet(n.id, 'p1');
        const p2 = getPortNet(n.id, 'p2');
        const vName = ref.startsWith('V') ? ref : `V_${ref}`;
        usedInstanceNames.add(vName);
        const srcExpr = formatSourceValue(n.data, true);
        vSources.push(`${vName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${srcExpr}`);
        break;
      }
      case 'isource': {
        const p1 = getPortNet(n.id, 'p1');
        const p2 = getPortNet(n.id, 'p2');
        const iName = ref.startsWith('I') ? ref : `I_${ref}`;
        usedInstanceNames.add(iName);
        const srcExpr = formatSourceValue(n.data, false);
        iSources.push(`${iName.padEnd(8)} ${p1.padEnd(8)} ${p2.padEnd(8)} ${srcExpr}`);
        break;
      }
      case 'nmos': {
        const d = getPortNet(n.id, 'drain');
        const g = getPortNet(n.id, 'gate');
        const s = getPortNet(n.id, 'source');
        const b = '0'; // Cực Bulk (B) của NMOS luôn nối xuống GND (node 0 trong SPICE)
        const w = n.data?.w || '1u';
        const l = n.data?.l || '150n';
        const mName = ref.startsWith('M') ? ref : `M_${ref}`;
        usedInstanceNames.add(mName);
        const model = cleanSpiceName(n.data?.model) || 'NMOS';
        modelUsage.set(model, 'NMOS');
        transistors.push(`${mName.padEnd(8)} ${d.padEnd(8)} ${g.padEnd(8)} ${s.padEnd(8)} ${b.padEnd(8)} ${model.padEnd(6)} W=${w} L=${l}${mStr}`);
        break;
      }
      case 'pmos': {
        const d = getPortNet(n.id, 'drain');
        const g = getPortNet(n.id, 'gate');
        const s = getPortNet(n.id, 'source');
        const b = vddNetName; // Cực Bulk (B) của PMOS luôn nối lên VDD
        const w = n.data?.w || '1u';
        const l = n.data?.l || '150n';
        const mName = ref.startsWith('M') ? ref : `M_${ref}`;
        usedInstanceNames.add(mName);
        const model = cleanSpiceName(n.data?.model) || 'PMOS';
        modelUsage.set(model, 'PMOS');
        transistors.push(`${mName.padEnd(8)} ${d.padEnd(8)} ${g.padEnd(8)} ${s.padEnd(8)} ${b.padEnd(8)} ${model.padEnd(6)} W=${w} L=${l}${mStr}`);
        break;
      }
      case 'npn': {
        const c = getPortNet(n.id, 'collector');
        const b = getPortNet(n.id, 'base');
        const e = getPortNet(n.id, 'emitter');
        const qName = ref.startsWith('Q') ? ref : `Q_${ref}`;
        usedInstanceNames.add(qName);
        const model = cleanSpiceName(n.data?.model) || 'NPN';
        modelUsage.set(model, 'NPN');
        transistors.push(`${qName.padEnd(8)} ${c.padEnd(8)} ${b.padEnd(8)} ${e.padEnd(8)} ${model}${mStr}`);
        break;
      }
      case 'pnp': {
        const c = getPortNet(n.id, 'collector');
        const b = getPortNet(n.id, 'base');
        const e = getPortNet(n.id, 'emitter');
        const qName = ref.startsWith('Q') ? ref : `Q_${ref}`;
        usedInstanceNames.add(qName);
        const model = cleanSpiceName(n.data?.model) || 'PNP';
        modelUsage.set(model, 'PNP');
        transistors.push(`${qName.padEnd(8)} ${c.padEnd(8)} ${b.padEnd(8)} ${e.padEnd(8)} ${model}${mStr}`);
        break;
      }
      case 'opamp': {
        const inp = portMap.has(`${n.id}.inp`) ? getPortNet(n.id, 'inp') : getPortNet(n.id, 'in2');
        const inn = portMap.has(`${n.id}.inn`) ? getPortNet(n.id, 'inn') : getPortNet(n.id, 'in1');
        const out = getPortNet(n.id, 'out');
        const xName = formatSubcktRef(ref, usedInstanceNames);
        const model = cleanSpiceName(n.data?.model) || 'OPAMP';
        subcktUsage.add(model);
        subcircuits.push(`${xName.padEnd(8)} ${inp.padEnd(8)} ${inn.padEnd(8)} ${out.padEnd(8)} ${model}`);
        break;
      }
      case 'fdopamp': {
        const inp = portMap.has(`${n.id}.inp`) ? getPortNet(n.id, 'inp') : getPortNet(n.id, 'in2');
        const inn = portMap.has(`${n.id}.inn`) ? getPortNet(n.id, 'inn') : getPortNet(n.id, 'in1');
        const outp = portMap.has(`${n.id}.outp`) ? getPortNet(n.id, 'outp') : getPortNet(n.id, 'out1');
        const outn = portMap.has(`${n.id}.outn`) ? getPortNet(n.id, 'outn') : getPortNet(n.id, 'out2');
        const xName = formatSubcktRef(ref, usedInstanceNames);
        const model = cleanSpiceName(n.data?.model) || 'FD_OPAMP';
        subcktUsage.add(model);
        subcircuits.push(`${xName.padEnd(8)} ${inp.padEnd(8)} ${inn.padEnd(8)} ${outp.padEnd(8)} ${outn.padEnd(8)} ${model}`);
        break;
      }
      case 'inverter':
      case 'buffer': {
        const inPin = getPortNet(n.id, 'in');
        const outPin = getPortNet(n.id, 'out');
        const defaultGate = n.type === 'inverter' ? 'INV' : 'BUF';
        const model = cleanSpiceName(n.data?.model) || defaultGate;
        const xName = formatSubcktRef(ref, usedInstanceNames);
        subcircuits.push(`${xName.padEnd(8)} ${inPin.padEnd(8)} ${outPin.padEnd(8)} ${vddNetName} 0 ${model}`);
        break;
      }
      case 'and':
      case 'or':
      case 'nand':
      case 'nor':
      case 'xor':
      case 'xnor': {
        const nInputs = Math.max(2, Math.min(16, Math.round(Number(n.data?.inputs) || 2)));
        const inNets = [];
        for (let i = 1; i <= nInputs; i++) {
          inNets.push(getPortNet(n.id, `in${i}`));
        }
        const outPin = getPortNet(n.id, 'out');
        const defaultGate = `${n.type.toUpperCase()}_${nInputs}`;
        const model = cleanSpiceName(n.data?.model) || defaultGate;
        const xName = formatSubcktRef(ref, usedInstanceNames);
        subcircuits.push(`${xName.padEnd(8)} ${inNets.map((pin) => pin.padEnd(8)).join(' ')} ${outPin.padEnd(8)} ${vddNetName} 0 ${model}`);
        break;
      }
      case 'dff': {
        const d = getPortNet(n.id, 'd');
        const clk = getPortNet(n.id, 'clk');
        const en = getPortNet(n.id, 'en');
        const rst = getPortNet(n.id, 'rst');
        const q = getPortNet(n.id, 'q');
        const qn = getPortNet(n.id, 'qn');
        const model = cleanSpiceName(n.data?.model) || 'DFF';
        const xName = formatSubcktRef(ref, usedInstanceNames);
        subcircuits.push(`${xName.padEnd(8)} ${d.padEnd(8)} ${clk.padEnd(8)} ${en.padEnd(8)} ${rst.padEnd(8)} ${q.padEnd(8)} ${qn.padEnd(8)} ${vddNetName} 0 ${model}`);
        break;
      }
      case 'dff_sr': {
        const d = getPortNet(n.id, 'd');
        const clk = getPortNet(n.id, 'clk');
        const set = getPortNet(n.id, 'set');
        const rst = getPortNet(n.id, 'rst');
        const q = getPortNet(n.id, 'q');
        const qn = getPortNet(n.id, 'qn');
        const model = cleanSpiceName(n.data?.model) || 'DFF_SR';
        const xName = formatSubcktRef(ref, usedInstanceNames);
        subcircuits.push(`${xName.padEnd(8)} ${d.padEnd(8)} ${clk.padEnd(8)} ${set.padEnd(8)} ${rst.padEnd(8)} ${q.padEnd(8)} ${qn.padEnd(8)} ${vddNetName} 0 ${model}`);
        break;
      }
      case 'mux': {
        const in0 = getPortNet(n.id, 'in0');
        const in1 = getPortNet(n.id, 'in1');
        const sel = getPortNet(n.id, 'sel');
        const out = getPortNet(n.id, 'out');
        const model = cleanSpiceName(n.data?.model) || 'MUX';
        const xName = formatSubcktRef(ref, usedInstanceNames);
        subcircuits.push(`${xName.padEnd(8)} ${in0.padEnd(8)} ${in1.padEnd(8)} ${sel.padEnd(8)} ${out.padEnd(8)} ${vddNetName} 0 ${model}`);
        break;
      }
      case 'sw_open':
      case 'sw_closed': {
        const inPin = getPortNet(n.id, 'in');
        const outPin = getPortNet(n.id, 'out');
        const val = n.type === 'sw_closed' ? '1m' : '100Meg';
        const rName = ref.startsWith('R') ? ref : `RSW_${ref}`;
        usedInstanceNames.add(rName);
        passives.push(`${rName.padEnd(8)} ${inPin.padEnd(8)} ${outPin.padEnd(8)} ${val} ; Switch (${n.type})`);
        break;
      }
      default: {
        // Fallback linh kiện khác: liệt kê tất cả các port
        const ports = getPorts(n.type, n.data);
        const portNets = ports.map((p) => getPortNet(n.id, p.id));
        const xName = formatSubcktRef(ref, usedInstanceNames);
        subcircuits.push(`${xName.padEnd(8)} ${portNets.join(' ')} ${n.type.toUpperCase()}`);
        break;
      }
    }
  }

  // Nối các khối vào file
  if (vSources.length > 0 || iSources.length > 0) {
    lines.push(`* --- Power and Independent Sources ---`);
    vSources.forEach((l) => lines.push(l));
    iSources.forEach((l) => lines.push(l));
    lines.push(``);
  }

  if (transistors.length > 0) {
    lines.push(`* --- Active Transistors ---`);
    transistors.forEach((l) => lines.push(l));
    lines.push(``);
  }

  if (passives.length > 0) {
    lines.push(`* --- Passive Components ---`);
    passives.forEach((l) => lines.push(l));
    lines.push(``);
  }

  if (subcircuits.length > 0) {
    lines.push(`* --- Subcircuit Blocks / Gates ---`);
    subcircuits.forEach((l) => lines.push(l));
    lines.push(``);
  }

  // Định nghĩa mô hình cơ bản (Basic Models & Subcircuits)
  if (includeModels && (modelUsage.size > 0 || subcktUsage.size > 0)) {
    lines.push(`* --- Device Models & Subcircuits ---`);
    for (const [modelName, baseType] of modelUsage.entries()) {
      if (baseType === 'NMOS') {
        lines.push(`.model ${modelName} NMOS (LEVEL=1 VTO=0.7 KP=100u GAMMA=0.4 PHI=0.6 LAMBDA=0.01)`);
      } else if (baseType === 'PMOS') {
        lines.push(`.model ${modelName} PMOS (LEVEL=1 VTO=-0.7 KP=50u GAMMA=0.4 PHI=0.6 LAMBDA=0.02)`);
      } else if (baseType === 'NPN') {
        lines.push(`.model ${modelName} NPN (BF=100 IS=1e-16 VAF=100)`);
      } else if (baseType === 'PNP') {
        lines.push(`.model ${modelName} PNP (BF=100 IS=1e-16 VAF=100)`);
      } else if (baseType === 'RES') {
        lines.push(`.model ${modelName} R`);
      } else if (baseType === 'CAP') {
        lines.push(`.model ${modelName} C`);
      } else if (baseType === 'RES_SUBCKT') {
        lines.push(`.subckt ${modelName} 1 2 w=1u l=10u m=1`);
        lines.push(`R1 1 2 1k`);
        lines.push(`.ends ${modelName}`);
      } else if (baseType === 'CAP_MIM') {
        lines.push(`.subckt ${modelName} 1 2 w=10u l=10u m=1`);
        lines.push(`C1 1 2 1p`);
        lines.push(`.ends ${modelName}`);
      } else if (baseType === 'CAP_MOM') {
        lines.push(`.subckt ${modelName} 1 2 w=2u l=10u fingers=10 bot_layer=M2 top_layer=M5 m=1`);
        lines.push(`C1 1 2 1p`);
        lines.push(`.ends ${modelName}`);
      } else if (baseType === 'CAP_SUBCKT') {
        lines.push(`.subckt ${modelName} 1 2`);
        lines.push(`C1 1 2 1p`);
        lines.push(`.ends ${modelName}`);
      }
    }
    if (subcktUsage.has('OPAMP')) {
      lines.push(`.subckt OPAMP INP INN OUT`);
      lines.push(`E1 OUT 0 INP INN 100k`);
      lines.push(`R1 OUT 0 100Meg`);
      lines.push(`.ends OPAMP`);
    }
    if (subcktUsage.has('FD_OPAMP')) {
      lines.push(`.subckt FD_OPAMP INP INN OUTP OUTN`);
      lines.push(`E1 OUTP 0 INP INN 50k`);
      lines.push(`E2 OUTN 0 INN INP 50k`);
      lines.push(`R1 OUTP 0 100Meg`);
      lines.push(`R2 OUTN 0 100Meg`);
      lines.push(`.ends FD_OPAMP`);
    }
    lines.push(``);
  }

  lines.push(`.end`);
  lines.push(``);

  return lines.join('\n');
}
