import React, { useState } from 'react';
import { roomUrl, joinRoom, newRoom } from '../realtime/circuitId';


// ============ THANH PHÒNG: MÃ PHÒNG + CHIA SẺ + THAM GIA ============
function RoomBar({ circuitId }) {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');

  const copyLink = async () => {
    const url = roomUrl(circuitId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy link phòng:', url); // trình duyệt chặn clipboard
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(circuitId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Mã phòng:', circuitId);
    }
  };

  const join = () => { if (!joinRoom(code)) setCode(''); };

  const btn = {
    padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff',
    cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'sans-serif', color: '#333',
  };

  return (
    <div style={{
      position: 'absolute', top: 10, left: 16, zIndex: 21, display: 'flex', flexDirection: 'column',
      gap: 6, background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,.1)', fontFamily: 'sans-serif', fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#888' }}>Phòng:</span>
        <b title="Bấm để copy mã" onClick={copyCode} style={{ cursor: 'pointer', userSelect: 'all' }}>
          {circuitId}
        </b>
        <button style={{ ...btn, background: copied ? '#52c41a' : '#1677ff', color: '#fff', border: 'none' }}
                onClick={copyLink}>
          {copied ? 'Đã copy!' : 'Chia sẻ'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') join(); }}
          placeholder="Nhập mã phòng"
          style={{ width: 110, padding: '3px 6px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6 }}
        />
        <button style={btn} onClick={join}>Tham gia</button>
        <button style={btn} title="Tạo phòng trống mới" onClick={newRoom}>Mới</button>
      </div>
    </div>
  );
}

export default RoomBar