import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReactFlow, useStore } from 'reactflow';
import { snapPoint } from '../wires/snap';
import { getJunctionDots } from '../wires/wireOps';
import { resolvePoints } from '../routing/resolveWire';
import WireHandles from './WireHandles';
import { orthoPath, pointsToPolyline, pointAtRatio, projectOnPath } from '../geometry/pathUtils';
import LatexText, { formatLatexRef } from './LatexText';
import VddHandles from './VddHandles';

// Tách riêng phần hiển thị dây & nhãn tĩnh thành React.memo để không bị re-render khi pan canvas
const StaticWiresContent = React.memo(function StaticWiresContent({
  resolvedWires,
  junctionDots,
  selected,
  isWiringMode,
  isBoxSelecting,
  attachTool,
  attachHover,
  setAttachHover,
  strokeScale,
  screenToFlowPosition,
  onAttachLabel,
  setSelected,
  setWires,
  onEditLabel,
}) {
  return (
    <>
      <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', userSelect: 'none' }}>
        {resolvedWires.map(({ wire: w, rp, pts }) => {
          const isSel = w.selected || (selected?.kind === 'wire' && selected.id === w.id);
          const wireColor = w.color || '#000';
          return (
            <g key={w.id}>
              <polyline
                points={pts} fill="none" stroke="transparent" strokeWidth={attachTool ? 14 : 10}
                style={{
                  pointerEvents: (isWiringMode || isBoxSelecting) ? 'none' : 'stroke',
                  cursor: attachTool ? 'copy' : 'pointer',
                  userSelect: 'none',
                }}
                onMouseDown={(e) => { e.preventDefault(); }}
                onMouseMove={attachTool ? (e) => {
                  const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY });
                  setAttachHover({ wireId: w.id, ratio: projectOnPath(rp, fp).ratio });
                } : undefined}
                onMouseLeave={attachTool ? () => setAttachHover(null) : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (attachTool) {
                    const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY });
                    onAttachLabel?.(w.id, projectOnPath(rp, fp).ratio);
                    return;
                  }
                  setSelected({ kind: 'wire', id: w.id });
                  setWires(ws => ws.map(wire => ({ ...wire, selected: wire.id === w.id })));
                }}
              />
              {(isSel || (attachTool && attachHover?.wireId === w.id)) && (
                <polyline
                  points={pts} fill="none" pointerEvents="none"
                  stroke="#1677ff" strokeOpacity={0.5} strokeWidth={6 / strokeScale}
                  strokeLinecap="round" strokeLinejoin="round"
                />
              )}
              <polyline
                points={pts} fill="none" pointerEvents="none"
                stroke={wireColor}
                strokeWidth={(isSel ? 2.5 : 1.5) / strokeScale}
                strokeLinecap="square" strokeLinejoin="miter"
              />
            </g>
          );
        })}

        {/* Render tất cả các dấu chấm giao nhau (Solder Dots) của các dây cố định */}
        {junctionDots.map((dot, idx) => (
          <circle key={`dot-${idx}`} cx={dot.x} cy={dot.y} r={3.5 / strokeScale} fill="#000" pointerEvents="none" />
        ))}
      </svg>

      {/* Lớp nhãn dây và tên dây (HTML Layer) - hiển thị KaTeX sắc nét */}
      <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
        {resolvedWires.map(({ wire: w, rp, mid, resolvedLabels }) => {
          const isSel = w.selected || (selected?.kind === 'wire' && selected.id === w.id);
          const wireColor = w.color || '#000';

          return (
            <React.Fragment key={`lbl-wrap-${w.id}`}>
              {/* Tên dây wire.name (tự động nhận dạng LaTeX) */}
              {mid && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected({ kind: 'wire', id: w.id });
                    setWires((ws) => ws.map((x) => ({ ...x, selected: x.id === w.id })));
                  }}
                  style={{
                    position: 'absolute',
                    left: mid.x,
                    top: mid.y,
                    transform: mid.horizontal ? 'translate(-50%, calc(-100% - 3px))' : 'translate(6px, -50%)',
                    pointerEvents: (!isWiringMode && !isBoxSelecting && !attachTool) ? 'auto' : 'none',
                    cursor: 'pointer',
                    userSelect: 'none',
                    textShadow: '0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <LatexText
                    text={formatLatexRef(w.name)}
                    latex={true}
                    size={12}
                    color={isSel ? '#1677ff' : wireColor}
                  />
                </div>
              )}

              {/* Các nhãn dán wire.labels */}
              {resolvedLabels.map((l) => (
                <div
                  key={l.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected({ kind: 'wire', id: w.id });
                    setWires((ws) => ws.map((x) => ({ ...x, selected: x.id === w.id })));
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onEditLabel?.(w.id, l.id);
                  }}
                  style={{
                    position: 'absolute',
                    left: l.pt.x,
                    top: l.pt.y,
                    transform: l.pt.horizontal ? 'translate(-50%, calc(-100% - 3px))' : 'translate(6px, -50%)',
                    pointerEvents: (!isWiringMode && !isBoxSelecting && !attachTool) ? 'auto' : 'none',
                    cursor: 'pointer',
                    userSelect: 'none',
                    textShadow: '0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <LatexText
                    text={l.text}
                    latex={l.latex ?? /[_\^\\{}]/.test(l.text)}
                    size={l.size || 12}
                    color={isSel ? '#1677ff' : wireColor}
                  />
                </div>
              ))}

              {/* Nhãn nháp khi đang di chuột attach tool */}
              {attachTool && attachHover?.wireId === w.id && (() => {
                const pt = pointAtRatio(rp, attachHover.ratio);
                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: pt.x,
                      top: pt.y,
                      transform: pt.horizontal ? 'translate(-50%, calc(-100% - 3px))' : 'translate(6px, -50%)',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      opacity: 0.6,
                      textShadow: '0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff',
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <LatexText
                      text={attachTool.text}
                      latex={attachTool.latex ?? /[_\^\\{}]/.test(attachTool.text)}
                      size={12}
                      color="#1677ff"
                    />
                  </div>
                );
              })()}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
});

function WiringLayer({ isWiringMode, isBoxSelecting, nodes, wires, setWires, setNodes, selected, setSelected, attachTool, onAttachLabel, onEditLabel }) {
  const { screenToFlowPosition, setViewport, getViewport } = useReactFlow();
  const [draft, setDraft] = useState(null);
  const [cursor, setCursor] = useState(null);
  const clickTimer = useRef(null);
  const [attachHover, setAttachHover] = useState(null);

  // Hỗ trợ pan di chuyển màn hình khi đang vẽ dây
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef(null);
  const didPanRef = useRef(false);

  const transform = useStore((s) => s.transform);
  const [tx, ty, zoom] = transform;

  useEffect(() => {
    if (!isWiringMode) { setDraft(null); setCursor(null); }
  }, [isWiringMode]);

  useEffect(() => { if (!attachTool) setAttachHover(null); }, [attachTool]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        isPanningRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (!isWiringMode) return;
      if (e.key === 'Backspace' && draft) {
        e.preventDefault();
        setDraft(draft.length <= 1 ? null : draft.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWiringMode, draft]);

  // TÍNH TOÁN VÀ MEMOIZE HÌNH HỌC DÂY (chỉ tính lại khi nodes hoặc wires thay đổi, KHÔNG tính lại khi pan/zoom)
  const { resolvedWires, resolvedMap } = useMemo(() => {
    const map = new Map();
    const res = wires.map((w) => {
      const rp = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed, map);
      map.set(w.id, rp);
      const pts = pointsToPolyline(rp);
      const mid = (w.name && (!w.labels || w.labels.length === 0)) ? pointAtRatio(rp, 0.5) : null;
      const resolvedLabels = (w.labels || []).map((l) => ({
        ...l,
        pt: pointAtRatio(rp, l.ratio),
      }));
      return {
        wire: w,
        rp,
        pts,
        mid,
        resolvedLabels,
      };
    });
    return { resolvedWires: res, resolvedMap: map };
  }, [wires, nodes]);

  // Solder dots: tái sử dụng resolvedMap, 0 lần gọi lặp lại resolvePoints
  const junctionDots = useMemo(() => {
    return getJunctionDots(wires, nodes, resolvedMap);
  }, [wires, nodes, resolvedMap]);

  const toFlow = useCallback(
    (e) => snapPoint(screenToFlowPosition({ x: e.clientX, y: e.clientY }), nodes, wires, resolvedMap),
    [screenToFlowPosition, nodes, wires, resolvedMap]
  );

  const handleMouseDown = (e) => {
    if (!isWiringMode) return;
    const isPanBtn = e.button === 1 || e.button === 2 || (e.button === 0 && isSpacePressed);
    if (isPanBtn) {
      e.preventDefault();
      e.stopPropagation();
      isPanningRef.current = true;
      didPanRef.current = false;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        viewport: getViewport(),
      };

      const onWindowMove = (ev) => {
        if (!isPanningRef.current || !panStartRef.current) return;
        const dx = ev.clientX - panStartRef.current.x;
        const dy = ev.clientY - panStartRef.current.y;
        if (Math.hypot(dx, dy) > 2) {
          didPanRef.current = true;
        }
        const { x, y, zoom: curZoom } = panStartRef.current.viewport;
        setViewport({ x: x + dx, y: y + dy, zoom: curZoom });
        setCursor(toFlow(ev));
      };

      const onWindowUp = () => {
        isPanningRef.current = false;
        panStartRef.current = null;
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
      };

      window.addEventListener('mousemove', onWindowMove);
      window.addEventListener('mouseup', onWindowUp);
    }
  };

  const handleWheel = (e) => {
    if (!isWiringMode) return;
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const vp = getViewport();
    setViewport({
      x: vp.x - e.deltaX,
      y: vp.y - e.deltaY,
      zoom: vp.zoom,
    });
    setCursor(toFlow(e));
  };

  const rafCursor = useRef(null);
  useEffect(() => {
    return () => {
      if (rafCursor.current) cancelAnimationFrame(rafCursor.current);
    };
  }, []);

  const handleMove = (e) => {
    if (!isPanningRef.current) {
      const clientX = e.clientX, clientY = e.clientY;
      if (!rafCursor.current) {
        rafCursor.current = requestAnimationFrame(() => {
          rafCursor.current = null;
          setCursor(snapPoint(screenToFlowPosition({ x: clientX, y: clientY }), nodes, wires, resolvedMap));
        });
      }
    }
  };

  const handleClick = (e) => {
    if (didPanRef.current || isSpacePressed) {
      didPanRef.current = false;
      return;
    }
    if (e.button !== 0) return;

    if (clickTimer.current) return;
    const p = toFlow(e);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setDraft((prev) => {
        if (!prev) return [p];
        const last = prev[prev.length - 1];
        if (Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1) return prev;
        return [...prev, ...orthoPath(last, p).slice(1)];
      });
    }, 220);
  };

  const draftRef = useRef(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);
    
  const handleDoubleClick = (e) => {
    if (didPanRef.current || isSpacePressed) {
      didPanRef.current = false;
      return;
    }
    if (e.button !== 0) return;

    clearTimeout(clickTimer.current);
    clickTimer.current = null;
    const prev = draftRef.current;
    if (!prev) return;
    const p = toFlow(e);
    const last = prev[prev.length - 1];
    const pts = (Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1)
      ? prev
      : [...prev, ...orthoPath(last, p).slice(1)];
    if (pts.length >= 2) {
      const id = `wire-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setWires((ws) => [...ws, { id, points: pts }]);
    }
    setDraft(null);
  };

  const preview = draft && cursor ? orthoPath(draft[draft.length - 1], cursor) : null;
  // Làm tròn strokeScale thành các nấc 0.2 để tránh re-render liên tục trên mỗi frame zoom
  const strokeScale = Math.round(Math.max(0.2, Math.min(1, zoom || 1)) * 5) / 5;

  return (
    <>
      <div
        onMouseDown={isWiringMode ? handleMouseDown : undefined}
        onMouseMove={isWiringMode ? handleMove : undefined}
        onClick={isWiringMode ? handleClick : undefined}
        onDoubleClick={isWiringMode ? handleDoubleClick : undefined}
        onContextMenu={isWiringMode ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
        onWheel={isWiringMode ? handleWheel : undefined}
        style={{
          position: 'absolute', inset: 0, zIndex: 5,
          pointerEvents: isWiringMode ? 'auto' : 'none',
          cursor: isWiringMode
            ? (isSpacePressed ? (isPanningRef.current ? 'grabbing' : 'grab') : 'crosshair')
            : 'default',
        }}
      />

      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: 0, height: 0,
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        <StaticWiresContent
          resolvedWires={resolvedWires}
          junctionDots={junctionDots}
          selected={selected}
          isWiringMode={isWiringMode}
          isBoxSelecting={isBoxSelecting}
          attachTool={attachTool}
          attachHover={attachHover}
          setAttachHover={setAttachHover}
          strokeScale={strokeScale}
          screenToFlowPosition={screenToFlowPosition}
          onAttachLabel={onAttachLabel}
          setSelected={setSelected}
          setWires={setWires}
          onEditLabel={onEditLabel}
        />

        <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', userSelect: 'none' }}>
          {/* Handle chỉnh sửa dây đang được chọn — chỉ hiện khi KHÔNG đang wiring/box-select */}
          {!isWiringMode && !isBoxSelecting && selected?.kind === 'wire' && (() => {
            const w = wires.find((x) => x.id === selected.id);
            return w ? (
              <WireHandles
                wire={w}
                nodes={nodes}
                wires={wires}
                setWires={setWires}
                screenToFlowPosition={screenToFlowPosition}
              />
            ) : null;
          })()}

          {/* Tay nắm kéo dài thanh VDD đang được chọn */}
          {!isWiringMode && !isBoxSelecting && nodes
            .filter((n) => n.type === 'vdd' && (n.selected || (selected?.kind === 'node' && selected.id === n.id)))
            .map((n) => (
              <VddHandles key={n.id} node={n} wires={wires} setNodes={setNodes}
                          screenToFlowPosition={screenToFlowPosition} />
            ))}

          {/* 2. Dây đang vẽ phác (Draft) */}
          {draft && (
            <polyline points={pointsToPolyline(draft)} fill="none" stroke="#000"
                       strokeWidth={1.5 / strokeScale} strokeLinecap="square" />
          )}
          {preview && (
            <polyline points={pointsToPolyline(preview)} fill="none" stroke="#ff4d4f"
                       strokeWidth={1.5 / strokeScale} strokeDasharray="4 3" />
          )}
          
          {/* 3. Con trỏ chuột: Hiện chấm đỏ nếu vào chân, chấm ĐEN nếu vào dây, chấm xám nếu rảnh */}
          {isWiringMode && cursor && (
            <circle 
              cx={cursor.x} 
              cy={cursor.y} 
              r={(cursor.portId || cursor.onWireId ? 4 : 2.5) / strokeScale}
              fill={cursor.portId ? '#ff4d4f' : (cursor.onWireId ? '#000' : '#888')} 
            />
          )}
        </svg>
      </div>
    </>
  );
}

export default WiringLayer;