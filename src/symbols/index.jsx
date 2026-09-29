import React from 'react';
import { GRID, VDD_BAR, getVddSpan, getSymbolBox } from '../constants';

// ============ SYMBOL REGISTRY — thêm linh kiện mới chỉ cần đăng ký ở đây ============
export function NmosSymbol({ strokeWidth = 1.5 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" fill="none">
      <line x1="20" y1="50" x2="28" y2="50" />
      <rect x="28" y="40" width="3" height="20" fill="#000" stroke="none" />
      <rect x="33" y="37" width="3" height="26" fill="#000" stroke="none" />
      <polyline points="50,30 50,43 36,43" />
      <polyline points="50,70 50,57 36,57" />
      <polygon points="51.5,57 43,53 43,61" fill="#000" stroke="none" />
    </g>
  );
}

export function PmosSymbol({ strokeWidth = 1.5 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" fill="none">
      {/* Kéo dài đường gate và bỏ vòng tròn */}
      <line x1="20" y1="50" x2="28" y2="50" />
      <rect x="28" y="40" width="3" height="20" fill="#000" stroke="none" />
      <rect x="33" y="37" width="3" height="26" fill="#000" stroke="none" />
      <polyline points="50,30 50,43 36,43" />
      <polyline points="50,70 50,57 36,57" />
      {/* Mũi tên quay ngược chiều so với NMOS */}
      <polygon points="34,43 43,39 43,47" fill="#000" stroke="none" />
    </g>
  );
}

export function NpnSymbol({ strokeWidth = 1.5 }) {
  const bar = strokeWidth * 2; // thanh base dày hơn
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" fill="none">      
      <line x1="20" y1="50" x2="33.131113" y2="50" />
      <line x1="33.131113" y1="36.654393" x2="33.131113" y2="63.32954" strokeWidth={bar} />
      <polyline points="33.131113,43.598474 50,36.620268 50,30" />
      <line x1="33.131113" y1="56.403673" x2="42.69929" y2="60.358712" />
      <polyline points="49.063944,62.990761 50,63.377859 50,70" />
      <polygon points="43.364905,56.792086 40.047357,63.377859 50,63.377859" fill="#000" stroke="none" />
    </g>
  );
}

export function PnpSymbol({ strokeWidth = 1.5 }) {
  const bar = strokeWidth * 2;
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" fill="none">
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

export function ResistorSymbol({ strokeWidth = 1.5 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={12} fill="none">
      <line x1="50" y1="30" x2="50" y2="41.94" />
      <line x1="50" y1="57.94" x2="50" y2="70" />
      <polyline points="50,41.27907 55.372093,43.604651 45.395349,45.930233 55.372093,48.837209 45.011628,51.744186 55.372093,54.651163 45.395349,57.55814 50,58.72093" />
    </g>
  );
}

export function CapacitorSymbol({ strokeWidth = 1.5 }) {
  const plate = strokeWidth * 2;
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" fill="none">
      <line x1="50" y1="30" x2="50" y2="46.766395" />
      <line x1="50" y1="53.233605" x2="50" y2="70" />
      <line x1="41.94936" y1="46.766395" x2="58.05064" y2="46.766395" strokeWidth={plate} />
      <line x1="41.94936" y1="53.233605" x2="58.05064" y2="53.233605" strokeWidth={plate} />
    </g>
  );
}

// Dấu + / − nhỏ dùng chung cho opamp và nguồn áp
function Plus({ x, y, sw, cap = 'round' }) {
  return (
    <g stroke="#000" strokeWidth={sw} strokeLinecap={cap} fill="none">
      <line x1={x - 3} y1={y} x2={x + 3} y2={y} />
      <line x1={x} y1={y - 3} x2={x} y2={y + 3} />
    </g>
  );
}
function Minus({ x, y, sw, cap = 'round' }) {
  return <line x1={x - 3} y1={y} x2={x + 3} y2={y} stroke="#000" strokeWidth={sw} strokeLinecap={cap} />;
}

