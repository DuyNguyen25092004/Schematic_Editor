import React, { useCallback, useState, useEffect, useRef } from 'react';
import ReactFlow, { Background, useNodesState, useEdgesState, useReactFlow, useStore } from 'reactflow';
import 'reactflow/dist/style.css';

import mockData from './data/mockData.json';
import CloudPanel from './cloud/CloudPanel';
import NmosNode from './nodes/NmosNode';
import PmosNode from './nodes/PmosNode';
import NpnNode from './nodes/NpnNode';
import TwoTerminalNode from './nodes/TwoTerminalNode';
import SymbolNode from './nodes/SymbolNode';

import { useCircuitSync } from './realtime/useCircuitSync';
import { getCircuitId, setCircuitId as persistCircuitId, newCircuitId } from './realtime/circuitId';
import { usePresence } from './realtime/usePresence';

import { GRID, COMPONENT_LIBRARY, nodeBoxStyle } from './constants';
import { getSymbolBBox } from './geometry/ports';
import { resolvePoints } from './routing/resolveWire';
import { attachFreeEndpointsToPorts } from './wires/snap';
import { mergeTouchingWires } from './wires/wireOps';
import { GhostIcon } from './symbols';

import ComponentPalette from './components/ComponentPalette';
import QuickAddMenu from './components/QuickAddMenu';
import WiringLayer from './components/WiringLayer';
import PresenceLayer from './components/PresenceLayer';

import OnlineUsers from './components/OnlineUsers';
import PropertyPanel from './components/PropertyPanel';
import { useCopyImage } from './hooks/useCopyImage';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import GroupPanel from './cloud/GroupPanel';
import GroupTabBar from './components/GroupTabBar';
import { useGroups } from './cloud/useGroups';
import { useUndo } from './hooks/useUndo';
import RectNode from './nodes/RectNode';

import TextNode from './nodes/TextNode';
import TextDialog from './components/TextDialog';
import LatexText, { formatLatexRef } from './components/LatexText';

// nodeTypes: thêm  text: TextNode

const nodeTypes = {
  nmos: NmosNode, pmos: PmosNode, npn: NpnNode, pnp: NpnNode,
  res: TwoTerminalNode, cap: TwoTerminalNode, vsource: TwoTerminalNode, isource: TwoTerminalNode,
  vdd: SymbolNode, gnd: SymbolNode, opamp: SymbolNode, fdopamp: SymbolNode,
  inverter: SymbolNode, buffer: SymbolNode, and: SymbolNode, or: SymbolNode,
  nand: SymbolNode, nor: SymbolNode, xor: SymbolNode, xnor: SymbolNode,
  dff: SymbolNode, mux: SymbolNode,
  sw_open: SymbolNode, sw_closed: SymbolNode, sw_spdt: SymbolNode,
  sw_sp3t: SymbolNode, sw_sp4t: SymbolNode,
  rect: RectNode, text: TextNode,
};

