import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import ReactFlow, { Background, useNodesState, useEdgesState, useReactFlow, useStore } from 'reactflow';
import 'reactflow/dist/style.css';

import mockData from './data/mockData.json';
import CloudPanel from './cloud/CloudPanel';
import { isLoggedIn, driveGetEmail, verifyDriveAccess } from './cloud/driveStorage';
import NmosNode from './nodes/NmosNode';
import PmosNode from './nodes/PmosNode';
import NpnNode from './nodes/NpnNode';
import TwoTerminalNode from './nodes/TwoTerminalNode';
import SymbolNode from './nodes/SymbolNode';

import { useCircuitSync } from './realtime/useCircuitSync';
import { getCircuitId, setCircuitId as persistCircuitId, newCircuitId } from './realtime/circuitId';
import { usePresence } from './realtime/usePresence';

import { GRID, COMPONENT_LIBRARY, nodeBoxStyle, findPort } from './constants';
import { getSymbolBBox, getTransformedPort } from './geometry/ports';
import { computeAlignmentGuides } from './geometry/alignment';
import { resolvePoints } from './routing/resolveWire';
import { projectOnPath, pointAtRatio } from './geometry/pathUtils';
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

import { useUndo } from './hooks/useUndo';
import RectNode from './nodes/RectNode';
import WaveNode from './nodes/WaveNode';

import TextNode from './nodes/TextNode';
import TextDialog from './components/TextDialog';
import LatexText, { formatLatexRef } from './components/LatexText';
import { expandBusLabels } from './utils/busLabelExpander';
import CircuitTabBar from './components/CircuitTabBar';
import ConfirmDeleteTabDialog from './components/ConfirmDeleteTabDialog';
import { instantiateClonedBlock } from './utils/cloneUtils';
import SpiceNetlistDialog from './components/SpiceNetlistDialog';
import { generateSpiceNetlist } from './netlist/spiceExporter';
import WaveformTabEditor from './waveform/WaveformTabEditor';
import { DEFAULT_WAVEJSON } from './waveform/waveformPresets';

// nodeTypes: thêm  text: TextNode

