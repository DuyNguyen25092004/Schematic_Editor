import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const katexCache = new Map();

function renderLine(line) {
  let l = String(line || '').trim();
  if (l.endsWith('_')) l = `${l}{}`;
  if (katexCache.has(l)) return katexCache.get(l);
  const result = katex.renderToString(l, { throwOnError: false, displayMode: false, output: 'html' });
  if (katexCache.size > 2000) {
    const firstKey = katexCache.keys().next().value;
    katexCache.delete(firstKey);
  }
  katexCache.set(l, result);
  return result;
}

export function formatLatexRef(ref, isVdd = false) {
  if (!ref) return '';
  let str = String(ref).trim();
  if (isVdd) {
    if (/^V[A-Za-z0-9]+$/i.test(str) && !str.includes('_') && !str.includes('{')) {
      return `V_{${str.slice(1)}}`;
    }
  }
  // Nếu đã ở dạng X_{...} thì giữ nguyên
  if (/^([A-Za-z]+)_\{([^}]+)\}$/.test(str)) {
    return str;
  }
  // M_10 hoặc M_xx -> M_{10}, M_{xx}
  if (/^([A-Za-z]+)_([A-Za-z0-9]+)$/.test(str)) {
    return str.replace(/^([A-Za-z]+)_([A-Za-z0-9]+)$/, '$1_{$2}');
  }
  // M10 hoặc M1 -> M_{10}, M_{1}
  if (/^([A-Za-z]+)(\d+)$/.test(str)) {
    return str.replace(/^([A-Za-z]+)(\d+)$/, '$1_{$2}');
  }
  if (str.endsWith('_')) {
    return `${str}{}`;
  }
  return str;
}

// Định dạng thông số W, L của MOSFET sang dạng LaTeX
export function formatLatexMosParam(param, val) {
  if (!val) return '';
  let str = String(val).trim();
  // Bỏ tiền tố W= hoặc L= nếu người dùng đã gõ sẵn
  str = str.replace(new RegExp(`^${param}\\s*=\\s*`, 'i'), '').trim();
  if (!str) return '';

  // Nếu người dùng đã gõ biểu thức LaTeX chuẩn
  if (/[\\{}^_]/.test(str)) {
    return `${param} = ${str}`;
  }

  const formattedVal = str
    .replace(/([0-9.]+)\s*(um|u|µm|µ)\b/gi, '$1\\,\\mu\\text{m}')
    .replace(/([0-9.]+)\s*(nm|n)\b/gi, '$1\\,\\text{nm}')
    .replace(/([0-9.]+)\s*(pm|p)\b/gi, '$1\\,\\text{pm}')
    .replace(/([0-9.]+)\s*(mm)\b/gi, '$1\\,\\text{mm}');

  return `${param} = ${formattedVal}`;
}

// Định dạng giá trị linh kiện thụ động / nguồn (res, cap, vsource, isource) sang dạng LaTeX
export function formatLatexPassiveValue(val, type = 'res') {
  if (!val) return '';
  let str = String(val).trim();
  if (!str) return '';

  // Nếu đã có cú pháp LaTeX tùy biến
  if (/[\\{}^_]/.test(str)) {
    return str;
  }

  // Điện trở (res)
  if (type === 'res') {
    str = str.replace(/\s*(ohm|ohms|Ω)\b/gi, '');
    if (/^[0-9.]+\s*k$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*k$/i, '$1\\,\\text{k}\\Omega');
    }
    if (/^[0-9.]+\s*(m|meg)$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*(m|meg)$/i, '$1\\,\\text{M}\\Omega');
    }
    if (/^[0-9.]+\s*g$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*g$/i, '$1\\,\\text{G}\\Omega');
    }
    if (/^[0-9.]+\s*m\b/.test(str)) {
      return str.replace(/^([0-9.]+)\s*m\b/, '$1\\,\\text{m}\\Omega');
    }
    if (/^[0-9.]+$/.test(str)) {
      return `${str}\\,\\Omega`;
    }
    return `${str}\\,\\Omega`;
  }

  // Tụ điện (cap)
  if (type === 'cap') {
    str = str.replace(/\s*(f|farad|farads)\b/gi, '');
    if (/^[0-9.]+\s*p$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*p$/i, '$1\\,\\text{pF}');
    }
    if (/^[0-9.]+\s*n$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*n$/i, '$1\\,\\text{nF}');
    }
    if (/^[0-9.]+\s*(u|µ)$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*(u|µ)$/i, '$1\\,\\mu\\text{F}');
    }
    if (/^[0-9.]+\s*m$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*m$/i, '$1\\,\\text{mF}');
    }
    if (/^[0-9.]+$/.test(str)) {
      return `${str}\\,\\text{pF}`;
    }
    return `${str}\\,\\text{F}`;
  }

  // Nguồn áp (vsource)
  if (type === 'vsource') {
    str = str.replace(/\s*v$/i, '');
    if (/^[0-9.]+\s*m$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*m$/i, '$1\\,\\text{mV}');
    }
    if (/^[0-9.]+\s*(u|µ)$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*(u|µ)$/i, '$1\\,\\mu\\text{V}');
    }
    return `${str}\\,\\text{V}`;
  }

  // Nguồn dòng (isource)
  if (type === 'isource') {
    str = str.replace(/\s*a$/i, '');
    if (/^[0-9.]+\s*m$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*m$/i, '$1\\,\\text{mA}');
    }
    if (/^[0-9.]+\s*(u|µ)$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*(u|µ)$/i, '$1\\,\\mu\\text{A}');
    }
    if (/^[0-9.]+\s*n$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*n$/i, '$1\\,\\text{nA}');
    }
    if (/^[0-9.]+\s*p$/i.test(str)) {
      return str.replace(/^([0-9.]+)\s*p$/i, '$1\\,\\text{pA}');
    }
    return `${str}\\,\\text{A}`;
  }

  return str;
}

function LatexText({ text = '', latex, size = 14, color = '#000', style }) {
  const isLatex = latex ?? /[_\^\\{}]/.test(String(text || ''));
  const html = useMemo(() => {
    if (!isLatex) return null;
    return String(text).split('\n').map((l) => `<div>${l.trim() ? renderLine(l) : '&nbsp;'}</div>`).join('');
  }, [text, isLatex]);

  const textColor = color || '#000';
  const base = {
    display: 'inline-block',
    fontSize: size, color: textColor, lineHeight: 1.3, whiteSpace: 'nowrap',
    fontFamily: isLatex ? undefined : 'sans-serif', fontWeight: isLatex ? 400 : 600,
    ...style,
  };
  if (isLatex) return <div style={base} dangerouslySetInnerHTML={{ __html: html }} />;
  return <div style={{ ...base, whiteSpace: 'pre' }}>{text}</div>;
}

export default React.memo(LatexText);