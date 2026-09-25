import React, { useCallback, useState, useEffect, useRef } from 'react';
import ReactFlow, { Background, Controls, useNodesState, useEdgesState, useReactFlow, useStore } from 'reactflow';
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

import { GRID, COMPONENT_LIBRARY } from './constants';
import { getSymbolBBox } from './geometry/ports';
import { resolvePoints } from './routing/resolveWire';
import { attachFreeEndpointsToPorts } from './wires/snap';
import { mergeTouchingWires } from './wires/wireOps';
import { GhostIcon } from './symbols';

import ComponentPalette from './components/ComponentPalette';
import QuickAddMenu from './components/QuickAddMenu';
import WiringLayer from './components/WiringLayer';
import PresenceLayer from './components/PresenceLayer';
import RoomBar from './components/RoomBar';
import OnlineUsers from './components/OnlineUsers';
import PropertyPanel from './components/PropertyPanel';
import { useCopyImage } from './hooks/useCopyImage';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import GroupPanel from './cloud/GroupPanel';
import GroupTabBar from './components/GroupTabBar';   // + thêm dòng này
import { useGroups } from './cloud/useGroups';          // + thêm dòng này
import { useUndo } from './hooks/useUndo';

const nodeTypes = { nmos: NmosNode, pmos: PmosNode, npn: NpnNode, pnp: NpnNode, res: TwoTerminalNode, cap: TwoTerminalNode, vdd: SymbolNode, gnd: SymbolNode, opamp: SymbolNode, fdopamp: SymbolNode };

const initialNodes = mockData.documents[0].instances.map((inst) => ({
  id: inst.id,
  type: 'nmos',
  position: {
    x: Math.round(inst.placement.position.x / 10) * 10,
    y: Math.round((inst.id === 'M1' ? inst.placement.position.y + 60 : inst.placement.position.y) / 10) * 10,
  },
  data: { reference: inst.reference, w: inst.netlist.parameters.w, l: inst.netlist.parameters.l },
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
  const groupsState = useGroups();   // + thêm dòng này
  const [circuitId, setCircuitIdState] = useState(() => getCircuitId());
  const switchCircuitRoom = useCallback((id) => {
    persistCircuitId(id);
    setCircuitIdState(id);
  }, []);
  const startNewCircuitRoom = useCallback(() => {
    setCircuitIdState(newCircuitId());
  }, []);
    // Undo: theo dõi nodes/wires; dữ liệu từ xa đi qua remoteSet* để không bị tính là thao tác của mình
  const { undo, remoteSetNodes, remoteSetWiresRaw } = useUndo({ nodes, wires, setNodes, setWiresRaw, circuitId });

  useCircuitSync({
    circuitId: circuitId,
    nodes, wires, setNodes: remoteSetNodes, setWiresRaw: remoteSetWiresRaw,
    isEditingLocally: !!(moveGroup || cursorNodeId || isRotatingFlag),
    seedNodes: initialNodes,
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
    const existing = new Set(nodes.map((n) => n.id));
    while (existing.has(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  }, [nodes]);

  const addNodeAt = useCallback((comp, flowPos) => {
    const id = nextId(comp.refPrefix);
    const snappedX = Math.round(flowPos.x / GRID) * GRID;
    const snappedY = Math.round(flowPos.y / GRID) * GRID;
    setNodes((ns) => [...ns, {
      id,
      type: comp.type,
      position: { x: snappedX, y: snappedY },
      data: { reference: id, ...comp.defaultData },
      style: { width: 160, height: 100, background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
    }]);
  }, [nextId, setNodes]);

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
  if (!isWiringMode && !isMoveMode && !isCopyMode && !placingType) {
    selectionStart.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setIsBoxSelecting(true); // bắt đầu kéo -> tắt pointer-events của wire
  }
}, [isWiringMode, isMoveMode, isCopyMode, placingType, screenToFlowPosition]);

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
        
        <div 
          id="ui-overlay" 
          style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
            background: (isWiringMode || isMoveMode || isCopyMode) ? '#ff4d4f' : '#fff', 
            color: (isWiringMode || isMoveMode || isCopyMode) ? '#fff' : '#000',
            padding: '8px 16px', borderRadius: 8, boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: 13, whiteSpace: 'nowrap'
          }}>
          {isWiringMode && 'Đang NỐI DÂY (W) — Click để vẽ, đúp click kết thúc'}
          {isMoveMode && (moveGroup ? `Đang DI CHUYỂN ${moveGroup.items.length} linh kiện — R xoay, Ctrl+R lật. Click thả` : 'Chế độ MOVE (M) — Click 1 linh kiện để nhấc lên')}
          {isCopyMode && (copyGroup
            ? `Đang SAO CHÉP ${copyGroup.items.length} linh kiện — R xoay, Ctrl+R lật. Click thả`
            : (cursorNodeId
                ? 'Đang SAO CHÉP — R xoay, Ctrl+R lật. Click thả'
                : 'Chế độ COPY (C) — Click 1 linh kiện, hoặc bôi đen 1 khối rồi bấm C'))}
          {placingType && `Đang đặt ${placingType.label} (I) — Click thả, Esc hủy`}
          {!isWiringMode && !isMoveMode && !isCopyMode && !placingType && 'Chế độ: BÌNH THƯỜNG (Sẵn sàng chọn)'}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          
          nodesDraggable={false} 
          panOnDrag={[1, 2]} 
          selectionMode="partial" 

          elementsSelectable={!isWiringMode && !placingType && !isMoveMode && !isCopyMode}
          selectionOnDrag={!isWiringMode && !placingType && !isMoveMode && !isCopyMode}     
          
          selectNodesOnDrag={false}
          onSelectionStart={handleMouseDown}
          onSelectionEnd={handleMouseUp}
          
          onNodeClick={(e, node) => {
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
              const prefix = node.data.reference.replace(/[0-9]/g, '') || 'U';
              const newId = nextId(prefix);
              const newNode = { ...node, id: newId, data: { ...node.data, reference: newId }, position: { ...node.position }, selected: false };
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
          fitView
        >
          <Background gap={GRID} color="#ddd" size={2} />
          <Controls />
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
            />
        </div>
        <PresenceLayer others={others} nodes={nodes} wires={wires} />
        <OnlineUsers me={me} others={others} onRename={rename} />
        

        <PropertyPanel selected={selected} nodes={nodes} setNodes={setNodes} wires={wires} setWires={setWires} onDelete={deleteSelected} />
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 21, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        <RoomBar circuitId={circuitId} />
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
          />
          <CloudPanel
            nodes={nodes} wires={wires} setNodes={setNodes} setWires={setWires}
            onOpenRoom={switchCircuitRoom}
            onNewRoom={startNewCircuitRoom}
          />
        </div>
      </div>
        
        {quickAddOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.15)' }} onClick={() => setQuickAddOpen(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <QuickAddMenu onPick={(comp) => { setQuickAddOpen(false); setPlacingType(comp); setGhostScreenPos(null); }} />
            </div>
          </div>
        )}

        {placingType && ghostScreenPos && (
          <div style={{ position: 'fixed', left: ghostScreenPos.x, top: ghostScreenPos.y, transform: `scale(${zoom})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: 48, opacity: 0.6 }}>
            <GhostIcon type={placingType.type} />
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