import { useCallback } from 'react';
import { toBlob } from 'html-to-image';
import { resolvePoints } from '../routing/resolveWire';

export function useCopyImage({
  nodes, wires, selected, tx, ty, zoom,
  setNodes, setWires, setSelected, reactFlowWrapper,
}) {

const handleCopyImage = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedWires = wires.filter((w) => w.selected || (selected?.kind === 'wire' && selected.id === w.id));

    if (selectedNodes.length === 0 && selectedWires.length === 0) {
        alert("Vui lòng bôi đen ít nhất 1 linh kiện hoặc dây nối để copy!");
        return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedNodes.forEach(n => {
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxX = Math.max(maxX, n.position.x + 160);
        maxY = Math.max(maxY, n.position.y + 100);
    });

    selectedWires.forEach(w => {
        const pts = resolvePoints(w.points, nodes, w.lockedVertical, wires, w.id, w.routed);     
        pts.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
    });

    if (minX === Infinity) return;

    const pad = 30; 
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    const width = maxX - minX;
    const height = maxY - minY;

    const screenX = minX * zoom + tx;
    const screenY = minY * zoom + ty;
    const screenWidth = width * zoom;
    const screenHeight = height * zoom;

    const exportArea = reactFlowWrapper.current;
    if (!exportArea) return;

    const dpr = 2;

    // --- BƯỚC MỚI: tạm thời bỏ chọn để tránh xuất ảnh bị màu xanh ---
    const prevNodeSelected = nodes.map((n) => ({ id: n.id, selected: !!n.selected }));
    const prevWireSelected = wires.map((w) => ({ id: w.id, selected: !!w.selected }));
    const prevSelectedPanel = selected;

    setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
    setWires((ws) => ws.map((w) => ({ ...w, selected: false })));
    setSelected(null);

    // Đợi 1 khung hình để React re-render xong (màu về lại bình thường) rồi mới chụp
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
        toBlob(exportArea, {
            backgroundColor: 'rgba(0,0,0,0)', 
            pixelRatio: dpr, 
            filter: (domNode) => {
            const excludeIds = ['ui-overlay', 'context-menu'];
            if (domNode?.id && excludeIds.includes(domNode.id)) return false;
            if (domNode?.classList) {
                const classes = domNode.classList;
                if (
                classes.contains('react-flow__background') || 
                classes.contains('react-flow__controls') ||
                classes.contains('react-flow__nodesselection') ||       
                classes.contains('react-flow__nodesselection-rect')     
                ) return false;
            }
            return true;
            }
        })
            .then((fullBlob) => {
            if (!fullBlob) return;
            const img = new Image();
            const url = URL.createObjectURL(fullBlob);
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = screenWidth * dpr;
                canvas.height = screenHeight * dpr;
                const ctx = canvas.getContext('2d');
                
                ctx.drawImage(img, screenX * dpr, screenY * dpr, screenWidth * dpr, screenHeight * dpr, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob((croppedBlob) => {
                if (croppedBlob) {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': croppedBlob })])
                    .then(() => alert('Đã copy vùng chọn (trong suốt) vào Clipboard!'))
                    .catch((err) => alert('Lỗi khi ghi vào Clipboard: ' + err));
                }
                URL.revokeObjectURL(url);

                // --- Khôi phục lại trạng thái chọn sau khi chụp xong ---
                setNodes((ns) => ns.map((n) => {
                    const prev = prevNodeSelected.find((p) => p.id === n.id);
                    return prev ? { ...n, selected: prev.selected } : n;
                }));
                setWires((ws) => ws.map((w) => {
                    const prev = prevWireSelected.find((p) => p.id === w.id);
                    return prev ? { ...w, selected: prev.selected } : w;
                }));
                setSelected(prevSelectedPanel);
                }, 'image/png');
            };
            img.src = url;
            }).catch((err) => {
            console.error('Lỗi tạo ảnh:', err);
            // Nếu lỗi vẫn phải khôi phục selection
            setNodes((ns) => ns.map((n) => {
                const prev = prevNodeSelected.find((p) => p.id === n.id);
                return prev ? { ...n, selected: prev.selected } : n;
            }));
            setWires((ws) => ws.map((w) => {
                const prev = prevWireSelected.find((p) => p.id === w.id);
                return prev ? { ...w, selected: prev.selected } : w;
            }));
            setSelected(prevSelectedPanel);
            });
        });
    });
    }, [nodes, wires, selected, tx, ty, zoom, setNodes, setWires, setSelected]);
    
    
    return handleCopyImage;
}