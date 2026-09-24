import React from 'react';
import { GRID, VDD_BAR, getVddSpan, getSymbolBox } from '../constants';

// ============ SYMBOL REGISTRY — thêm linh kiện mới chỉ cần đăng ký ở đây ============
export function NmosSymbol({ strokeWidth = 2 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" fill="none">
      <line x1="20" y1="50" x2="28" y2="50" />
      <rect x="28" y="40" width="3" height="20" fill="#000" stroke="none" />
      <rect x="33" y="37" width="3" height="26" fill="#000" stroke="none" />
      <polyline points="50,30 50,43 36,43" />
      <polyline points="50,70 50,57 36,57" />
      <polygon points="50,57 41,53 41,61" fill="#000" stroke="none" />
    </g>
  );
}

export function PmosSymbol({ strokeWidth = 2 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" fill="none">
      {/* Kéo dài đường gate và bỏ vòng tròn */}
      <line x1="20" y1="50" x2="28" y2="50" />
      <rect x="28" y="40" width="3" height="20" fill="#000" stroke="none" />
      <rect x="33" y="37" width="3" height="26" fill="#000" stroke="none" />
      <polyline points="50,30 50,43 36,43" />
      <polyline points="50,70 50,57 36,57" />
      {/* Mũi tên quay ngược chiều so với NMOS */}
      <polygon points="36,43 45,39 45,47" fill="#000" stroke="none" />
    </g>
  );
}

export function NpnSymbol({ strokeWidth = 2 }) {
  const bar = strokeWidth * 1.5; // thanh base dày hơn
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" fill="none" shapeRendering="crispEdges">      
      <line x1="20" y1="50" x2="33.131113" y2="50" />
      <line x1="33.131113" y1="36.654393" x2="33.131113" y2="63.32954" strokeWidth={bar} />
      <polyline points="33.131113,43.598474 50,36.620268 50,30" />
      <line x1="33.131113" y1="56.403673" x2="42.69929" y2="60.358712" />
      <polyline points="49.063944,62.990761 50,63.377859 50,70" />
      <polygon points="43.364905,56.792086 40.047357,63.377859 50,63.377859" fill="#000" stroke="none" />
    </g>
  );
}

export function PnpSymbol({ strokeWidth = 2 }) {
  const bar = strokeWidth * 1.5;
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" fill="none" shapeRendering="crispEdges">
      {/* Base */}
      <line x1="20" y1="50" x2="33.131113" y2="50" />
      <line x1="33.131113" y1="36.666443" x2="33.131113" y2="63.34159" strokeWidth={bar} />
      {/* Emitter (đi lên, mũi tên hướng vào base) */}
      <polyline points="41.424982,40.305587 50,36.620268 50,30" />
      <polygon points="39.766208,37.012701 43.083756,43.598474 33.131113,43.598474" fill="#000" stroke="none" />
      {/* Collector (đi xuống) */}
      <polyline points="33.131113,56.401526 50,63.377859 50,70" />
    </g>
  );
}

export function ResistorSymbol({ strokeWidth = 2 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={12} fill="none">
      <g shapeRendering="crispEdges">
        <line x1="50" y1="30" x2="50" y2="41.94" />
        <line x1="50" y1="57.94" x2="50" y2="70" />
      </g>
      <polyline points="50,41.27907 55.372093,43.604651 45.395349,45.930233 55.372093,48.837209 45.011628,51.744186 55.372093,54.651163 45.395349,57.55814 50,58.72093" />
    </g>
  );
}

export function CapacitorSymbol({ strokeWidth = 2 }) {
  const plate = strokeWidth * 1.5;
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" fill="none" shapeRendering="crispEdges">
      <line x1="50" y1="30" x2="50" y2="46.766395" />
      <line x1="50" y1="53.233605" x2="50" y2="70" />
      <line x1="41.94936" y1="46.766395" x2="58.05064" y2="46.766395" strokeWidth={plate} />
      <line x1="41.94936" y1="53.233605" x2="58.05064" y2="53.233605" strokeWidth={plate} />
    </g>
  );
}

export function VddSymbol({ strokeWidth = 2, data }) {
  const bar = strokeWidth * 2;
  const { left, right } = getVddSpan(data);
  return (
    <rect x={VDD_BAR.x0 - left * GRID} y={VDD_BAR.y - bar / 2} width={(left + right) * GRID} height={bar}
          fill="#000" stroke="none" shapeRendering="crispEdges" />
  );
}