export function VoltageSourceSymbol({ strokeWidth = 1.5 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" fill="none">
      <circle cx="50" cy="50" r="10.76" />
      <line x1="50" y1="30" x2="50" y2="39.24" />
      <line x1="50" y1="60.76" x2="50" y2="70" />
      <Plus x={50} y={44.5} sw={strokeWidth} cap="butt" />
      <Minus x={50} y={55.5} sw={strokeWidth} cap="butt" />
    </g>
  );
}

export function CurrentSourceSymbol({ strokeWidth = 1.5 }) {
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" strokeLinejoin="miter" fill="none">
      <circle cx="50" cy="50" r="10.76" />
      <line x1="50" y1="30" x2="50" y2="39.24" />
      <line x1="50" y1="60.76" x2="50" y2="70" />
      <line x1="50" y1="43.02" x2="50" y2="47.67" />
      <polygon points="50,56.98 45.35,47.67 54.65,47.67" fill="#000" stroke="none" />
    </g>
  );
}

export function VddSymbol({ strokeWidth = 1.5, data }) {
  const bar = strokeWidth * 2;
  const { left, right } = getVddSpan(data);
  return (
    <rect x={VDD_BAR.x0 - left * GRID} y={VDD_BAR.y - bar / 2} width={(left + right) * GRID} height={bar}
          fill="#000" stroke="none" />
  );
}

export function RectSymbol({ data }) {
  const color = data?.color || '#1677ff';
  const isNone = color === 'transparent';
  const opacity = data?.opacity ?? 1;
  const strokeColor = isNone ? '#555' : color;
  return (
    <rect x="6" y="6" width="148" height="88" rx="4"
          fill={isNone ? 'transparent' : color} fillOpacity={isNone ? 1 : opacity}
          stroke={strokeColor} strokeWidth="2" />
  );
}

export function GroundSymbol({ strokeWidth = 1.5 }) {
  const plate = strokeWidth * 1.6;   // độ dày mỗi vạch (≈ 1.6 lần thân dây)
  const step = plate * 2;            // khoảng cách tâm 2 vạch = 2 × độ dày → khe hở = độ dày
  const y1 = 40, y2 = y1 + step, y3 = y1 + step * 2;
  return (
    <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt" fill="none">
      <line x1="50" y1="30" x2="50" y2={y1} />                                {/* dây nối */}
      <line x1="44"   y1={y1} x2="56"   y2={y1} strokeWidth={plate} />        {/* vạch 1: dài 12 */}
      <line x1="46.5" y1={y2} x2="53.5" y2={y2} strokeWidth={plate} />        {/* vạch 2: dài 7  */}
      <line x1="47.8" y1={y3} x2="52.2" y2={y3} strokeWidth={plate} />        {/* vạch 3: dài 4.4 */}
    </g>
  );
}

export function OpampSymbol({ strokeWidth = 1.5 }) {
  return (
    <g fill="none">
      <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt">
        <line x1="10" y1="30" x2="20" y2="30" />
        <line x1="10" y1="70" x2="20" y2="70" />
        <line x1="71.961524" y1="50" x2="80" y2="50" />
      </g>
      <path d="M 20 20 L 20 80 L 71.961524 50 Z" stroke="#000" strokeWidth={strokeWidth * 1.2}
            strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <Minus x={26.25} y={36} sw={strokeWidth} />
      <Plus x={26.25} y={64} sw={strokeWidth} />
    </g>
  );
}

export function FdOpampSymbol({ strokeWidth = 1.5 }) {
  return (
    <g fill="none">
      <g stroke="#000" strokeWidth={strokeWidth} strokeLinecap="butt">
        <line x1="10" y1="30" x2="20" y2="30" />
        <line x1="10" y1="70" x2="20" y2="70" />
        <line x1="37.320508" y1="30" x2="80" y2="30" />
        <line x1="37.320508" y1="70" x2="80" y2="70" />
      </g>
      <path d="M 20 20 L 20 80 L 71.961524 50 Z" stroke="#000" strokeWidth={strokeWidth * 1.2}
            strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <Plus x={26.25} y={36} sw={strokeWidth} />
      <Minus x={26.25} y={64} sw={strokeWidth} />
      <Minus x={36.461524} y={36} sw={strokeWidth} />
      <Plus x={36.461524} y={64} sw={strokeWidth} />
    </g>
  );
}

