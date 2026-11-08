import { useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import { toBlob } from 'html-to-image';
import { resolvePoints } from '../routing/resolveWire';
import { getSymbolBBox } from '../geometry/ports';
import { pointAtRatio } from '../geometry/pathUtils';


export function useCopyImage({
  nodes, wires, selected,
  setNodes, setWires, setSelected, reactFlowWrapper,
}) {
  const { getViewport, setViewport } = useReactFlow();

  const handleCopyImage = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedWires = wires.filter((w) => w.selected || (selected?.kind === 'wire' && selected.id === w.id));
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedWireIds = new Set(selectedWires.map((w) => w.id));

    if (selectedNodes.length === 0 && selectedWires.length === 0) {
        alert("Please select at least 1 component or wire to copy!");
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedNodes.forEach(n => {
        // 1. Hình học thực tế của ký hiệu (symbol)
        const b = getSymbolBBox(n);
        minX = Math.min(minX, b.x1);
        minY = Math.min(minY, b.y1);
        maxX = Math.max(maxX, b.x2);
        maxY = Math.max(maxY, b.y2);

        // 2. Nhãn linh kiện (device-label)
        try {
            const nodeEl = document.querySelector(`[data-id="${n.id}"]`);
            const labelEl = nodeEl?.querySelector('.device-label');
            if (nodeEl && labelEl) {
                const nr = nodeEl.getBoundingClientRect();
                const lr = labelEl.getBoundingClientRect();
                if (nr.width > 0 && nr.height > 0) {
                    const lx1 = n.position.x + (lr.left - nr.left);
                    const ly1 = n.position.y + (lr.top - nr.top);
                    const lx2 = lx1 + lr.width;
                    const ly2 = ly1 + lr.height;
                    minX = Math.min(minX, lx1);
                    minY = Math.min(minY, ly1);
                    maxX = Math.max(maxX, lx2);
                    maxY = Math.max(maxY, ly2);
                }
            } else if (n.data?.label) {
                const textW = Math.max(String(n.data.label).length * 9, 24);
                minX = Math.min(minX, n.position.x);
                minY = Math.min(minY, n.position.y - 18);
                maxX = Math.max(maxX, n.position.x + textW);
            }
        } catch {
            // Dự phòng an toàn
        }
    });

    selectedWires.forEach(w => {
        const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);     
        pts.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        (w.labels || []).forEach(l => {
            const pt = pointAtRatio(pts, l.ratio);
            const textLen = Math.max(String(l.text || '').length * 8, 20);
            minX = Math.min(minX, pt.x - textLen / 2);
            minY = Math.min(minY, pt.y - 12);
            maxX = Math.max(maxX, pt.x + textLen / 2);
            maxY = Math.max(maxY, pt.y + 12);
        });
        if (w.name) {
            const mid = pointAtRatio(pts, 0.5);
            const nameLen = Math.max(String(w.name).length * 8, 20);
            minX = Math.min(minX, mid.x - nameLen / 2);
            minY = Math.min(minY, mid.y - 12);
            maxX = Math.max(maxX, mid.x + nameLen / 2);
            maxY = Math.max(maxY, mid.y + 12);
        }
    });

    if (minX === Infinity) return;

    // Lề đệm an toàn 40px cho toBlob để đảm bảo không bị cụt bất kỳ nhãn KaTeX hay góc xoay nào
    const pad = 40; 
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);

    // Chuẩn độ phân giải 2K: capturePixelRatio tối ưu để nét vẽ vector cực kỳ sắc nét
    const TARGET_2K = 2048;
    const maxDim = Math.max(width, height, 1);
    const capturePixelRatio = Math.max(2, Math.min(4, Math.round((TARGET_2K / maxDim) * 10) / 10));

    const prevViewport = getViewport();
    // Luôn tạm thời chuyển sang tỉ lệ chuẩn zoom = 1 để ảnh xuất ra có độ nét và tỉ lệ chuẩn tuyệt đối
    setViewport({ x: -minX, y: -minY, zoom: 1 });

    const exportArea = reactFlowWrapper.current;
    if (!exportArea) {
      setViewport(prevViewport);
      return;
    }

    const dpr = capturePixelRatio;

    // --- Tạm thời bỏ chọn để tránh xuất ảnh bị màu xanh ---
    const prevNodeSelected = nodes.map((n) => ({ id: n.id, selected: !!n.selected }));
    const prevWireSelected = wires.map((w) => ({ id: w.id, selected: !!w.selected }));
    const prevSelectedPanel = selected;

    setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
    setWires((ws) => ws.map((w) => ({ ...w, selected: false })));
    setSelected(null);

    const restoreAll = () => {
      setViewport(prevViewport);
      setNodes((ns) => ns.map((n) => {
        const prev = prevNodeSelected.find((p) => p.id === n.id);
        return prev ? { ...n, selected: prev.selected } : n;
      }));
      setWires((ws) => ws.map((w) => {
        const prev = prevWireSelected.find((p) => p.id === w.id);
        return prev ? { ...w, selected: prev.selected } : w;
      }));
      setSelected(prevSelectedPanel);
    };

    // Đợi 2 khung hình để React re-render xong viewport và selection
    requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
        if (document.fonts?.ready) {
            try { await document.fonts.ready; } catch { /* ignore */ }
        }
        toBlob(exportArea, {
            backgroundColor: 'rgba(0,0,0,0)', 
            pixelRatio: dpr, 
            width: width,
            height: height,
            filter: (domNode) => {
              if (!domNode) return true;
              if (domNode.nodeType === 1) {
                const excludeIds = [
                  'ui-overlay',
                  'context-menu',
                  'top-left-toolbar',
                  'circuit-tab-bar',
                  'btn-toggle-device-list',
                  'right-zoom-box',
                  'property-panel',
                  'online-users-panel',
                ];
                if (domNode.id && excludeIds.includes(domNode.id)) return false;
                if (domNode.getAttribute && domNode.getAttribute('role') === 'dialog') return false;

                // Lọc bỏ linh kiện không được chọn
                if (domNode.getAttribute && domNode.classList?.contains('react-flow__node')) {
                  const nodeId = domNode.getAttribute('data-id');
                  if (nodeId && !selectedNodeIds.has(nodeId)) return false;
                }

                // Lọc bỏ dây không được chọn
                if (domNode.getAttribute && domNode.getAttribute('data-wire-id')) {
                  const wireId = domNode.getAttribute('data-wire-id');
                  if (wireId && !selectedWireIds.has(wireId)) return false;
                }

                const classes = domNode.classList;
                if (classes) {
                  if (
                    classes.contains('circuit-tab-bar') ||
                    classes.contains('react-flow__background') ||
                    classes.contains('react-flow__controls') ||
                    classes.contains('react-flow__selection') ||
                    classes.contains('react-flow__nodesselection') ||
                    classes.contains('react-flow__nodesselection-rect') ||
                    classes.contains('react-flow__attribution') ||
                    classes.contains('react-flow__panel') ||
                    classes.contains('alignment-guidelines') ||
                    classes.contains('context-menu')
                  ) {
                    return false;
                  }
                }
              }
              return true;
            }
        })
            .then((fullBlob) => {
            if (!fullBlob) {
                restoreAll();
                return;
            }
            const img = new Image();
            const url = URL.createObjectURL(fullBlob);
            
            img.onload = () => {
                const initW = img.width;
                const initH = img.height;
                const scanCanvas = document.createElement('canvas');
                scanCanvas.width = initW;
                scanCanvas.height = initH;
                const scanCtx = scanCanvas.getContext('2d');
                scanCtx.drawImage(img, 0, 0);

                // Quét kênh Alpha để tìm chính xác tọa độ mép pixel ngoài cùng của các linh kiện & dây
                let imgData;
                try {
                  imgData = scanCtx.getImageData(0, 0, initW, initH);
                } catch {
                  imgData = null;
                }

                let minPxX = initW, minPxY = initH, maxPxX = -1, maxPxY = -1;
                if (imgData) {
                  const data = imgData.data;
                  for (let y = 0; y < initH; y++) {
                    for (let x = 0; x < initW; x++) {
                      const alpha = data[(y * initW + x) * 4 + 3];
                      if (alpha > 8) { // Có nét vẽ, linh kiện hoặc chữ
                        if (x < minPxX) minPxX = x;
                        if (x > maxPxX) maxPxX = x;
                        if (y < minPxY) minPxY = y;
                        if (y > maxPxY) maxPxY = y;
                      }
                    }
                  }
                }

                // Nếu không quét được pixel nào, fallback dùng toàn bộ ảnh
                if (maxPxX === -1) {
                  minPxX = 0; minPxY = 0; maxPxX = initW - 1; maxPxY = initH - 1;
                }

                // Lề đệm ôm sát khít: đúng 12px (tương đương hệ quy chiếu 1x)
                const cropPad = Math.round(12 * dpr);
                minPxX = Math.max(0, minPxX - cropPad);
                minPxY = Math.max(0, minPxY - cropPad);
                maxPxX = Math.min(initW - 1, maxPxX + cropPad);
                maxPxY = Math.min(initH - 1, maxPxY + cropPad);

                const cropW = maxPxX - minPxX + 1;
                const cropH = maxPxY - minPxY + 1;

                // Scale lên chuẩn 2K: cạnh lớn nhất đúng 2048px (tối thiểu 1x)
                const finalScale = TARGET_2K / Math.max(cropW, cropH);
                const finalW = Math.round(cropW * finalScale);
                const finalH = Math.round(cropH * finalScale);

                const outCanvas = document.createElement('canvas');
                outCanvas.width = finalW;
                outCanvas.height = finalH;
                const outCtx = outCanvas.getContext('2d');
                outCtx.imageSmoothingEnabled = true;
                outCtx.imageSmoothingQuality = 'high';
                outCtx.drawImage(scanCanvas, minPxX, minPxY, cropW, cropH, 0, 0, finalW, finalH);

                outCanvas.toBlob((croppedBlob) => {
                if (croppedBlob) {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': croppedBlob })])
                    .then(() => alert('Selection copied to Clipboard (transparent PNG 2K)!'))
                    .catch((err) => alert('Failed to copy to Clipboard: ' + err));
                }
                URL.revokeObjectURL(url);
                restoreAll();
                }, 'image/png');
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                restoreAll();
            };
            img.src = url;
            }).catch((err) => {
                console.error('Lỗi tạo ảnh:', err);
                restoreAll();
            });
        });
    });
    }, [nodes, wires, selected, setNodes, setWires, setSelected, getViewport, setViewport]);
    
    
    return handleCopyImage;
}