export function GroundSymbol({ strokeWidth = 2 }) {
  const plate = strokeWidth * 2;
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" fill="none" shapeRendering="crispEdges">
      <line x1="50" y1="30" x2="50" y2="40" />
      <line x1="43.604651" y1="40" x2="56.395349" y2="40" strokeWidth={plate} />
      <line x1="45.930233" y1="45.813953" x2="54.069767" y2="45.813953" strokeWidth={plate} />
      <line x1="47.674419" y1="51.046512" x2="52.325581" y2="51.046512" strokeWidth={plate} />
    </g>
  );
}

// Dấu + / − nhỏ dùng chung cho opamp
function Plus({ x, y, sw }) {
  return (
    <g stroke="#000" strokeWidth={sw} strokeLinecap="round" fill="none">
      <line x1={x - 3} y1={y} x2={x + 3} y2={y} />
      <line x1={x} y1={y - 3} x2={x} y2={y + 3} />
    </g>
  );
}
function Minus({ x, y, sw }) {
  return <line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke="#000" strokeWidth={sw} strokeLinecap="round" />;
}

export function OpampSymbol({ strokeWidth = 2 }) {
  return (
    <g fill="none">
      <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" shapeRendering="crispEdges">
        <line x1="10" y1="30" x2="20" y2="30" />
        <line x1="10" y1="70" x2="20" y2="70" />
        <line x1="71.961524" y1="50" x2="80" y2="50" />
      </g>
      <path d="M 20 20 L 20 80 L 71.961524 50 Z" stroke="#000" strokeWidth={strokeWidth * 1.5}
            strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <Minus x={26.25} y={36} sw={strokeWidth} />
      <Plus x={26.25} y={64} sw={strokeWidth} />
    </g>
  );
}

export function FdOpampSymbol({ strokeWidth = 2 }) {
  return (
    <g fill="none">
      <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" shapeRendering="crispEdges">
        <line x1="10" y1="30" x2="20" y2="30" />
        <line x1="10" y1="70" x2="20" y2="70" />
        <line x1="37.320508" y1="30" x2="80" y2="30" />
        <line x1="37.320508" y1="70" x2="80" y2="70" />
      </g>
      <path d="M 20 20 L 20 80 L 71.961524 50 Z" stroke="#000" strokeWidth={strokeWidth * 1.5}
            strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <Plus x={26.25} y={36} sw={strokeWidth} />
      <Minus x={26.25} y={64} sw={strokeWidth} />
      <Minus x={36.461524} y={36} sw={strokeWidth} />
      <Plus x={36.461524} y={64} sw={strokeWidth} />
    </g>
  );
}

// Đăng ký symbol theo type — muốn thêm linh kiện mới (điện trở, tụ, ...) chỉ cần thêm 1 dòng ở đây
export const SYMBOLS = {
  nmos: NmosSymbol,
  pmos: PmosSymbol,
  npn: NpnSymbol,
  pnp: PnpSymbol,
  res: ResistorSymbol,
  cap: CapacitorSymbol,
  vdd: VddSymbol,
  gnd: GroundSymbol,
  opamp: OpampSymbol,
  fdopamp: FdOpampSymbol,
};

// Icon nhỏ trong sidebar / menu nhanh — CHỈ để hiển thị, không dùng làm ảnh kéo.
// Cắt viewBox theo hộp bao của ký hiệu để icon lấp đầy khung, nét vẽ giữ ~1.8px dù phóng to/thu nhỏ.
export function MiniIcon({ type, width = 28, height = 20 }) {
  const Symbol = SYMBOLS[type] || NmosSymbol;
  const box = getSymbolBox(type);
  const pad = 6;
  const vbX = box.x - pad, vbY = box.y - pad, vbW = box.w + pad * 2, vbH = box.h + pad * 2;
  const scale = Math.min(width / vbW, height / vbH);
  const sw = Math.min(6, Math.max(2, 1.8 / scale));
  return (
    <svg
      width={width} height={height} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      style={{ width, height, flexShrink: 0, display: 'block' }}
    >
      <Symbol strokeWidth={sw} />
    </svg>
  );
}

// Ghost icon full-size DÙNG CHUNG cho mọi symbol — luôn ép width/height bằng inline style
// để không bị bất kỳ CSS global nào (của ReactFlow hay thư viện khác) đè kích thước.
export function GhostIcon({ type }) {
  const Symbol = SYMBOLS[type] || NmosSymbol;
  return (
    <svg
      viewBox="0 0 160 100"
      style={{ width: 160, height: 100, display: 'block' }}
    >
      <Symbol strokeWidth={2} />
    </svg>
  );
}

