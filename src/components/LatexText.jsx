import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function renderLine(line) {
  return katex.renderToString(line, { throwOnError: false, displayMode: false, output: 'html' });
}

export default function LatexText({ text = '', latex = false, size = 14, color = '#000', style }) {
  const html = useMemo(() => {
    if (!latex) return null;
    return String(text).split('\n').map((l) => `<div>${l.trim() ? renderLine(l) : '&nbsp;'}</div>`).join('');
  }, [text, latex]);

  const base = {
    fontSize: size, color, lineHeight: 1.3, whiteSpace: 'nowrap',
    fontFamily: latex ? undefined : 'sans-serif', fontWeight: latex ? 400 : 600,
    ...style,
  };
  if (latex) return <div style={base} dangerouslySetInnerHTML={{ __html: html }} />;
  return <div style={{ ...base, whiteSpace: 'pre' }}>{text}</div>;
}