export function InverterSymbol({ strokeWidth = 1.5 }) {
  const leadSw = strokeWidth;
  const bodySw = strokeWidth * 1.35;
  return (
    <g transform="translate(40, 50)" fill="none" stroke="#000">
      <line x1="-30" y1="0" x2="-20" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
      <path d="M 3.750981 0 L -20 -15.000436 L -20 13.748365 L 3.750981 0" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <circle cx="7.522015" cy="0.009591" r="3.750109" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <line x1="11.272124" y1="0" x2="40" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
    </g>
  );
}

export function BufferSymbol({ strokeWidth = 1.5 }) {
  const leadSw = strokeWidth;
  const bodySw = strokeWidth * 1.35;
  return (
    <g transform="translate(40, 50)" fill="none" stroke="#000">
      <line x1="-30" y1="0" x2="-20" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
      <path d="M 3.750277 0 L -20 14.998936 L -20 -13.749865 L 3.750277 0" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <line x1="3.750277" y1="0" x2="40" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
    </g>
  );
}

export function AndGateSymbol({ strokeWidth = 1.5 }) {
  const leadSw = strokeWidth;
  const bodySw = strokeWidth * 1.35;
  return (
    <g transform="translate(40, 50)" fill="none" stroke="#000">
      <line x1="-30" y1="-10" x2="-20" y2="-10" strokeWidth={leadSw} strokeLinecap="butt" />
      <line x1="-30" y1="10" x2="-20" y2="10" strokeWidth={leadSw} strokeLinecap="butt" />
      <path d="M -0.938181 -15.077165 C -0.938181 -15.077165 -0.938181 -15.077165 -0.781236 -15.077165 C -0.626035 -15.077165 -0.312146 -15.077165 -0.156945 -15.0388 C 0 -14.998692 0 -14.998692 0.676607 -14.895806 C 1.353213 -14.791176 2.70817 -14.58366 3.918389 -14.231406 C 5.130352 -13.879152 6.197576 -13.385648 7.357224 -12.590461 C 8.515128 -11.797018 9.765455 -10.701892 10.72805 -9.556195 C 11.692388 -8.410498 12.368995 -7.21423 12.8904 -5.988316 C 13.411806 -4.764147 13.776267 -3.515564 13.971576 -2.212922 C 14.166885 -0.912024 14.193042 0.442933 14.062255 1.707211 C 13.931468 2.969745 13.645479 4.141599 13.111867 5.43029 C 12.578255 6.718982 11.797018 8.126253 10.898945 9.284157 C 10.000872 10.443805 8.984218 11.354085 8.150667 12.030691 C 7.317116 12.709042 6.666667 13.153719 5.97611 13.502485 C 5.285553 13.854739 4.556631 14.116314 3.906182 14.323829 C 3.253989 14.533089 2.682013 14.690034 2.174558 14.777226 C 1.665359 14.869649 1.22417 14.89755 0.767286 14.909757 C 0.312146 14.921964 -0.156945 14.921964 -0.650449 14.921964 C -1.145697 14.921964 -1.667102 14.921964 -1.926933 14.921964 C -2.110036 14.921964 -2.110036 14.921964 -2.110036 14.921964 L -20 14.921964 L -20 -15.077165 Z" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <line x1="14.68829" y1="0" x2="40" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
    </g>
  );
}