const initialNodes = mockData.documents[0].instances.map((inst) => ({
  id: inst.id === 'M1' ? 'M_1' : inst.id === 'M2' ? 'M_2' : inst.id,
  type: 'nmos',
  position: {
    x: Math.round(inst.placement.position.x / 10) * 10,
    y: Math.round(((inst.id === 'M1' || inst.id === 'M_1' || inst.id === 'M_{1}') ? inst.placement.position.y + 60 : inst.placement.position.y) / 10) * 10,
  },
  data: {
    reference: formatLatexRef(inst.reference) || (inst.id === 'M1' ? 'M_{1}' : inst.id === 'M2' ? 'M_{2}' : formatLatexRef(inst.id)),
    w: inst.netlist.parameters.w,
    l: inst.netlist.parameters.l,
  },
  style: { width: 160, height: 100, background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
}));




function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  
  const [edges, , onEdgesChange] = useEdgesState([]);

  // ĐỔI: useState đổi tên thành setWiresRaw (nội bộ), rồi định nghĩa setWires bọc bên dưới
  const [wires, setWiresRaw] = useState([]);

  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const wiresRef = useRef(wires);
  useEffect(() => { wiresRef.current = wires; }, [wires]);

  const setWires = useCallback((updater) => {
    setWiresRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return mergeTouchingWires(next, nodesRef.current);
    });
  }, []);
  
  const [isWiringMode, setIsWiringMode] = useState(false);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  
  const [moveGroup, setMoveGroup] = useState(null); 
  const [copyGroup, setCopyGroup] = useState(null);   // <-- thêm
  const [cursorNodeId, setCursorNodeId] = useState(null); 
  const [isRotatingFlag, setIsRotatingFlag] = useState(false);
  const groupsState = useGroups();
  const [circuitId, setCircuitIdState] = useState(() => getCircuitId());
  const switchCircuitRoom = useCallback((id) => {
    persistCircuitId(id);
    setCircuitIdState(id);
  }, []);
  const startNewCircuitRoom = useCallback(() => {
    setCircuitIdState(newCircuitId());
  }, []);
    // Undo: theo dõi nodes/wires; dữ liệu từ xa đi qua remoteSet* để không bị tính là thao tác của mình
    // Undo: theo dõi nodes/wires; dữ liệu từ xa đi qua remoteSet* để không bị tính là thao tác của mình
  const { undo, remoteSetNodes, remoteSetWiresRaw } = useUndo({ nodes, wires, setNodes, setWiresRaw, circuitId });

  // Ghi lại kích thước sau khi kéo cạnh/góc RectNode (chỉ khi thả tay) và chữ trong hình
  const handleResizeRect = useCallback((id, { width, height }) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, width, height } } : n)));
  }, [setNodes]);

  const handleRectTextChange = useCallback((id, text) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)));
  }, [setNodes]);

  useCircuitSync({
    circuitId: circuitId,
    nodes, wires, setNodes: remoteSetNodes, setWiresRaw: remoteSetWiresRaw,
    isEditingLocally: !!(moveGroup || cursorNodeId || isRotatingFlag),
    seedNodes: initialNodes,
    onResizeRect: handleResizeRect,
    onTextChangeRect: handleRectTextChange,
  });

  const { screenToFlowPosition, flowToScreenPosition, fitView } = useReactFlow();

  const [contextMenu, setContextMenu] = useState(null);
  const [selected, setSelected] = useState(null);

  const selectedIds = [
    ...nodes.filter((n) => n.selected).map((n) => n.id),
    ...wires.filter((w) => w.selected).map((w) => w.id),
  ];
  if (selected && !selectedIds.includes(selected.id)) selectedIds.push(selected.id);

  const { others, me, sendCursor, rename } = usePresence({
    circuitId: circuitId,
    selectedIds,
  });

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [placingType, setPlacingType] = useState(null);
  const [ghostScreenPos, setGhostScreenPos] = useState(null);
  const [dragType, setDragType] = useState(null);
  const [dragGhostPos, setDragGhostPos] = useState(null);

  const reactFlowWrapper = useRef(null);
  const lastMouse = useRef({ x: 0, y: 0 }); 

  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  
  const [textDialog, setTextDialog] = useState(null);
  const [textTool, setTextTool] = useState(null);   // { phase: 'place'|'attach', text, latex }
  const [textGhost, setTextGhost] = useState(null);

  const openTextDialog = useCallback(() => {
    setSelected(null);
    setTextTool(null);
    setTextDialog({ mode: 'create' });
  }, []);
  const cancelTextTool = useCallback(() => {
    setTextDialog(null);
    setTextTool(null);
    setTextGhost(null);
  }, []);

  const handleTextConfirm = useCallback(({ text, latex, attach }) => {
    const d = textDialog;
    setTextDialog(null);
    if (!d) return;
    if (d.mode === 'edit') {
      if (d.kind === 'node') {
        setNodes((ns) => ns.map((n) => (n.id === d.nodeId ? { ...n, data: { ...n.data, text, latex } } : n)));
      } else {
        setWires((ws) => ws.map((w) => (w.id === d.wireId
          ? { ...w, labels: (w.labels || []).map((l) => (l.id === d.labelId ? { ...l, text, latex } : l)) }
          : w)));
      }
      return;
    }
    setTextTool({ phase: attach ? 'attach' : 'place', text, latex });
  }, [textDialog, setNodes, setWires]);

  const handleTextDelete = useCallback(() => {
    const d = textDialog;
    setTextDialog(null);
    if (!d) return;
    if (d.kind === 'node') {
      setNodes((ns) => ns.filter((n) => n.id !== d.nodeId));
      setSelected(null);
    } else {
      setWires((ws) => ws.map((w) => (w.id === d.wireId
        ? { ...w, labels: (w.labels || []).filter((l) => l.id !== d.labelId) }
        : w)));
    }
  }, [textDialog, setNodes, setWires]);

  const handleAttachLabel = useCallback((wireId, ratio) => {
    if (!textTool) return;
    const label = {
      id: `lbl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: textTool.text, latex: textTool.latex, ratio,
    };
    setWires((ws) => ws.map((w) => (w.id === wireId ? { ...w, labels: [...(w.labels || []), label] } : w)));
    setTextTool(null);
  }, [textTool, setWires]);

  useEffect(() => {
    const onEdit = (e) => {
      if (textTool || moveGroup || copyGroup || cursorNodeId) return;
      const n = nodesRef.current.find((x) => x.id === e.detail?.id);
      if (n && n.type === 'text') setTextDialog({ mode: 'edit', kind: 'node', nodeId: n.id, initial: n.data });
    };
    window.addEventListener('text-node-edit', onEdit);
    return () => window.removeEventListener('text-node-edit', onEdit);
  }, [textTool, moveGroup, copyGroup, cursorNodeId]);

  const handleEditLabel = useCallback((wireId, labelId) => {
    const label = wiresRef.current.find((w) => w.id === wireId)?.labels?.find((l) => l.id === labelId);
    if (label) setTextDialog({ mode: 'edit', kind: 'wire', wireId, labelId, initial: label });
  }, []);
  // --- STATE LƯU TỌA ĐỘ BẮT ĐẦU QUÉT KHỐI ---
  const selectionStart = useRef(null); 
  // -----------------------------------------

  const [tx, ty, zoom] = useStore((s) => s.transform);
  const handleCopyImage = useCopyImage({
    nodes, wires, selected, tx, ty, zoom,
    setNodes, setWires, setSelected, reactFlowWrapper,
  });
  // --- NÂNG CẤP COPY BAO GỒM CẢ DÂY NỐI ---
  

  const nextId = useCallback((prefix) => {
    let i = 1;
    const cleanPrefix = prefix.replace(/_$/, '');
    const isDevicePrefix = ['M', 'Q', 'R', 'C', 'U', 'V', 'I'].includes(cleanPrefix) || prefix.endsWith('_');
    const existing = new Set(nodes.map((n) => n.id));
    const existingRefs = new Set(nodes.map((n) => n.data?.reference).filter(Boolean));
    const checkExists = (num) => {
      const v1 = `${cleanPrefix}_{${num}}`;
      const v2 = `${cleanPrefix}_${num}`;
      const v3 = `${cleanPrefix}${num}`;
      const v4 = `${prefix}${num}`;
      return existing.has(v1) || existing.has(v2) || existing.has(v3) || existing.has(v4) ||
             existingRefs.has(v1) || existingRefs.has(v2) || existingRefs.has(v3) || existingRefs.has(v4);
    };
    while (checkExists(i)) {
      i++;
    }
    return isDevicePrefix ? `${cleanPrefix}_{${i}}` : `${prefix}${i}`;
  }, [nodes]);

  const addNodeAt = useCallback((comp, flowPos) => {
    const id = nextId(comp.refPrefix);
    const snappedX = Math.round(flowPos.x / GRID) * GRID;
    const snappedY = Math.round(flowPos.y / GRID) * GRID;
    setNodes((ns) => [...ns, {
      id,
      type: comp.type,
      position: { x: snappedX, y: snappedY },
      data: { reference: id, ...comp.defaultData, onResize: handleResizeRect, onTextChange: handleRectTextChange },
      style: {
        width: comp.defaultData?.width || 160, height: comp.defaultData?.height || 100,
        background: 'transparent', border: 'none', padding: 0, boxShadow: 'none',
      },
    }]);
  }, [nextId, setNodes, handleResizeRect, handleRectTextChange]);

  useEffect(() => {
    if (textTool?.phase !== 'place') return;
    const snap = (e) => {
      const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      return { x: Math.round(fp.x / GRID) * GRID, y: Math.round(fp.y / GRID) * GRID };
    };
    const onMove = (e) => setTextGhost(flowToScreenPosition(snap(e)));
    const onClick = (e) => {
      if (e.target.closest?.('[data-text-ui]')) return;
      const p = snap(e);
      const id = nextId('TXT');
      setNodes((ns) => [...ns, {
        id, type: 'text', position: p,
        data: { text: textTool.text, latex: textTool.latex, size: 14 },
        style: nodeBoxStyle({ type: 'text' }),
      }]);
      setTextTool(null);
      setTextGhost(null);
    };
    const t = setTimeout(() => {   // trì hoãn để cú click nút OK không bị tính là click đặt chữ
      window.addEventListener('mousemove', onMove);
      window.addEventListener('click', onClick);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick);
    };
  }, [textTool, screenToFlowPosition, flowToScreenPosition, nextId, setNodes]);

  useEffect(() => {
    if (!textDialog) return;
    const onKey = (e) => { if (e.key === 'Escape') cancelTextTool(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [textDialog, cancelTextTool]);

  const snappedGhostScreenPos = useCallback((clientX, clientY) => {
    const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
    return flowToScreenPosition({
      x: Math.round((flowPos.x - 80) / GRID) * GRID,
      y: Math.round((flowPos.y - 50) / GRID) * GRID,
    });
  }, [screenToFlowPosition, flowToScreenPosition]);

  const handleGlobalMouseMove = useCallback((e) => {
    lastMouse.current = { x: e.clientX, y: e.clientY };
    const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    sendCursor(fp.x, fp.y);

    const applyGroup = (group) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const dx = Math.round(flowPos.x / GRID) * GRID - group.startX;
      const dy = Math.round(flowPos.y / GRID) * GRID - group.startY;

      if (group.items.length > 0) {
        setNodes((ns) => ns.map((n) => {
          const item = group.items.find((i) => i.id === n.id);
          return item ? { ...n, position: { x: item.initialX + dx, y: item.initialY + dy } } : n;
        }));
      }
      if (group.wireItems && group.wireItems.length > 0) {
        const groupIds = new Set(group.wireItems.map((i) => i.id));
        setWiresRaw((ws) => ws.map((w) => {
          const item = group.wireItems.find((i) => i.id === w.id);
          if (!item) return w;
          const newPoints = item.initialPoints.map((p) => {
            if (p.nodeId) return p;
            if (p.onWireId) return groupIds.has(p.onWireId) ? { ...p, x: p.x + dx, y: p.y + dy } : p;
            return { x: p.x + dx, y: p.y + dy };
          });
          return { ...w, points: newPoints };
        }));
      }
    };

    if (moveGroup) applyGroup(moveGroup);
    else if (copyGroup) applyGroup(copyGroup);
    else if (cursorNodeId) {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const snappedX = Math.round((flowPos.x - 80) / GRID) * GRID;
      const snappedY = Math.round((flowPos.y - 50) / GRID) * GRID;
      setNodes((ns) => ns.map((n) => n.id === cursorNodeId ? { ...n, position: { x: snappedX, y: snappedY } } : n));
    }
  }, [moveGroup, copyGroup, cursorNodeId, screenToFlowPosition, setNodes, setWiresRaw, sendCursor]);
  // --- BẮT ĐẦU VÀ KẾT THÚC QUÉT KHỐI DÂY ĐIỆN ---
  const handleMouseDown = useCallback((e) => {
  if (e.button !== 0) return;
  if (!isWiringMode && !isMoveMode && !isCopyMode && !placingType && !textTool) {
    selectionStart.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setIsBoxSelecting(true); // bắt đầu kéo -> tắt pointer-events của wire
  }
  }, [isWiringMode, isMoveMode, isCopyMode, placingType, textTool, screenToFlowPosition]);

  const handleNodesChange = useCallback((changes) => {
    // Loại bỏ các thay đổi type 'select' do React Flow tự phát sinh khi box-select
    // hoặc click — để tránh nó tự chọn node theo khung 160x100 ẩn, giẫm lên logic
    // getSymbolBBox tự viết. Selection giờ CHỈ được quyết định bởi handleMouseUp
    // (box-select) và onNodeClick (click đơn) trong code của bạn.
    const filtered = changes.filter((c) => c.type !== 'select');
    onNodesChange(filtered);
  }, [onNodesChange]);

  const handleMouseUp = useCallback((e) => {
  if (e.button !== 0) return;
  if (selectionStart.current) {
    const endPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const minX = Math.min(selectionStart.current.x, endPos.x);
    const maxX = Math.max(selectionStart.current.x, endPos.x);
    const minY = Math.min(selectionStart.current.y, endPos.y);
    const maxY = Math.max(selectionStart.current.y, endPos.y);

    if (maxX - minX > 5 && maxY - minY > 5) {
      // --- Chọn NODE: bounding box của node phải nằm TRỌN trong vùng kéo ---
      setNodes((ns) => ns.map((n) => {
        const box = getSymbolBBox(n);
        const fullyInside = box.x1 >= minX && box.x2 <= maxX && box.y1 >= minY && box.y2 <= maxY;
        return { ...n, selected: fullyInside };
      }));

      // --- Chọn WIRE: TẤT CẢ các điểm của dây phải nằm trong vùng kéo ---
      setWires((ws) => ws.map((w) => {
        const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);
        const fullyInside = pts.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
        return { ...w, selected: fullyInside };
      }));
    } else {
      // Kéo quá nhỏ (gần như click) -> bỏ chọn hết, tránh chọn nhầm khi chỉ lỡ tay rê nhẹ
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
      setWires((ws) => ws.map((w) => ({ ...w, selected: false })));
    }
    selectionStart.current = null;
  }
    setIsBoxSelecting(false); // kết thúc kéo -> bật lại pointer-events của wire

}, [screenToFlowPosition, nodes, setWires, setNodes]);
  // ----------------------------------------------

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragGhostPos(snappedGhostScreenPos(e.clientX, e.clientY));
  }, [snappedGhostScreenPos]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragGhostPos(null);
    const type = e.dataTransfer.getData('application/reactflow');
    setDragType(null);
    const comp = COMPONENT_LIBRARY.find((c) => c.type === type);
    if (!comp) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNodeAt(comp, { x: flowPos.x - 80, y: flowPos.y - 50 });
  }, [screenToFlowPosition, addNodeAt]);

  const onDragLeave = useCallback(() => setDragGhostPos(null), []);

  useEffect(() => {
    if (!placingType) return;
    const onMove = (e) => setGhostScreenPos(snappedGhostScreenPos(e.clientX, e.clientY));
    const onClick = (e) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(placingType, { x: flowPos.x - 80, y: flowPos.y - 50 });
      setPlacingType(null);
      setGhostScreenPos(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setPlacingType(null); setGhostScreenPos(null); }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [placingType, screenToFlowPosition, addNodeAt, snappedGhostScreenPos]);



  // --- NÂNG CẤP XÓA: HỖ TRỢ XÓA NHIỀU DÂY ĐIỆN CÙNG LÚC ---
  const deleteSelected = useCallback(() => {
    const activeNodes = nodes.filter((n) => n.selected).map((n) => n.id);
    const activeWires = wires.filter((w) => w.selected).map((w) => w.id); // Lấy các dây đang bôi đen

    setNodes((ns) => ns.filter((n) => !activeNodes.includes(n.id) && !(selected?.kind === 'node' && selected.id === n.id)));
    
    setWires((ws) => ws.filter((w) => {
      if (activeWires.includes(w.id)) return false; // Xóa dây quét khối
      if (selected?.kind === 'wire' && selected.id === w.id) return false; // Xóa dây click thủ công
      if (w.points.some((p) => activeNodes.includes(p.nodeId) || (selected?.kind === 'node' && selected.id === p.nodeId))) return false;
      return true;
    }));
    
    setSelected(null);
  }, [nodes, wires, selected, setNodes, setWires]);
  // -------------------------------------------------------

  useKeyboardShortcuts({
    nodes, wires, selected, moveGroup, copyGroup, cursorNodeId,
    isWiringMode, isMoveMode, isCopyMode, placingType,
    nodesRef, wiresRef, lastMouse,
    setNodes, setWires, setWiresRaw, setSelected,
    setMoveGroup, setCopyGroup, setCursorNodeId,
    setIsMoveMode, setIsCopyMode, setIsWiringMode,
    setIsRotatingFlag, setQuickAddOpen,
    screenToFlowPosition, fitView, deleteSelected, undo,
    textTool, openTextDialog, cancelTextTool,
  });
 
 useEffect(() => {
  const forceDropOnClick = (e) => {
    if ((moveGroup || copyGroup || cursorNodeId) && e.button === 0) {
      const movedIds = new Set([
        ...(moveGroup?.wireItems || []),
        ...(copyGroup?.wireItems || []),
      ].map((i) => i.id));
      setWires((ws) => {
        const cleaned = ws.map((w) => {
          if (w.lockedVertical === undefined) return w;
          const { lockedVertical, ...rest } = w;
          return rest;
        });
        return attachFreeEndpointsToPorts(cleaned, nodesRef.current, movedIds);
      });
      setMoveGroup(null);
      setCopyGroup(null);
      setCursorNodeId(null);
      setIsMoveMode(false);
      setIsCopyMode(false);
    }
  };
  window.addEventListener('mousedown', forceDropOnClick, { capture: true });
  return () => window.removeEventListener('mousedown', forceDropOnClick, { capture: true });
}, [moveGroup, copyGroup, cursorNodeId]);
  const handlePaneClick = () => {
    if (textTool) return;
    if (moveGroup || copyGroup || cursorNodeId) {
      setMoveGroup(null);
      setCopyGroup(null);
      setCursorNodeId(null);
      setIsMoveMode(false);
      setIsCopyMode(false);
    } else if (!isWiringMode && !placingType) {
      setSelected(null);
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
      setWires((ws) => ws.map((w) => ({ ...w, selected: false })));
    }
  };

  // Click có nằm trong vùng xanh (bbox thật của ký hiệu) không
  const isInsideSymbol = (e, node) => {
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const b = getSymbolBBox(node);
    return p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2;
  };
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#f4f4f4', display: 'flex', flexDirection: 'column' }}>
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <ComponentPalette onComponentDragStart={(type) => setDragType(type)} />

      <div 
        ref={reactFlowWrapper} 
        onMouseMove={handleGlobalMouseMove}
        
        onContextMenu={(e) => {
          e.preventDefault();
          const hasSelection = nodes.some(n => n.selected) || wires.some(w => w.selected);
          if (hasSelection) setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{ position: 'relative', flex: 1, height: '100%', minWidth: 0, overflow: 'hidden' }}
      >
        {contextMenu && (
          <div
            id="context-menu" 
            style={{
              position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 100,
              background: '#fff', border: '1px solid #ddd', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', padding: '4px 0', minWidth: 160,
              fontFamily: 'sans-serif', fontSize: 13, color: '#333'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{ padding: '8px 16px', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f0f6ff'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                handleCopyImage();
                setContextMenu(null);
              }}
            >
              📋 Copy as Image (Transparent)
            </div>
          </div>
        )}
        


        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          
          nodesDraggable={false} 
          panOnDrag={[1, 2]} 
          selectionMode="partial" 

          elementsSelectable={!isWiringMode && !placingType && !isMoveMode && !isCopyMode && !textTool}
          selectionOnDrag={!isWiringMode && !placingType && !isMoveMode && !isCopyMode && !textTool}    
          
          selectNodesOnDrag={false}
          onSelectionStart={handleMouseDown}
          onSelectionEnd={handleMouseUp}
          
          onNodeClick={(e, node) => {
            if (textTool) return;
            if (moveGroup || copyGroup || cursorNodeId) {
              setMoveGroup(null);
              setCopyGroup(null);
              setCursorNodeId(null);
              setIsMoveMode(false);
              setIsCopyMode(false);
              return;
            }

            // Click ngoài vùng xanh -> xử lý như click ra nền
            if (!isInsideSymbol(e, node)) {
              handlePaneClick();
              return;
            }

            if (isMoveMode) {
              const flowPos = screenToFlowPosition(lastMouse.current);
              setMoveGroup({
                startX: Math.round(flowPos.x / GRID) * GRID,
                startY: Math.round(flowPos.y / GRID) * GRID,
                items: [{ id: node.id, initialX: node.position.x, initialY: node.position.y }]
              });
            } else if (isCopyMode) {
              const rawPrefix = node.type === 'text' ? 'TXT' : ((node.data?.reference || 'U').replace(/[0-9{}]/g, '') || 'U');
              const prefix = (['M', 'Q', 'R', 'C', 'U'].includes(rawPrefix.replace(/_$/, '')))
                ? `${rawPrefix.replace(/_$/, '')}_`
                : rawPrefix;
              const newId = nextId(prefix);
              const newNode = { ...node, id: newId, data: node.type === 'text' ? { ...node.data } : { ...node.data, reference: newId }, position: { ...node.position }, selected: false };
              setNodes((ns) => [...ns, newNode]);
              setCursorNodeId(newId); 
            } else if (!isWiringMode && !placingType) {
              setSelected({ kind: 'node', id: node.id });
              setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === node.id })));
              setWires(ws => ws.map(w => ({ ...w, selected: false })));
            }
          }}
          onPaneClick={handlePaneClick}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          snapToGrid
          snapGrid={[GRID, GRID]}
          minZoom={0.2}
          maxZoom={5}
          fitView
        >
          <Background gap={GRID} color="#ccc" size={1} />
        </ReactFlow>

        <div style={{ pointerEvents: isWiringMode ? 'auto' : 'none' }}>
            <WiringLayer
                isWiringMode={isWiringMode}
                isBoxSelecting={isBoxSelecting}
                nodes={nodes}
                wires={wires}
                setWires={setWires}
                setNodes={setNodes}
                selected={selected}
                setSelected={setSelected}
                attachTool={textTool?.phase === 'attach' ? textTool : null}
                onAttachLabel={handleAttachLabel}
                onEditLabel={handleEditLabel}
            />
        </div>
        <PresenceLayer others={others} nodes={nodes} wires={wires} />
        <OnlineUsers me={me} others={others} onRename={rename} />
        

        <PropertyPanel selected={selected} nodes={nodes} setNodes={setNodes} wires={wires} setWires={setWires} onDelete={deleteSelected} />
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 21, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <GroupPanel
            nodes={nodes} wires={wires} setNodes={setNodes} setWires={setWiresRaw}
            onOpenRoom={switchCircuitRoom}
            onNewRoom={startNewCircuitRoom}
            logged={groupsState.logged}
            email={groupsState.email}
            login={groupsState.login}
            logout={groupsState.logout}
            group={groupsState.group}
            groupId={groupsState.groupId}
            myRole={groupsState.myRole}
            groupMsg={groupsState.msg}
            onResizeRect={handleResizeRect}
            onTextChangeRect={handleRectTextChange}
          />
          <CloudPanel
            nodes={nodes} wires={wires} setNodes={setNodes} setWires={setWires}
            onOpenRoom={switchCircuitRoom}
            onNewRoom={startNewCircuitRoom}
            onResizeRect={handleResizeRect}
            onTextChangeRect={handleRectTextChange}
          />
        </div>
      </div>
        {textDialog && (
          <div data-text-ui>
            <TextDialog
              key={`${textDialog.mode}-${textDialog.nodeId || textDialog.labelId || 'new'}`}
              mode={textDialog.mode}
              initial={textDialog.initial}
              onConfirm={handleTextConfirm}
              onCancel={cancelTextTool}
              onDelete={handleTextDelete}
            />
          </div>
        )}

        {textTool && (
          <div data-text-ui style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
            background: '#1677ff', color: '#fff', padding: '6px 14px', borderRadius: 16,
            fontFamily: 'sans-serif', fontSize: 13, pointerEvents: 'none',
          }}>
            {textTool.phase === 'attach' ? 'Click vào dây để gắn nhãn' : 'Click để đặt văn bản'} — Esc để hủy
          </div>
        )}

        {textTool?.phase === 'place' && textGhost && (
          <div style={{ position: 'fixed', left: textGhost.x, top: textGhost.y, transform: `scale(${zoom})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: 48, opacity: 0.6, padding: 2 }}>
            <LatexText text={textTool.text} latex={textTool.latex} size={14} />
          </div>
        )}
        {quickAddOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.15)' }} onClick={() => setQuickAddOpen(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <QuickAddMenu onPick={(comp) => { setQuickAddOpen(false); setPlacingType(comp); setGhostScreenPos(null); }} />
            </div>
          </div>
        )}

        {placingType && ghostScreenPos && (
          <div style={{ position: 'fixed', left: ghostScreenPos.x, top: ghostScreenPos.y, transform: `scale(${zoom})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: 48, opacity: 0.6 }}>
            <GhostIcon type={placingType.type} data={placingType.defaultData} />
          </div>
        )}

        {dragGhostPos && (
          <div style={{ position: 'fixed', left: dragGhostPos.x, top: dragGhostPos.y, transform: `scale(${zoom})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: 48, opacity: 0.6 }}>
            <GhostIcon type={dragType || 'nmos'} />
          </div>
        )}
      </div>
    </div>

      <GroupTabBar
        logged={groupsState.logged}
        email={groupsState.email}
        myGroups={groupsState.myGroups}
        groupId={groupsState.groupId}
        onSelect={groupsState.openGroup}
        onCreate={groupsState.handleCreateGroup}
        onLogin={groupsState.login}
      />
    </div>
  );
}

export default Flow