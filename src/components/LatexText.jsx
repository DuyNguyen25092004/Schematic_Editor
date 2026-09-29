import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function renderLine(line) {
  let l = String(line || '').trim();
  if (l.endsWith('_')) l = `${l}{}`;
  return katex.renderToString(l, { throwOnError: false, displayMode: false, output: 'html' });
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

export default function LatexText({ text = '', latex, size = 14, color = '#000', style }) {
  const isLatex = latex ?? /[_\^\\{}]/.test(String(text || ''));
  const html = useMemo(() => {
    if (!isLatex) return null;
    return String(text).split('\n').map((l) => `<div>${l.trim() ? renderLine(l) : '&nbsp;'}</div>`).join('');
  }, [text, isLatex]);

  const base = {
    display: 'inline-block',
    fontSize: size, color, lineHeight: 1.3, whiteSpace: 'nowrap',
    fontFamily: isLatex ? undefined : 'sans-serif', fontWeight: isLatex ? 400 : 600,
    ...style,
  };
  if (isLatex) return <div style={base} dangerouslySetInnerHTML={{ __html: html }} />;
  return <div style={{ ...base, whiteSpace: 'pre' }}>{text}</div>;
}