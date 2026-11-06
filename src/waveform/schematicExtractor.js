import JSON5 from 'json5';

/**
 * Extracts signal names from a schematic sheet's nodes and wires,
 * and builds a starter WaveJSON structure.
 */
export function extractSignalsFromSheet(sheet) {
  if (!sheet) return null;
  const nodes = sheet.nodes || [];
  const wires = sheet.wires || [];

  const signalSet = new Set();
  let hasClock = false;

  // 1. Scan wire names & wire labels
  wires.forEach((w) => {
    if (w.name && typeof w.name === 'string') {
      const cleanName = w.name.replace(/[$}{]/g, '').trim();
      if (cleanName && cleanName !== '0' && cleanName.toUpperCase() !== 'GND') {
        signalSet.add(cleanName);
        if (/clk|clock/i.test(cleanName)) hasClock = true;
      }
    }
    if (Array.isArray(w.labels)) {
      w.labels.forEach((lbl) => {
        const text = (typeof lbl === 'string' ? lbl : lbl?.text || '').replace(/[$}{]/g, '').trim();
        if (text && text !== '0' && text.toUpperCase() !== 'GND') {
          signalSet.add(text);
          if (/clk|clock/i.test(text)) hasClock = true;
        }
      });
    }
  });

  // 2. Scan component instances (PULSE sources, DFFs, Logic Gates)
  nodes.forEach((n) => {
    const ref = n.data?.reference || n.id;
    const type = n.type;

    if (['vsource', 'isource', 'vpulse', 'vsin', 'vnoise'].includes(type)) {
      if (n.data?.sourceType === 'pulse') {
        signalSet.add(ref || 'CLK_SRC');
        hasClock = true;
      }
    } else if (type === 'dff' || type === 'dff_sr') {
      signalSet.add(`${ref}_Q`);
    } else if (['and', 'or', 'nand', 'nor', 'xor', 'xnor', 'inverter'].includes(type)) {
      signalSet.add(`${ref}_OUT`);
    }
  });

  const signalList = Array.from(signalSet);
  if (signalList.length === 0) {
    signalList.push('CLK', 'IN', 'OUT');
    hasClock = true;
  }

  // Build tracks
  const tracks = [];
  if (hasClock) {
    // Put clock first
    const clkItem = signalList.find((s) => /clk|clock/i.test(s));
    tracks.push({ name: clkItem || 'clk', wave: 'p.....|...' });
  }

  signalList
    .filter((s) => !/clk|clock/i.test(s))
    .slice(0, 8)
    .forEach((s, idx) => {
      // Alternate wave patterns for variety
      const pattern = idx % 3 === 0 ? '0.1..0|1.0' : idx % 3 === 1 ? '10.10.|.01' : 'x.345x|=.x';
      if (pattern.includes('345')) {
        tracks.push({ name: s, wave: pattern, data: ['D0', 'D1', 'D2', 'DATA'] });
      } else {
        tracks.push({ name: s, wave: pattern });
      }
    });

  const waveObj = {
    signal: tracks,
  };

  return JSON5.stringify(waveObj, null, 2);
}