const nodeTypes = {
  nmos: NmosNode, pmos: PmosNode, npn: NpnNode, pnp: NpnNode,
  res: TwoTerminalNode, cap: TwoTerminalNode, vsource: TwoTerminalNode, isource: TwoTerminalNode,
  vdd: SymbolNode, gnd: SymbolNode, opamp: SymbolNode, fdopamp: SymbolNode,
  inverter: SymbolNode, buffer: SymbolNode, and: SymbolNode, or: SymbolNode,
  nand: SymbolNode, nor: SymbolNode, xor: SymbolNode, xnor: SymbolNode,
  dff: SymbolNode, dff_sr: SymbolNode, dlatch: SymbolNode, mux: SymbolNode,
  tgate: SymbolNode,
  sw_open: SymbolNode, sw_closed: SymbolNode, sw_spdt: SymbolNode,
  sw_sp3t: SymbolNode, sw_sp4t: SymbolNode,
  arrow: SymbolNode,
  wave_pulse: WaveNode, wave_sine: WaveNode, wave_noise: WaveNode,
  rect: RectNode, box: RectNode, text: TextNode,
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

function GhostPreviews({ textTool, textGhost, placingType, ghostScreenPos, dragGhostPos, dragType }) {
  const zoom = useStore((s) => s.transform[2]);
  return (
    <>
      {textTool?.phase === 'place' && textGhost && (
        <div style={{ position: 'fixed', left: textGhost.x, top: textGhost.y, transform: `scale(${zoom})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: 48, opacity: 0.6, padding: 2 }}>
          <LatexText text={textTool.text} latex={textTool.latex} size={14} />
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
    </>
  );
}

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  
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
  const { screenToFlowPosition, flowToScreenPosition, fitView, fitBounds, setViewport } = useReactFlow();
  const [rightZoomBox, setRightZoomBox] = useState(null);
  const rightDragStartRef = useRef(null);
  const didRightDragRef = useRef(false);
  
  const [moveGroup, setMoveGroup] = useState(null); 
  const [copyGroup, setCopyGroup] = useState(null);   // <-- thêm
  const [cursorNodeId, setCursorNodeId] = useState(null); 
  const [isRotatingFlag, setIsRotatingFlag] = useState(false);
  const [isPropertyPanelOpen, setIsPropertyPanelOpen] = useState(false);
  const [sheets, setSheets] = useState(() => [
    { id: 'sheet_1', name: 'Sheet 1', type: 'schematic', nodes: initialNodes, wires: [] },
  ]);
  const [activeSheetId, setActiveSheetId] = useState('sheet_1');
  const [circuitId, setCircuitIdState] = useState(() => getCircuitId());
  const [isNetlistOpen, setIsNetlistOpen] = useState(false);
  const [confirmCloseTab, setConfirmCloseTab] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('schematic_sidebar_open');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('schematic_sidebar_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const switchCircuitRoom = useCallback((id) => {
    persistCircuitId(id);
    setCircuitIdState(id);
  }, []);

  const startNewCircuitRoom = useCallback(() => {
    const newId = newCircuitId();
    setCircuitIdState(newId);
    const resetSheet = [{ id: 'sheet_1', name: 'Sheet 1', type: 'schematic', nodes: [], wires: [] }];
    setSheets(resetSheet);
    setActiveSheetId('sheet_1');
    setNodes([]);
    setWiresRaw([]);
    setSelected(null);
  }, [setNodes, setWiresRaw]);

  // Cập nhật thuộc tính của waveform sheet đang active
  const handleUpdateActiveSheet = useCallback((updates) => {
    setSheets((prev) =>
      prev.map((s) => (s.id === activeSheetId ? { ...s, ...updates } : s))
    );
  }, [activeSheetId]);

  // Chuyển đổi giữa các trang (sheet) trong cùng một project
  const handleSelectSheet = useCallback((targetSheetId) => {
    if (targetSheetId === activeSheetId) return;

    // 1. Lưu nodes/wires của sheet hiện tại nếu là schematic
    const curNodes = nodesRef.current;
    const curWires = wiresRef.current;

    // NẾU ĐANG CÓ copyGroup: loại bỏ các node và wire tạm thời của copyGroup khỏi sheet hiện tại trước khi lưu!
    let nodesToSave = curNodes;
    let wiresToSave = curWires;
    if (copyGroup) {
      const copyNodeIds = new Set((copyGroup.items || []).map((i) => i.id));
      const copyWireIds = new Set((copyGroup.wireItems || []).map((i) => i.id));
      nodesToSave = curNodes.filter((n) => !copyNodeIds.has(n.id));
      wiresToSave = curWires.filter((w) => !copyWireIds.has(w.id));
    }

    setSheets((prev) =>
      prev.map((s) => {
        if (s.id !== activeSheetId) return s;
        if (s.type === 'waveform') return s;
        return { ...s, nodes: nodesToSave, wires: wiresToSave };
      })
    );

    // 2. Chuyển sang sheet mới
    const targetSheet = sheets.find((s) => s.id === targetSheetId);
    setActiveSheetId(targetSheetId);
    setSelected(null);

    if (targetSheet?.type !== 'waveform') {
      const destNodes = targetSheet?.nodes || [];
      const destWires = targetSheet?.wires || [];

      if (copyGroup && (copyGroup.templateNodes?.length > 0 || copyGroup.items?.length > 0)) {
        // Tái tạo khối copy trên sheet mới theo vị trí chuột
        const mouseScreen = lastMouse.current || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const flowPos = screenToFlowPosition(mouseScreen);
        const targetFlowPos = {
          x: Math.round(flowPos.x / GRID) * GRID,
          y: Math.round(flowPos.y / GRID) * GRID,
        };

        const { newNodes, newWires, copyGroup: newCg } = instantiateClonedBlock({
          templateNodes: copyGroup.templateNodes || [],
          templateWires: copyGroup.templateWires || [],
          anchor: copyGroup.anchor || targetFlowPos,
          targetFlowPos,
          destNodes,
          destWires,
        });

        setNodes([...destNodes, ...newNodes]);
        setWiresRaw([...destWires, ...newWires]);
        setCopyGroup(newCg);
        setIsCopyMode(true);
        setIsMoveMode(false);
        setIsWiringMode(false);
      } else {
        setNodes(destNodes);
        setWiresRaw(destWires);
      }
    }
  }, [activeSheetId, sheets, setNodes, setWiresRaw, copyGroup, screenToFlowPosition]);

  // Tạo thêm sheet mới trong cùng project (hỗ trợ tab 'schematic' hoặc 'waveform')
  const handleNewSheet = useCallback((tabType = 'schematic') => {
    const curNodes = nodesRef.current;
    const curWires = wiresRef.current;

    let nodesToSave = curNodes;
    let wiresToSave = curWires;
    if (copyGroup) {
      const copyNodeIds = new Set((copyGroup.items || []).map((i) => i.id));
      const copyWireIds = new Set((copyGroup.wireItems || []).map((i) => i.id));
      nodesToSave = curNodes.filter((n) => !copyNodeIds.has(n.id));
      wiresToSave = curWires.filter((w) => !copyWireIds.has(w.id));
    }

    const newId = 'sheet_' + Math.random().toString(36).slice(2, 9);

    let newSheet;
    if (tabType === 'waveform') {
      const waveCount = sheets.filter((s) => s.type === 'waveform').length + 1;
      newSheet = {
        id: newId,
        name: `Waveform ${waveCount}`,
        type: 'waveform',
        waveJson: DEFAULT_WAVEJSON,
        skin: 'default',
        nodes: [],
        wires: [],
      };
    } else {
      const schemCount = sheets.filter((s) => s.type !== 'waveform').length + 1;
      newSheet = {
        id: newId,
        name: `Sheet ${schemCount}`,
        type: 'schematic',
        nodes: [],
        wires: [],
      };
    }

    setSheets((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== activeSheetId) return s;
        if (s.type === 'waveform') return s;
        return { ...s, nodes: nodesToSave, wires: wiresToSave };
      });
      return [...updated, newSheet];
    });

    setActiveSheetId(newId);
    setSelected(null);

    if (tabType !== 'waveform') {
      if (copyGroup && (copyGroup.templateNodes?.length > 0 || copyGroup.items?.length > 0)) {
        const mouseScreen = lastMouse.current || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const flowPos = screenToFlowPosition(mouseScreen);
        const targetFlowPos = {
          x: Math.round(flowPos.x / GRID) * GRID,
          y: Math.round(flowPos.y / GRID) * GRID,
        };

        const { newNodes, newWires, copyGroup: newCg } = instantiateClonedBlock({
          templateNodes: copyGroup.templateNodes || [],
          templateWires: copyGroup.templateWires || [],
          anchor: copyGroup.anchor || targetFlowPos,
          targetFlowPos,
          destNodes: [],
          destWires: [],
        });

        setNodes(newNodes);
        setWiresRaw(newWires);
        setCopyGroup(newCg);
        setIsCopyMode(true);
        setIsMoveMode(false);
        setIsWiringMode(false);
      } else {
        setNodes([]);
        setWiresRaw([]);
      }
    }
  }, [sheets, activeSheetId, setNodes, setWiresRaw, copyGroup, screenToFlowPosition]);

  // Xóa một sheet khỏi project (chỉ thực hiện sau khi xác nhận)
  const handleCloseSheet = useCallback((sheetIdToClose) => {
    if (sheets.length <= 1) {
      // Chỉ còn 1 sheet -> reset trắng trang đó
      const resetSheet = [{ id: 'sheet_1', name: 'Sheet 1', type: 'schematic', nodes: [], wires: [] }];
      setSheets(resetSheet);
      setActiveSheetId('sheet_1');
      setNodes([]);
      setWiresRaw([]);
      setSelected(null);
      return;
    }

    const idx = sheets.findIndex((s) => s.id === sheetIdToClose);
    const remaining = sheets.filter((s) => s.id !== sheetIdToClose);
    setSheets(remaining);

    // Nếu đóng sheet đang xem, chuyển sang sheet bên cạnh
    if (activeSheetId === sheetIdToClose) {
      const nextIdx = idx >= remaining.length ? remaining.length - 1 : idx;
      const nextSheet = remaining[nextIdx];
      setActiveSheetId(nextSheet.id);
      if (nextSheet.type !== 'waveform') {
        setNodes(nextSheet.nodes || []);
        setWiresRaw(nextSheet.wires || []);
      }
      setSelected(null);
    }
  }, [sheets, activeSheetId, setNodes, setWiresRaw]);

  // Yêu cầu đóng sheet -> mở modal xác nhận
  const handleRequestCloseSheet = useCallback((sheetIdToClose) => {
    const tab = sheets.find((s) => s.id === sheetIdToClose) || { id: sheetIdToClose, name: sheetIdToClose };
    setConfirmCloseTab({
      tab: { ...tab, title: tab.name || tab.title || tab.id },
      isLastTab: sheets.length <= 1,
    });
  }, [sheets]);

  // Xác nhận đóng sheet từ modal
  const handleConfirmCloseSheet = useCallback(() => {
    if (!confirmCloseTab) return;
    const sheetIdToClose = confirmCloseTab.tab.id;
    setConfirmCloseTab(null);
    handleCloseSheet(sheetIdToClose);
  }, [confirmCloseTab, handleCloseSheet]);

  // Đổi tên sheet
  const handleRenameSheet = useCallback((sheetId, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    setSheets((prev) => prev.map((s) => (s.id === sheetId ? { ...s, name: trimmed } : s)));
  }, []);
    // Undo: theo dõi nodes/wires; dữ liệu từ xa đi qua remoteSet* để không bị tính là thao tác của mình
    // Undo: theo dõi nodes/wires; dữ liệu từ xa đi qua remoteSet* để không bị tính là thao tác của mình
  const { undo, remoteSetNodes, remoteSetWiresRaw } = useUndo({ nodes, wires, setNodes, setWiresRaw, circuitId });

  // Ghi lại kích thước sau khi kéo cạnh/góc RectNode/WaveNode (chỉ khi thả tay) và chữ trong hình
  const handleResizeRect = useCallback((id, { width, height }) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? {
      ...n,
      width,
      height,
      style: { ...n.style, width, height },
      data: { ...n.data, width, height }
    } : n)));
  }, [setNodes]);

  const handleRectTextChange = useCallback((id, text) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, text } } : n)));
  }, [setNodes]);

  const [contextMenu, setContextMenu] = useState(null);
  const [selected, setSelected] = useState(null);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const selectedIds = [
    ...nodes.filter((n) => n.selected).map((n) => n.id),
    ...wires.filter((w) => w.selected).map((w) => w.id),
  ];
  if (selected && !selectedIds.includes(selected.id)) selectedIds.push(selected.id);

  const [hasDriveAccess, setHasDriveAccess] = useState(false);
  const [driveEmail, setDriveEmail] = useState('');
  const [openCloudTrigger, setOpenCloudTrigger] = useState(0);

  const checkAuthAndAccess = useCallback(async () => {
    if (!isLoggedIn()) {
      setHasDriveAccess(false);
      setDriveEmail('');
      return;
    }
    try {
      const em = await driveGetEmail();
      setDriveEmail(em || '');
    } catch {}

    const ok = await verifyDriveAccess(circuitId);
    setHasDriveAccess(ok);
  }, [circuitId]);

  useEffect(() => {
    checkAuthAndAccess();
  }, [checkAuthAndAccess]);

  const {
    others,
    me,
    sendCursor,
    rename,
    isHost,
    hostUid,
    hostUser,
    canEdit,
    requestEditAccess,
    approveUser,
    rejectUser,
    pendingRequests,
    isPendingApproval,
    isRejected,
  } = usePresence({
    circuitId: circuitId,
    selectedIds,
    hasDriveAccess,
    driveEmail,
    activeSheetId,
  });

  useCircuitSync({
    circuitId: (typeof window !== 'undefined' && window.__disableSync) ? null : circuitId,
    sheets, setSheets,
    activeSheetId, setActiveSheetId,
    nodes, wires, setNodes: remoteSetNodes, setWiresRaw: remoteSetWiresRaw,
    isEditingLocally: !!(moveGroup || cursorNodeId || isRotatingFlag),
    seedNodes: initialNodes,
    onResizeRect: handleResizeRect,
    onTextChangeRect: handleRectTextChange,
    canEdit,
  });

  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const toggleSwitchNode = useCallback((nodeId) => {
    if (!canEdit) return;
    setNodes((ns) => ns.map((n) => {
      if (n.id !== nodeId) return n;
      if (n.type === 'sw_open' || n.type === 'sw_closed') {
        const curr = n.data?.state || (n.type === 'sw_closed' ? 'closed' : 'open');
        const next = curr === 'open' ? 'closed' : 'open';
        return { ...n, data: { ...n.data, state: next } };
      }
      if (['sw_spdt', 'sw_sp3t', 'sw_sp4t'].includes(n.type)) {
        const throws = n.type === 'sw_spdt'
          ? ['out1', 'out2']
          : n.type === 'sw_sp3t'
          ? ['out1', 'out2', 'out3']
          : ['out1', 'out2', 'out3', 'out4'];
        const curr = n.data?.targetThrow || 'out1';
        const nextIdx = (throws.indexOf(curr) + 1) % throws.length;
        return { ...n, data: { ...n.data, targetThrow: throws[nextIdx] } };
      }
      return n;
    }));
  }, [canEdit, setNodes]);

  const alignmentGuidesRef = useRef([]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__devHooks = {
        setWires,
        setNodes,
        setSheets,
        setSelected,
        setIsPropertyPanelOpen,
        toggleSwitchNode,
        getWires: () => wiresRef.current || wires,
        getNodes: () => nodesRef.current || nodes,
        getSelected: () => selectedRef.current,
        getCanEdit: () => canEdit,
        getAlignmentGuides: () => alignmentGuidesRef.current,
        generateSpiceNetlist,
        getSheets: () => sheets,
        getActiveSheetId: () => activeSheetId,
        getCopyGroup: () => copyGroup,
        setCopyGroup,
        fitView,
        setViewport,
      };
    }
  }, [setWires, setNodes, setSheets, setSelected, setIsPropertyPanelOpen, toggleSwitchNode, wires, nodes, canEdit, fitView, setViewport]);
  const [placingType, setPlacingType] = useState(null);
  const [ghostScreenPos, setGhostScreenPos] = useState(null);
  const [ghostFlowPos, setGhostFlowPos] = useState(null);
  const [dragType, setDragType] = useState(null);
  const [dragGhostPos, setDragGhostPos] = useState(null);

  const reactFlowWrapper = useRef(null);
  const lastMouse = useRef({ x: 0, y: 0 }); 

  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  
  const [textDialog, setTextDialog] = useState(null);
  const [textTool, setTextTool] = useState(null);   // { phase: 'place'|'attach', text, latex }
  const [textGhost, setTextGhost] = useState(null);

  const openWireLabelDialog = useCallback(() => {
    const sel = selectedRef.current;
    if (sel?.kind === 'wire') {
      const curWire = wiresRef.current.find((w) => w.id === sel.id);
      if (curWire) {
        setTextDialog({
          mode: 'edit',
          kind: 'wire',
          dialogType: 'wire-label',
          wireId: curWire.id,
          initial: { text: curWire.name || (curWire.labels?.[0]?.text) || '', latex: true, attach: true },
        });
        return;
      }
    } else if (sel?.kind === 'wire-name' || sel?.kind === 'wire-label') {
      const curWire = wiresRef.current.find((w) => w.id === sel.wireId);
      if (curWire) {
        setTextDialog({
          mode: 'edit',
          kind: 'wire',
          dialogType: 'wire-label',
          wireId: curWire.id,
          initial: { text: curWire.name || (curWire.labels?.[0]?.text) || '', latex: true, attach: true },
        });
        return;
      }
    }
    setSelected(null);
    setTextTool(null);
    setTextDialog({ mode: 'create', dialogType: 'wire-label', initial: { text: '', latex: true, attach: true } });
  }, []);

  const openTextNodeDialog = useCallback(() => {
    const sel = selectedRef.current;
    if (sel?.kind === 'node') {
      const n = nodesRef.current.find((x) => x.id === sel.id);
      if (n && n.type === 'text') {
        setTextDialog({
          mode: 'edit',
          kind: 'node',
          dialogType: 'text',
          nodeId: n.id,
          initial: n.data,
        });
        return;
      }
    }
    setSelected(null);
    setTextTool(null);
    setTextDialog({ mode: 'create', dialogType: 'text', initial: { text: '', latex: false, color: '#000000', attach: false } });
  }, []);

  const openTextDialog = openWireLabelDialog;
  const cancelTextTool = useCallback(() => {
    setTextDialog(null);
    setTextTool(null);
    setTextGhost(null);
  }, []);

  const handleTextConfirm = useCallback(({ text, latex, color, attach }) => {
    const d = textDialog;
    setTextDialog(null);
    if (!d) return;
    if (d.mode === 'edit') {
      if (d.kind === 'node') {
        setNodes((ns) => ns.map((n) => (n.id === d.nodeId ? { ...n, data: { ...n.data, text, latex, color: color ?? n.data?.color ?? '#000000' } } : n)));
      } else {
        const queue = expandBusLabels(text);
        if (queue.length > 1) {
          setWires((ws) => ws.map((w) => (w.id === d.wireId
            ? { ...w, name: queue[0] || undefined, labels: [] }
            : w)));
          setTextTool({
            phase: 'attach',
            queue,
            index: 1,
            text: queue[1],
            latex,
          });
          return;
        }
        setWires((ws) => ws.map((w) => (w.id === d.wireId
          ? { ...w, name: text || undefined, labels: [] }
          : w)));
      }
      return;
    }
    if (attach) {
      const queue = expandBusLabels(text);
      if (queue.length > 0) {
        setTextTool({
          phase: 'attach',
          queue,
          index: 0,
          text: queue[0],
          latex,
        });
      }
      return;
    }
    setTextTool({ phase: 'place', text, latex, color: color || '#000000' });
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
        ? { ...w, name: undefined, labels: [] }
        : w)));
      setSelected(null);
    }
  }, [textDialog, setNodes, setWires]);

  const handleAttachLabel = useCallback((wireId, ratio) => {
    if (!textTool) return;
    const currentText = textTool.text || (textTool.queue ? textTool.queue[textTool.index || 0] : '');
    setWires((ws) => ws.map((w) => (w.id === wireId ? { ...w, name: currentText || undefined, nameRatio: ratio, labels: [] } : w)));

    if (textTool.queue && textTool.index !== undefined) {
      const nextIndex = textTool.index + 1;
      if (nextIndex < textTool.queue.length) {
        setTextTool({
          ...textTool,
          index: nextIndex,
          text: textTool.queue[nextIndex],
        });
        return;
      }
    }
    setTextTool(null);
  }, [textTool, setWires]);

  useEffect(() => {
    const onEdit = (e) => {
      if (textTool || moveGroup || copyGroup || cursorNodeId) return;
      const n = nodesRef.current.find((x) => x.id === e.detail?.id);
      if (n && n.type === 'text') setTextDialog({ mode: 'edit', kind: 'node', dialogType: 'text', nodeId: n.id, initial: n.data });
    };
    window.addEventListener('text-node-edit', onEdit);
    return () => window.removeEventListener('text-node-edit', onEdit);
  }, [textTool, moveGroup, copyGroup, cursorNodeId]);

  const handleEditLabel = useCallback((wireId, labelId) => {
    const w = wiresRef.current.find((x) => x.id === wireId);
    if (w) {
      const initialText = w.name || (w.labels?.find((l) => l.id === labelId)?.text) || '';
      setTextDialog({ mode: 'edit', kind: 'wire', dialogType: 'wire-label', wireId, labelId, initial: { text: initialText, latex: true, attach: true } });
    }
  }, []);

  useEffect(() => {
    const onWireNameEdit = (e) => {
      if (textTool || moveGroup || copyGroup || cursorNodeId) return;
      const { wireId } = e.detail || {};
      const w = wiresRef.current.find((x) => x.id === wireId);
      if (w) {
        setTextDialog({
          mode: 'edit',
          kind: 'wire',
          dialogType: 'wire-label',
          wireId,
          initial: { text: w.name || (w.labels?.[0]?.text) || '', latex: true, attach: true },
        });
      }
    };
    window.addEventListener('wire-name-edit', onWireNameEdit);
    return () => window.removeEventListener('wire-name-edit', onWireNameEdit);
  }, [textTool, moveGroup, copyGroup, cursorNodeId]);

  useEffect(() => {
    const onSelectNodeLabel = (e) => {
      if (isWiringMode || placingType || textTool) return;
      const { nodeId } = e.detail;
      const n = nodesRef.current.find((x) => x.id === nodeId);
      if (!n) return;

      if (isMoveMode) {
        if (!canEdit) return;
        const mouseScreen = (e.detail?.clientX !== undefined) ? { x: e.detail.clientX, y: e.detail.clientY } : lastMouse.current;
        lastMouse.current = mouseScreen;
        const flowPos = screenToFlowPosition(mouseScreen);
        setMoveGroup({
          startX: Math.round(flowPos.x / GRID) * GRID,
          startY: Math.round(flowPos.y / GRID) * GRID,
          labelItem: {
            kind: 'node-label',
            nodeId: n.id,
            initialOffset: n.data?.labelOffset || { x: 0, y: 0 },
          },
        });
      }
      setSelected({ kind: 'node-label', nodeId });
      setNodes((ns) => ns.map((x) => ({
        ...x,
        selected: false,
        data: { ...x.data, isLabelSelected: x.id === nodeId },
      })));
      setWiresRaw((ws) => ws.map((w) => (w.selected ? { ...w, selected: false } : w)));
    };

    const onSelectWireName = (e) => {
      if (isWiringMode || placingType || textTool) return;
      const { wireId, clientX, clientY } = e.detail || {};
      const w = wiresRef.current.find((x) => x.id === wireId);
      if (!w) return;

      if (isMoveMode) {
        if (!canEdit) return;
        const mouseScreen = (clientX !== undefined) ? { x: clientX, y: clientY } : lastMouse.current;
        lastMouse.current = mouseScreen;
        const flowPos = screenToFlowPosition(mouseScreen);
        setMoveGroup({
          startX: Math.round(flowPos.x / GRID) * GRID,
          startY: Math.round(flowPos.y / GRID) * GRID,
          labelItem: {
            kind: 'wire-name',
            wireId: w.id,
            initialOffset: w.labelOffset || { x: 0, y: 0 },
            initialRatio: w.nameRatio ?? 0.5,
          },
        });
      }
      setSelected({ kind: 'wire-name', wireId });
      setWiresRaw((ws) => ws.map((x) => ({ ...x, selected: false })));
      setNodes((ns) => ns.map((x) => ({ ...x, selected: false, data: { ...x.data, isLabelSelected: false } })));
    };

    const onSelectWireLabel = (e) => {
      if (isWiringMode || placingType || textTool) return;
      const { wireId, labelId, clientX, clientY } = e.detail || {};
      const w = wiresRef.current.find((x) => x.id === wireId);
      const l = w?.labels?.find((x) => x.id === labelId);
      if (!w) return;

      if (isMoveMode) {
        if (!canEdit) return;
        const mouseScreen = (clientX !== undefined) ? { x: clientX, y: clientY } : lastMouse.current;
        lastMouse.current = mouseScreen;
        const flowPos = screenToFlowPosition(mouseScreen);
        setMoveGroup({
          startX: Math.round(flowPos.x / GRID) * GRID,
          startY: Math.round(flowPos.y / GRID) * GRID,
          labelItem: {
            kind: 'wire-name',
            wireId: w.id,
            initialOffset: w.labelOffset || l?.offset || { x: 0, y: 0 },
            initialRatio: w.nameRatio ?? l?.ratio ?? 0.5,
          },
        });
      }
      setSelected({ kind: 'wire-name', wireId });
      setWiresRaw((ws) => ws.map((x) => ({ ...x, selected: false })));
      setNodes((ns) => ns.map((x) => ({ ...x, selected: false, data: { ...x.data, isLabelSelected: false } })));
    };

    window.addEventListener('select-node-label', onSelectNodeLabel);
    window.addEventListener('select-wire-name', onSelectWireName);
    window.addEventListener('select-wire-label', onSelectWireLabel);
    return () => {
      window.removeEventListener('select-node-label', onSelectNodeLabel);
      window.removeEventListener('select-wire-name', onSelectWireName);
      window.removeEventListener('select-wire-label', onSelectWireLabel);
    };
  }, [isWiringMode, placingType, textTool, isMoveMode, canEdit, screenToFlowPosition, lastMouse, setNodes, setWiresRaw, setSelected]);
  // --- STATE LƯU TỌA ĐỘ BẮT ĐẦU QUÉT KHỐI ---
  const selectionStart = useRef(null); 
  // -----------------------------------------

  const handleCopyImage = useCopyImage({
    nodes, wires, selected,
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
    if (!canEdit) return;
    const id = nextId(comp.refPrefix);
    const snappedX = Math.round(flowPos.x / GRID) * GRID;
    const snappedY = Math.round(flowPos.y / GRID) * GRID;
    setNodes((ns) => [...ns, {
      id,
      type: comp.type,
      position: { x: snappedX, y: snappedY },
      zIndex: comp.type === 'rect' ? 0 : 10,
      data: { reference: id, ...comp.defaultData, onResize: handleResizeRect, onTextChange: handleRectTextChange },
      style: {
        width: comp.defaultData?.width || 160, height: comp.defaultData?.height || 100,
        background: 'transparent', border: 'none', padding: 0, boxShadow: 'none',
        zIndex: comp.type === 'rect' ? 0 : 10,
      },
    }]);
  }, [nextId, setNodes, handleResizeRect, handleRectTextChange, canEdit]);

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
        data: { text: textTool.text, latex: textTool.latex, size: 14, color: textTool.color || '#000000' },
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

  const rafMoveId = useRef(null);
  const pendingMovePos = useRef(null);

  useEffect(() => {
    return () => {
      if (rafMoveId.current) cancelAnimationFrame(rafMoveId.current);
    };
  }, []);

  const handleGlobalMouseMove = useCallback((e) => {
    lastMouse.current = { x: e.clientX, y: e.clientY };
    const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    sendCursor(fp.x, fp.y);

    // Kéo chuột phải để vẽ ô vuông Zoom Box
    if (rightDragStartRef.current) {
      const dx = e.clientX - rightDragStartRef.current.screenX;
      const dy = e.clientY - rightDragStartRef.current.screenY;
      if (Math.hypot(dx, dy) > 5) {
        didRightDragRef.current = true;
        setRightZoomBox({
          startScreen: { x: rightDragStartRef.current.screenX, y: rightDragStartRef.current.screenY },
          curScreen: { x: e.clientX, y: e.clientY },
        });
      }
      return;
    }

    if (moveGroup || copyGroup || cursorNodeId) {
      pendingMovePos.current = { clientX: e.clientX, clientY: e.clientY };
      if (!rafMoveId.current) {
        rafMoveId.current = requestAnimationFrame(() => {
          rafMoveId.current = null;
          if (!pendingMovePos.current) return;
          const { clientX, clientY } = pendingMovePos.current;

          if (moveGroup?.labelItem) {
            const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
            const { labelItem } = moveGroup;

            if (labelItem.kind === 'node-label') {
              const dx = Math.round((flowPos.x - moveGroup.startX) / GRID) * GRID;
              const dy = Math.round((flowPos.y - moveGroup.startY) / GRID) * GRID;
              const newOffset = {
                x: (labelItem.initialOffset?.x || 0) + dx,
                y: (labelItem.initialOffset?.y || 0) + dy,
              };
              setNodes((ns) => ns.map((n) => (n.id === labelItem.nodeId
                ? { ...n, data: { ...n.data, labelOffset: newOffset } }
                : n)));
            } else if (labelItem.kind === 'wire-label') {
              const dx = Math.round((flowPos.x - moveGroup.startX) / GRID) * GRID;
              const dy = Math.round((flowPos.y - moveGroup.startY) / GRID) * GRID;
              const newOffset = {
                x: (labelItem.initialOffset?.x || 0) + dx,
                y: (labelItem.initialOffset?.y || 0) + dy,
              };
              setWiresRaw((ws) => ws.map((x) => (x.id === labelItem.wireId
                ? {
                    ...x,
                    labels: (x.labels || []).map((lbl) => (lbl.id === labelItem.labelId ? { ...lbl, offset: newOffset } : lbl)),
                  }
                : x)));
            } else if (labelItem.kind === 'wire-name') {
              const dx = Math.round((flowPos.x - moveGroup.startX) / GRID) * GRID;
              const dy = Math.round((flowPos.y - moveGroup.startY) / GRID) * GRID;
              const newOffset = {
                x: (labelItem.initialOffset?.x || 0) + dx,
                y: (labelItem.initialOffset?.y || 0) + dy,
              };
              setWiresRaw((ws) => ws.map((x) => (x.id === labelItem.wireId
                ? { ...x, labelOffset: newOffset }
                : x)));
            }
            return;
          }

          const applyGroup = (group) => {
            const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
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
            const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
            const snappedX = Math.round((flowPos.x - 80) / GRID) * GRID;
            const snappedY = Math.round((flowPos.y - 50) / GRID) * GRID;
            setNodes((ns) => ns.map((n) => n.id === cursorNodeId ? { ...n, position: { x: snappedX, y: snappedY } } : n));
          }
        });
      }
    }
  }, [moveGroup, copyGroup, cursorNodeId, screenToFlowPosition, setNodes, setWiresRaw, sendCursor]);
  // --- BẮT ĐẦU VÀ KẾT THÚC QUÉT KHỐI DÂY ĐIỆN VÀ ZOOM BOX ---
  const handleMouseDown = useCallback((e) => {
    // Chuột phải (button === 2): chuẩn bị kéo Zoom Box
    if (e.button === 2) {
      didRightDragRef.current = false;
      rightDragStartRef.current = {
        screenX: e.clientX,
        screenY: e.clientY,
        flow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      };
      return;
    }
  }, [screenToFlowPosition]);

  const handleSelectionStart = useCallback((e) => {
    if (!isWiringMode && !isMoveMode && !isCopyMode && !placingType && !textTool) {
      selectionStart.current = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setIsBoxSelecting(true);
    }
  }, [isWiringMode, isMoveMode, isCopyMode, placingType, textTool, screenToFlowPosition]);

  // Kết thúc kéo chuột phải để Zoom Box hoặc kết thúc quét khối
  useEffect(() => {
    const handleWindowMouseUp = (e) => {
      setIsBoxSelecting(false);
      if (e.button === 2 && rightDragStartRef.current) {
        if (didRightDragRef.current) {
          const curFlow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          const startFlow = rightDragStartRef.current.flow;
          const minX = Math.min(startFlow.x, curFlow.x);
          const maxX = Math.max(startFlow.x, curFlow.x);
          const minY = Math.min(startFlow.y, curFlow.y);
          const maxY = Math.max(startFlow.y, curFlow.y);
          const width = maxX - minX;
          const height = maxY - minY;

          if (width > 15 && height > 15) {
            fitBounds({ x: minX, y: minY, width, height }, { duration: 300, padding: 0.05 });
          }
        }
        rightDragStartRef.current = null;
        setRightZoomBox(null);
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [screenToFlowPosition, fitBounds]);

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
      if (e.shiftKey) {
        // --- Shift + Quét chọn: Cộng dồn vào tập đang chọn ---
        setNodes((ns) => ns.map((n) => {
          const box = getSymbolBBox(n);
          const fullyInside = box.x1 >= minX && box.x2 <= maxX && box.y1 >= minY && box.y2 <= maxY;
          return { ...n, selected: n.selected || fullyInside };
        }));

        setWiresRaw((ws) => ws.map((w) => {
          const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);
          const fullyInside = pts.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
          return { ...w, selected: w.selected || fullyInside };
        }));
      } else {
        // --- Quét chọn thường: Chọn chính xác các phần tử trong vùng kéo ---
        setNodes((ns) => ns.map((n) => {
          const box = getSymbolBBox(n);
          const fullyInside = box.x1 >= minX && box.x2 <= maxX && box.y1 >= minY && box.y2 <= maxY;
          return { ...n, selected: fullyInside };
        }));

        setWiresRaw((ws) => ws.map((w) => {
          const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);
          const fullyInside = pts.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
          return { ...w, selected: fullyInside };
        }));
      }
    } else {
      if (!e.shiftKey) {
        // Kéo quá nhỏ (gần như click) và không giữ Shift -> bỏ chọn hết
        setNodes((ns) => ns.map((n) => (n.selected || n.data?.isLabelSelected ? { ...n, selected: false, data: { ...n.data, isLabelSelected: false } } : n)));
        setWiresRaw((ws) => ws.map((w) => ({ ...w, selected: false })));
      }
    }
    selectionStart.current = null;
  }
    setIsBoxSelecting(false); // kết thúc kéo -> bật lại pointer-events của wire

}, [screenToFlowPosition, nodes, wires, setWiresRaw, setNodes]);
  // ----------------------------------------------

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setGhostFlowPos({
      x: Math.round((flowPos.x - 80) / GRID) * GRID,
      y: Math.round((flowPos.y - 50) / GRID) * GRID,
    });
    setDragGhostPos(snappedGhostScreenPos(e.clientX, e.clientY));
  }, [screenToFlowPosition, snappedGhostScreenPos]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragGhostPos(null);
    setDragType(null);
    setGhostFlowPos(null);
    if (!canEdit) return;
    const type = e.dataTransfer.getData('application/reactflow');
    const comp = COMPONENT_LIBRARY.find((c) => c.type === type);
    if (!comp) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNodeAt(comp, { x: flowPos.x - 80, y: flowPos.y - 50 });
  }, [screenToFlowPosition, addNodeAt, canEdit]);

  const onDragLeave = useCallback(() => {
    setDragGhostPos(null);
    setGhostFlowPos(null);
  }, []);

  useEffect(() => {
    if (!placingType) return;
    const onMove = (e) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setGhostFlowPos({
        x: Math.round((flowPos.x - 80) / GRID) * GRID,
        y: Math.round((flowPos.y - 50) / GRID) * GRID,
      });
      setGhostScreenPos(snappedGhostScreenPos(e.clientX, e.clientY));
    };
    const onClick = (e) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(placingType, { x: flowPos.x - 80, y: flowPos.y - 50 });
      setPlacingType(null);
      setGhostScreenPos(null);
      setGhostFlowPos(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPlacingType(null);
        setGhostScreenPos(null);
        setGhostFlowPos(null);
      }
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
    if (!canEdit) return;
    if (selected?.kind === 'wire-label') {
      setWires((ws) => ws.map((w) => (w.id === selected.wireId
        ? { ...w, labels: (w.labels || []).filter((l) => l.id !== selected.labelId) }
        : w)));
      setSelected(null);
      return;
    }
    if (selected?.kind === 'wire-name') {
      setWires((ws) => ws.map((w) => (w.id === selected.wireId ? { ...w, name: undefined } : w)));
      setSelected(null);
      return;
    }
    if (selected?.kind === 'node-label') {
      const targetNodeId = selected.nodeId || selected.id;
      setNodes((ns) => ns.map((n) => (n.id === targetNodeId
        ? { ...n, data: { ...n.data, labelOffset: { x: 0, y: 0 } } }
        : n)));
      return;
    }
    const activeNodes = nodes.filter((n) => n.selected).map((n) => n.id);
    const activeWires = wires.filter((w) => w.selected).map((w) => w.id); // Lấy các dây đang bôi đen

    const deletedNodeIds = new Set(activeNodes);
    if (selected?.kind === 'node' && selected.id) {
      deletedNodeIds.add(selected.id);
    }

    const deletedWireIds = new Set(activeWires);
    if (selected?.kind === 'wire' && selected.id) {
      deletedWireIds.add(selected.id);
    }

    setNodes((ns) => ns.filter((n) => !deletedNodeIds.has(n.id)));
    
    // Khi xóa linh kiện (device): chỉ xóa linh kiện, BẢO TOÀN toàn bộ các đường dây điện!
    // Các đầu mút của dây đang nối vào chân linh kiện bị xóa sẽ được giải phóng thành đầu mút tự do
    // và cố định tại chính xác toạ độ của chân linh kiện đó.
    setWires((ws) => ws
      .filter((w) => !deletedWireIds.has(w.id))
      .map((w) => {
        const touchesDeletedNode = w.points.some((p) => p.nodeId && deletedNodeIds.has(p.nodeId));
        if (!touchesDeletedNode) return w;

        const newPoints = w.points.map((p) => {
          if (!p.nodeId || !deletedNodeIds.has(p.nodeId)) return p;
          const n = nodes.find((node) => node.id === p.nodeId);
          let px = p.x;
          let py = p.y;
          if (n) {
            const port = findPort(n.type, p.portId, n.data);
            if (port) {
              const tPort = getTransformedPort(port, n);
              px = Math.round((Math.round(n.position.x) + tPort.x) / GRID) * GRID;
              py = Math.round((Math.round(n.position.y) + tPort.y) / GRID) * GRID;
            }
          }
          return { x: px, y: py };
        });

        return { ...w, points: newPoints };
      })
    );
    
    setSelected(null);
    setIsPropertyPanelOpen(false);
  }, [nodes, wires, selected, setNodes, setWires, canEdit]);
  // -------------------------------------------------------

  // Tính toán vạch căn chỉnh thẳng hàng (Alignment Guidelines) khi di chuyển/đặt linh kiện hoặc dây
  const alignmentGuides = useMemo(() => {
    return computeAlignmentGuides({
      nodes,
      wires,
      moveGroup,
      copyGroup,
      cursorNodeId,
      placingType,
      ghostFlowPos,
    });
  }, [nodes, wires, moveGroup, copyGroup, cursorNodeId, placingType, ghostFlowPos]);

  useEffect(() => {
    alignmentGuidesRef.current = alignmentGuides;
  }, [alignmentGuides]);

  const activeSheet = sheets.find((s) => s.id === activeSheetId);
  const isWaveformTab = activeSheet?.type === 'waveform';

  useKeyboardShortcuts({
    nodes, wires, selected, moveGroup, copyGroup, cursorNodeId,
    isWiringMode, isMoveMode, isCopyMode, placingType,
    nodesRef, wiresRef, lastMouse,
    setNodes, setWires, setWiresRaw, setSelected,
    setMoveGroup, setCopyGroup, setCursorNodeId,
    setIsMoveMode, setIsCopyMode, setIsWiringMode,
    setIsRotatingFlag, setQuickAddOpen,
    screenToFlowPosition, fitView, deleteSelected, undo,
    textTool, openWireLabelDialog, openTextNodeDialog, openTextDialog, cancelTextTool,
    onOpenNetlist: () => setIsNetlistOpen(true),
    onToggleSwitch: toggleSwitchNode,
    canEdit,
    isPropertyPanelOpen, setIsPropertyPanelOpen,
    disabled: isWaveformTab,
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable) {
          return;
        }
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleSidebar]);

  useEffect(() => {
   const forceDropOnClick = (e) => {
     // Không drop nếu click vào thanh tab bar, popup dialog hoặc các nút điều khiển bên ngoài canvas
     if (
       e.target.closest('#circuit-tab-bar') ||
       e.target.closest('.circuit-tab-bar') ||
       e.target.closest('[role="dialog"]') ||
       e.target.closest('#btn-toggle-device-list')
     ) {
       return;
     }
    if ((moveGroup || copyGroup || cursorNodeId) && e.button === 0) {
      if (moveGroup?.labelItem) {
        e.stopPropagation();
        setMoveGroup(null);
        setIsMoveMode(false);
        return;
      }
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
      setIsPropertyPanelOpen(false);
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
      setWiresRaw((ws) => ws.map((w) => ({ ...w, selected: false })));
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
    <div style={{ width: '100vw', height: '100vh', background: '#f4f4f4', display: 'flex' }}>
      {!isWaveformTab && isSidebarOpen && (
        <ComponentPalette
          onComponentDragStart={(type) => setDragType(type)}
          onToggleCollapse={handleToggleSidebar}
        />
      )}

      <div 
        ref={reactFlowWrapper} 
        onMouseMove={handleGlobalMouseMove}
        onMouseDown={handleMouseDown}
        onContextMenu={(e) => {
          if (isWaveformTab) return;
          e.preventDefault();
          if (didRightDragRef.current) {
            didRightDragRef.current = false;
            return;
          }
          const hasSelection = nodes.some(n => n.selected) || wires.some(w => w.selected);
          if (hasSelection) setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{ position: 'relative', flex: 1, height: '100%', minWidth: 0, overflow: 'hidden' }}
      >
        {isWaveformTab ? (
          <WaveformTabEditor
            sheet={activeSheet}
            onUpdateSheet={handleUpdateActiveSheet}
            allSheets={sheets}
            cloudControls={
              <CloudPanel
                nodes={nodes} wires={wires} setNodes={setNodes} setWires={setWires}
                sheets={sheets} setSheets={setSheets}
                activeSheetId={activeSheetId} setActiveSheetId={setActiveSheetId}
                onOpenRoom={switchCircuitRoom}
                onNewRoom={startNewCircuitRoom}
                onResizeRect={handleResizeRect}
                onTextChangeRect={handleRectTextChange}
                onAuthChange={checkAuthAndAccess}
                openTrigger={openCloudTrigger}
                compact={true}
              />
            }
          />
        ) : (
          <>
            {rightZoomBox && (
              <div
                id="right-zoom-box"
                style={{
                  position: 'fixed',
                  left: Math.min(rightZoomBox.startScreen.x, rightZoomBox.curScreen.x),
                  top: Math.min(rightZoomBox.startScreen.y, rightZoomBox.curScreen.y),
                  width: Math.abs(rightZoomBox.curScreen.x - rightZoomBox.startScreen.x),
                  height: Math.abs(rightZoomBox.curScreen.y - rightZoomBox.startScreen.y),
                  border: '1.5px dashed #1677ff',
                  background: 'rgba(22, 119, 255, 0.12)',
                  pointerEvents: 'none',
                  zIndex: 9999,
                  boxShadow: '0 0 8px rgba(22, 119, 255, 0.25)',
                }}
              />
            )}

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
          deleteKeyCode={null}
          
          nodesDraggable={false} 
          panOnDrag={[1]} 
          selectionMode="partial" 
          onlyRenderVisibleElements={true}
          zoomOnDoubleClick={false}
          onNodeDoubleClick={(e, node) => {
            if (['sw_open', 'sw_closed', 'sw_spdt', 'sw_sp3t', 'sw_sp4t'].includes(node?.type)) {
              toggleSwitchNode(node.id);
            }
          }}

          elementsSelectable={!isWiringMode && !placingType && !isMoveMode && !isCopyMode && !textTool}
          selectionOnDrag={!isWiringMode && !placingType && !isMoveMode && !isCopyMode && !textTool}    
          
          selectNodesOnDrag={false}
          onSelectionStart={handleSelectionStart}
          onSelectionEnd={(e) => {
            handleMouseUp(e);
            setIsBoxSelecting(false);
          }}
          
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

            // Click trên label -> không xử lý như click ra nền
            if (e.target?.closest?.('.device-label')) {
              return;
            }

            // Click ngoài vùng xanh -> xử lý như click ra nền
            if (!isInsideSymbol(e, node)) {
              handlePaneClick();
              return;
            }

            if (isMoveMode) {
              if (!canEdit) return;
              const flowPos = screenToFlowPosition(lastMouse.current);
              setMoveGroup({
                startX: Math.round(flowPos.x / GRID) * GRID,
                startY: Math.round(flowPos.y / GRID) * GRID,
                items: [{ id: node.id, initialX: node.position.x, initialY: node.position.y }]
              });
            } else if (isCopyMode) {
              if (!canEdit) return;
              const rawPrefix = node.type === 'text' ? 'TXT' : ((node.data?.reference || 'U').replace(/[0-9{}]/g, '') || 'U');
              const prefix = (['M', 'Q', 'R', 'C', 'U'].includes(rawPrefix.replace(/_$/, '')))
                ? `${rawPrefix.replace(/_$/, '')}_`
                : rawPrefix;
              const newId = nextId(prefix);
              const newNode = { ...node, id: newId, data: node.type === 'text' ? { ...node.data } : { ...node.data, reference: newId }, position: { ...node.position }, selected: false };
              setNodes((ns) => [...ns, newNode]);
              setCursorNodeId(newId); 
            } else if (!isWiringMode && !placingType) {
              if (e.shiftKey) {
                const curInRef = nodesRef.current.find((n) => n.id === node.id);
                const isCurrentlySelected = !!curInRef?.selected;
                const nextSelected = !isCurrentlySelected;
                setNodes((ns) => ns.map((n) => n.id === node.id ? { ...n, selected: nextSelected, data: { ...n.data, isLabelSelected: false } } : n));
                if (nextSelected) {
                  setSelected({ kind: 'node', id: node.id });
                } else {
                  setSelected((prev) => (prev?.kind === 'node' && prev.id === node.id ? null : prev));
                }
              } else {
                setSelected({ kind: 'node', id: node.id });
                setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === node.id, data: { ...n.data, isLabelSelected: false } })));
                setWiresRaw(ws => ws.map(w => ({ ...w, selected: false })));
              }
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

        <div style={{ pointerEvents: (canEdit && isWiringMode) ? 'auto' : 'none' }}>
            <WiringLayer
                isWiringMode={canEdit && isWiringMode}
                isBoxSelecting={isBoxSelecting}
                nodes={nodes}
                wires={wires}
                setWires={setWires}
                setNodes={setNodes}
                selected={selected}
                setSelected={setSelected}
                attachTool={canEdit && textTool?.phase === 'attach' ? textTool : null}
                onAttachLabel={handleAttachLabel}
                onEditLabel={handleEditLabel}
                alignmentGuides={alignmentGuides}
            />
        </div>
        <PresenceLayer others={others} nodes={nodes} wires={wires} activeSheetId={activeSheetId} />
        <OnlineUsers
          me={me}
          others={others}
          onRename={rename}
          isHost={isHost}
          canEdit={canEdit}
          hostUid={hostUid}
          hostUser={hostUser}
        />

        <PropertyPanel
          isOpen={isPropertyPanelOpen}
          onClose={() => setIsPropertyPanelOpen(false)}
          selected={selected}
          nodes={nodes}
          setNodes={setNodes}
          wires={wires}
          setWires={setWires}
          onDelete={deleteSelected}
          readOnly={!canEdit}
        />
        <div id="top-left-toolbar" style={{ position: 'absolute', top: 10, left: 10, zIndex: 21, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CloudPanel
            nodes={nodes} wires={wires} setNodes={setNodes} setWires={setWires}
            sheets={sheets} setSheets={setSheets}
            activeSheetId={activeSheetId} setActiveSheetId={setActiveSheetId}
            onOpenRoom={switchCircuitRoom}
            onNewRoom={startNewCircuitRoom}
            onResizeRect={handleResizeRect}
            onTextChangeRect={handleRectTextChange}
            onAuthChange={checkAuthAndAccess}
            openTrigger={openCloudTrigger}
            compact={false}
          />
          <button
            type="button"
            onClick={() => setIsNetlistOpen(true)}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 6,
              background: '#fff',
              border: '1px solid #d9d9d9',
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: '#333',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              transition: 'all 0.15s ease-in-out',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#1677ff';
              e.currentTarget.style.color = '#1677ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d9d9d9';
              e.currentTarget.style.color = '#333';
            }}
            title="Export SPICE Netlist (Ctrl+E)"
          >
            <span style={{ fontSize: 15 }}>📄</span>
            <span>Netlist</span>
          </button>
        </div>

        {!isWaveformTab && !isSidebarOpen && (
          <button
            id="btn-toggle-device-list"
            type="button"
            onClick={handleToggleSidebar}
            title="Show Device List (Ctrl+B)"
            style={{
              position: 'absolute',
              top: 90,
              left: 0,
              zIndex: 40,
              width: 16,
              height: 40,
              borderTopRightRadius: 6,
              borderBottomRightRadius: 6,
              background: '#fff',
              border: '1px solid #d9d9d9',
              borderLeft: 'none',
              boxShadow: '2px 0 6px rgba(0,0,0,0.08)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: '#1677ff',
              padding: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.width = '20px';
              e.currentTarget.style.background = '#e6f4ff';
              e.currentTarget.style.borderColor = '#1677ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.width = '16px';
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.borderColor = '#d9d9d9';
            }}
          >
            ▶
          </button>
        )}

        {/* Banner hiển thị khi người dùng ở chế độ Chỉ xem */}
        {!canEdit && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 40,
            background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)',
            border: '1px solid #ffccc7', borderRadius: 30, padding: '7px 20px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)', display: 'flex', alignItems: 'center', gap: 14,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: 13,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cf1322', fontWeight: 700 }}>
              <span style={{ fontSize: 16 }}>👁️</span> View-only Mode
            </span>
            <span style={{ color: '#555', borderLeft: '1px solid #e8e8e8', paddingLeft: 12 }}>
              {isPendingApproval
                ? '⏳ Waiting for host approval...'
                : isRejected
                ? '❌ Edit access request was rejected'
                : 'You do not have permission to edit this schematic.'}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!isPendingApproval && !isRejected && (
                <button
                  type="button"
                  onClick={requestEditAccess}
                  style={{
                    padding: '5px 14px', background: '#1677ff', color: '#fff', border: 'none',
                    borderRadius: 16, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                    boxShadow: '0 2px 4px rgba(22,119,255,0.25)', transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#4096ff'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#1677ff'}
                >
                  ✋ Request Edit Access
                </button>
              )}
              {isRejected && (
                <button
                  type="button"
                  onClick={requestEditAccess}
                  style={{
                    padding: '4px 12px', background: '#f5f5f5', color: '#333', border: '1px solid #d9d9d9',
                    borderRadius: 14, cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Request Again
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpenCloudTrigger((c) => c + 1)}
                style={{
                  padding: '4px 12px', background: '#fafafa', color: '#1677ff', border: '1px solid #91caff',
                  borderRadius: 14, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                }}
              >
                📁 Sign in to Drive
              </button>
            </div>
          </div>
        )}

        {/* Thông báo duyệt quyền cho Chủ phòng hoặc người có quyền Drive */}
        {(isHost || hasDriveAccess) && pendingRequests.length > 0 && (
          <div style={{
            position: 'absolute', top: 58, right: 16, zIndex: 110,
            background: '#fff', border: '1px solid #91caff', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)', padding: '12px 16px', minWidth: 280, maxWidth: 360,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0958d9', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔔</span> {pendingRequests.length} user{pendingRequests.length > 1 ? 's' : ''} requesting edit access
            </div>
            {pendingRequests.map((req) => (
              <div key={req.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.name}>
                  {req.name}
                </span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => approveUser(req.uid)}
                    style={{
                      padding: '4px 10px', background: '#52c41a', color: '#fff', border: 'none',
                      borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      boxShadow: '0 2px 4px rgba(82,196,26,0.25)',
                    }}
                  >
                    ✓ Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectUser(req.uid)}
                    style={{
                      padding: '4px 10px', background: '#ff4d4f', color: '#fff', border: 'none',
                      borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      boxShadow: '0 2px 4px rgba(255,77,79,0.25)',
                    }}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {textDialog && (
          <div data-text-ui>
            <TextDialog
              key={`${textDialog.mode}-${textDialog.nodeId || textDialog.labelId || 'new'}`}
              mode={textDialog.mode}
              dialogType={textDialog.dialogType}
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            {textTool.phase === 'attach'
              ? (textTool.queue && textTool.queue.length > 1
                  ? `Click wire to attach "${textTool.text}" (${(textTool.index || 0) + 1}/${textTool.queue.length}) — Esc to cancel`
                  : `Click wire to attach label "${textTool.text}" — Esc to cancel`)
              : 'Click to place text — Esc to cancel'}
          </div>
        )}

        <GhostPreviews
          textTool={textTool}
          textGhost={textGhost}
          placingType={placingType}
          ghostScreenPos={ghostScreenPos}
          dragGhostPos={dragGhostPos}
          dragType={dragType}
        />

        {quickAddOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.15)' }} onClick={() => setQuickAddOpen(false)}>
              <QuickAddMenu
                onPick={(comp) => { setQuickAddOpen(false); setPlacingType(comp); setGhostScreenPos(null); }}
                onClose={() => setQuickAddOpen(false)}
              />
          </div>
        )}
          </>
        )}

        <CircuitTabBar
          tabs={sheets.map((s) => ({ id: s.id, title: s.name, type: s.type || 'schematic' }))}
          activeTabId={activeSheetId}
          onSelectTab={handleSelectSheet}
          onNewTab={handleNewSheet}
          onCloseTab={handleRequestCloseSheet}
          onRenameTab={handleRenameSheet}
        />

        <ConfirmDeleteTabDialog
          isOpen={!!confirmCloseTab}
          tab={confirmCloseTab?.tab}
          isLastTab={confirmCloseTab?.isLastTab}
          onConfirm={handleConfirmCloseSheet}
          onCancel={() => setConfirmCloseTab(null)}
        />

        <SpiceNetlistDialog
          isOpen={isNetlistOpen}
          onClose={() => setIsNetlistOpen(false)}
          nodes={nodes}
          wires={wires}
          sheets={sheets}
          activeSheetId={activeSheetId}
          circuitName={circuitId}
        />
      </div>
    </div>
  );
}

export default Flow