export function OrGateSymbol({ strokeWidth = 1.5 }) {
  const leadSw = strokeWidth;
  const bodySw = strokeWidth * 1.35;
  return (
    <g transform="translate(40, 50)" fill="none" stroke="#000">
      <line x1="-30" y1="-10" x2="-15.436394" y2="-10" strokeWidth={leadSw} strokeLinecap="butt" />
      <line x1="-30" y1="10" x2="-15.748539" y2="10" strokeWidth={leadSw} strokeLinecap="butt" />
      <path d="M 15.757259 0.002616 C 15.757259 0.002616 15.757259 0.002616 13.373442 2.213794 C 10.989624 4.426715 6.22199 8.849071 0.263319 11.829279 C -5.697096 14.809486 -12.850292 16.345802 -16.425146 17.114831 C -20 17.882117 -20 17.882117 -20 17.882117 C -20 17.882117 -20 17.882117 -18.139332 14.786817 C -16.275176 11.689772 -12.550353 5.497428 -12.550353 -0.438574 C -12.550353 -6.374575 -16.275176 -12.055977 -18.139332 -14.896678 C -20 -17.735635 -20 -17.735635 -20 -17.735635 C -20 -17.735635 -20 -17.735635 -16.425146 -16.991019 C -12.850292 -16.246403 -5.697096 -14.757172 0.263319 -11.799634 C 6.22199 -8.84384 10.989624 -4.41974 13.373442 -2.208562 C 15.757259 0.002616 15.757259 0.002616 15.757259 0.002616" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <line x1="15.757259" y1="0" x2="40" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
    </g>
  );
}

export function NandGateSymbol({ strokeWidth = 1.5 }) {
  const leadSw = strokeWidth;
  const bodySw = strokeWidth * 1.35;
  return (
    <g transform="translate(40, 50)" fill="none" stroke="#000">
      <line x1="-30" y1="-10" x2="-20" y2="-10" strokeWidth={leadSw} strokeLinecap="butt" />
      <line x1="-30" y1="10" x2="-20" y2="10" strokeWidth={leadSw} strokeLinecap="butt" />
      <path d="M -1.405528 15.07978 C -1.405528 15.07978 -1.405528 15.07978 -1.236377 15.06583 C -0.988753 15.051879 -0.493505 15.025722 -0.245881 15.013515 C 0.001743 15.001308 0.001743 15.001308 0.67835 14.894934 C 1.354956 14.792048 2.708169 14.582788 3.918388 14.234022 C 5.130351 13.880024 6.199319 13.38652 7.358967 12.591333 C 8.516871 11.79789 9.767198 10.704508 10.729793 9.558811 C 11.692388 8.413114 12.370738 7.213358 12.892144 5.990932 C 13.411805 4.766763 13.77801 3.516436 13.973319 2.213794 C 14.166884 0.911152 14.194786 -0.442061 14.062254 -1.706339 C 13.933211 -2.968873 13.648966 -4.140727 13.111866 -5.429418 C 12.578254 -6.71811 11.797018 -8.125381 10.898945 -9.283285 C 10.000871 -10.442933 8.985962 -11.354957 8.15241 -12.031563 C 7.318859 -12.70817 6.66841 -13.151103 5.979597 -13.503357 C 5.285552 -13.853867 4.560118 -14.115442 3.906181 -14.322958 C 3.257476 -14.530473 2.683756 -14.687418 2.176301 -14.778097 C 1.667102 -14.870521 1.224169 -14.894934 0.769029 -14.908885 C 0.313889 -14.921092 -0.155201 -14.921092 -0.650449 -14.921092 C -1.143954 -14.921092 -1.665359 -14.921092 -1.926934 -14.921092 C -2.108292 -14.921092 -2.108292 -14.921092 -2.108292 -14.921092 L -20 -14.921092 L -20 15.07978 Z" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <circle cx="19.652977" cy="0.010463" r="3.375185" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <line x1="23.028162" y1="0" x2="40" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
    </g>
  );
}

