import React, { useEffect, useRef, useState } from 'react';
import wavedrom from 'wavedrom';
import defaultSkin from 'wavedrom/skins/default.js';
import narrowSkin from 'wavedrom/skins/narrow.js';
import darkSkin from 'wavedrom/skins/dark.js';
import JSON5 from 'json5';

const WAVE_SKINS = {
  default: defaultSkin.default || defaultSkin,
  narrow: narrowSkin.narrow || narrowSkin,
  dark: darkSkin.dark || darkSkin,
};

export default function WaveDromRenderer({
  waveJson,
  skin = 'default',
  zoom = 1,
  onError,
  onSvgGenerated,
}) {
  const containerRef = useRef(null);
  const [svgContent, setSvgContent] = useState('');

  useEffect(() => {
    if (!waveJson) {
      setSvgContent('');
      onError?.(null);
      return;
    }

    try {
      // 1. Parse JSON / JSON5
      const parsed = JSON5.parse(waveJson);

      // 2. Prepare config with chosen skin
      const source = {
        ...parsed,
        config: {
          ...(parsed.config || {}),
          skin: skin || 'default',
        },
      };

      // 3. Render AST and stringify to SVG
      const ast = wavedrom.renderAny(0, source, WAVE_SKINS);
      const svg = wavedrom.onml.stringify(ast);

      setSvgContent(svg);
      onError?.(null);
      onSvgGenerated?.(svg);
    } catch (err) {
      console.warn('WaveDrom render error:', err);
      onError?.(err.message || 'Syntax error in WaveJSON');
    }
  }, [waveJson, skin, onError, onSvgGenerated]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = svgContent;
    }
  }, [svgContent]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        padding: '24px 32px',
        boxSizing: 'border-box',
        background: skin === 'dark' ? '#141414' : '#ffffff',
      }}
    >
      <div
        ref={containerRef}
        style={{
          display: 'inline-block',
          minWidth: 'fit-content',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          transition: 'transform 0.1s ease',
        }}
      />
    </div>
  );
}
