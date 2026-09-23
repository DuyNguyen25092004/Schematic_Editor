import React from 'react';


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

// Đăng ký symbol theo type — muốn thêm linh kiện mới (điện trở, tụ, ...) chỉ cần thêm 1 dòng ở đây
export const SYMBOLS = {
  nmos: NmosSymbol,
  pmos: PmosSymbol,
};

// Icon nhỏ trong sidebar — CHỈ để hiển thị danh sách, không dùng làm ảnh kéo
export function MiniIcon({ type }) {
  const Symbol = SYMBOLS[type] || NmosSymbol;
  return (
    <svg
      width="28" height="20" viewBox="0 0 160 100"
      style={{ width: 28, height: 20, flexShrink: 0, display: 'block' }}
    >
      <Symbol strokeWidth={6} />
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