export function NorGateSymbol({ strokeWidth = 1.5 }) {
  const leadSw = strokeWidth;
  const bodySw = strokeWidth * 1.35;
  return (
    <g transform="translate(40, 50)" fill="none" stroke="#000">
      <line x1="-30" y1="-10" x2="-15.436394" y2="-10" strokeWidth={leadSw} strokeLinecap="butt" />
      <line x1="-30" y1="10" x2="-15.748539" y2="10" strokeWidth={leadSw} strokeLinecap="butt" />
      <path d="M 15.757259 0.002616 C 15.757259 0.002616 15.757259 0.002616 13.373442 2.213794 C 10.989624 4.426715 6.22199 8.849071 0.263319 11.829279 C -5.697096 14.809486 -12.850292 16.345802 -16.425146 17.114831 C -20 17.882117 -20 17.882117 -20 17.882117 C -20 17.882117 -20 17.882117 -18.139332 14.786817 C -16.275176 11.689772 -12.550353 5.497428 -12.550353 -0.438574 C -12.550353 -6.374575 -16.275176 -12.055977 -18.139332 -14.896678 C -20 -17.735635 -20 -17.735635 -20 -17.735635 C -20 -17.735635 -20 -17.735635 -16.425146 -16.991019 C -12.850292 -16.246403 -5.697096 -14.757172 0.263319 -11.799634 C 6.22199 -8.84384 10.989624 -4.41974 13.373442 -2.208562 C 15.757259 0.002616 15.757259 0.002616 15.757259 0.002616" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <circle cx="19.96338" cy="-0.121196" r="3.374313" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <line x1="23.337693" y1="0" x2="40" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
    </g>
  );
}

export function XorGateSymbol({ strokeWidth = 1.5 }) {
  const leadSw = strokeWidth;
  const bodySw = strokeWidth * 1.35;
  return (
    <g transform="translate(40, 50)" fill="none" stroke="#000">
      <line x1="-30" y1="-10" x2="-15.769465" y2="-10" strokeWidth={leadSw} strokeLinecap="butt" />
      <line x1="-30" y1="10" x2="-15.455575" y2="10" strokeWidth={leadSw} strokeLinecap="butt" />
      <path d="M 22.287907 0.002616 C 22.287907 0.002616 22.287907 0.002616 19.90409 2.213794 C 17.520272 4.424972 12.752638 8.849071 6.792223 11.829279 C 0.833552 14.807743 -6.3179 16.344058 -9.894498 17.113087 C -13.471096 17.880373 -13.471096 17.880373 -13.471096 17.880373 C -13.471096 17.880373 -13.471096 17.880373 -11.608684 14.785073 C -9.746272 11.689772 -6.021449 5.497428 -6.021449 -0.440317 C -6.021449 -6.376319 -9.746272 -12.057721 -11.608684 -14.896678 C -13.471096 -17.737379 -13.471096 -17.737379 -13.471096 -17.737379 C -13.471096 -17.737379 -13.471096 -17.737379 -9.894498 -16.992763 C -6.3179 -16.248147 0.833552 -14.757172 6.792223 -11.801378 C 12.752638 -8.84384 17.520272 -4.421484 19.90409 -2.210306 C 22.287907 0.002616 22.287907 0.002616 22.287907 0.002616" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <path d="M -20 -17.735635 C -20 -17.735635 -20 -17.735635 -18.177696 -14.910629 C -16.353649 -12.083878 -12.709041 -6.432121 -12.695091 -0.482169 C -12.682884 5.467783 -16.303077 11.717674 -18.11143 14.842619 C -19.921527 17.969309 -19.921527 17.969309 -19.921527 17.969309" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <line x1="22.287907" y1="0" x2="40" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
    </g>
  );
}

export function XnorGateSymbol({ strokeWidth = 1.5 }) {
  const leadSw = strokeWidth;
  const bodySw = strokeWidth * 1.35;
  return (
    <g transform="translate(40, 50)" fill="none" stroke="#000">
      <line x1="-30" y1="-10" x2="-15.769465" y2="-10" strokeWidth={leadSw} strokeLinecap="butt" />
      <line x1="-30" y1="10" x2="-15.455575" y2="10" strokeWidth={leadSw} strokeLinecap="butt" />
      <path d="M 22.287907 0.002616 C 22.287907 0.002616 22.287907 0.002616 19.90409 2.213794 C 17.520272 4.424972 12.752638 8.849071 6.792223 11.829279 C 0.833552 14.807743 -6.3179 16.344058 -9.894498 17.113087 C -13.471096 17.880373 -13.471096 17.880373 -13.471096 17.880373 C -13.471096 17.880373 -13.471096 17.880373 -11.608684 14.785073 C -9.746272 11.689772 -6.021449 5.497428 -6.021449 -0.440317 C -6.021449 -6.376319 -9.746272 -12.057721 -11.608684 -14.896678 C -13.471096 -17.737379 -13.471096 -17.737379 -13.471096 -17.737379 C -13.471096 -17.737379 -13.471096 -17.737379 -9.894498 -16.992763 C -6.3179 -16.248147 0.833552 -14.757172 6.792223 -11.801378 C 12.752638 -8.84384 17.520272 -4.421484 19.90409 -2.210306 C 22.287907 0.002616 22.287907 0.002616 22.287907 0.002616" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <path d="M -20 -17.735635 C -20 -17.735635 -20 -17.735635 -18.177696 -14.910629 C -16.353649 -12.083878 -12.709041 -6.432121 -12.695091 -0.482169 C -12.682884 5.467783 -16.303077 11.717674 -18.11143 14.842619 C -19.921527 17.969309 -19.921527 17.969309 -19.921527 17.969309" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <circle cx="26.494028" cy="0.002616" r="3.374313" strokeWidth={bodySw} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={4} />
      <line x1="29.868341" y1="0" x2="40" y2="0" strokeWidth={leadSw} strokeLinecap="butt" />
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
  vsource: VoltageSourceSymbol,
  isource: CurrentSourceSymbol,
  vdd: VddSymbol,
  gnd: GroundSymbol,
  opamp: OpampSymbol,
  fdopamp: FdOpampSymbol,
  inverter: InverterSymbol,
  buffer: BufferSymbol,
  and: AndGateSymbol,
  or: OrGateSymbol,
  nand: NandGateSymbol,
  nor: NorGateSymbol,
  xor: XorGateSymbol,
  xnor: XnorGateSymbol,
  rect: RectSymbol,
};

// Icon nhỏ trong sidebar / menu nhanh — CHỈ để hiển thị, không dùng làm ảnh kéo.
// Cắt viewBox theo hộp bao của ký hiệu để icon lấp đầy khung, nét vẽ giữ ~1.8px dù phóng to/thu nhỏ.
export function MiniIcon({ type, width = 28, height = 20, data }) {
  const Symbol = SYMBOLS[type] || NmosSymbol;
  const box = getSymbolBox(type, data);
  const pad = 6;
  const vbX = box.x - pad, vbY = box.y - pad, vbW = box.w + pad * 2, vbH = box.h + pad * 2;
  const scale = Math.min(width / vbW, height / vbH);
  const sw = Math.min(6, Math.max(2, 1.8 / scale));
  return (
    <svg
      width={width} height={height} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      style={{ width, height, flexShrink: 0, display: 'block' }}
    >
      <Symbol strokeWidth={sw} data={data} />
    </svg>
  );
}

// Ghost icon full-size DÙNG CHUNG cho mọi symbol — luôn ép width/height bằng inline style
// để không bị bất kỳ CSS global nào (của ReactFlow hay thư viện khác) đè kích thước.
export function GhostIcon({ type, data }) {
  const Symbol = SYMBOLS[type] || NmosSymbol;
  return (
    <svg
      viewBox="0 0 160 100"
      style={{ width: 160, height: 100, display: 'block' }}
    >
      <Symbol strokeWidth={1.5} data={data} />
    </svg>
  );
}

