# Issue Tracker

Tài liệu ghi nhận các lỗi code, lỗi runtime hoặc vấn đề phát hiện trong quá trình phát triển/kiểm thử.

---

## Danh sách vấn đề đang xử lý (Active Issues)

*(Hiện không có vấn đề nào đang tồn đọng)*

---

## Danh sách vấn đề đã giải quyết (Resolved Issues)

### [ISSUE-004] Chân input của cổng OR, NOR, XOR, XNOR bị chụm vào nhau và lòi vào trong thân symbol
- **Mô tả**: Khi đặt các cổng logic OR, NOR, XOR, XNOR trên canvas, các đường chân pin input bị xiên chụm lại về phía tâm $y = 0$ thay vì là các đường thẳng nằm ngang song song. Đồng thời, đầu mút chân pin bị lòi xuyên qua đường cong lưng cổng vào bên trong thân symbol (càng nhiều chân input càng lòi sâu).
- **Nguyên nhân**: 
  1. Trong `src/symbols/index.jsx`, các component `OrGateSymbol`, `NorGateSymbol`, `XorGateSymbol`, `XnorGateSymbol` khi render `<line key={idx} x1="-30" y1={y} x2={x2} ... />` bị thiếu thuộc tính `y2={y}`. Trong chuẩn SVG, `y2` mặc định bằng `0`, làm tất cả chân input bị kéo xiên chụm đầu về tâm $(y = 0)$.
  2. Công thức tính giao điểm $x2$ trước đây sử dụng độ sâu của điểm điều khiển ngoài đường cong (Control Point displacement $\Delta = 9$ cho OR và $\Delta = 7.3$ cho XOR). Do đường cong Bezier bậc hai có độ võng thực tế tại tâm là $\Delta / 2$, nên hệ số cũ bị gấp đôi độ võng thực, đẩy đầu mút $x2$ đâm xuyên qua lưng cổng $4.5\text{px}$ vào trong thân symbol.
- **Giải pháp**: 
  - Bổ sung `y2={y}` vào tất cả các thẻ `<line>` render chân input trong `OrGateSymbol`, `NorGateSymbol`, `XorGateSymbol`, `XnorGateSymbol`.
  - Hiệu chỉnh chuẩn xác hệ số Bezier: đổi từ $9 \rightarrow 4.5$ cho OR/NOR ($x2 = -20 + 4.5(1 - (y/H)^2)$) và từ $7.3 \rightarrow 3.65$ cho XOR/XNOR ($x2 = -20 + 3.65(1 - (y/H)^2)$).
  - Giới hạn tỷ lệ clamp `Math.min(1, Math.abs(y) / H)` để tính toán giao điểm $x2$ chạm mút lưng cong chính xác tuyệt đối ở mọi số lượng cổng $N$ ($2 \le N \le 16$).
- **Trạng thái**: **ĐÃ GIẢI QUYẾT (RESOLVED)**. Đã kiểm thử tự động với Playwright MCP, kiểm tra DOM xác nhận $y1 === y2$ cho 100% các chân pin và chụp ảnh màn hình nghiệm thu visual proof trên cả cổng 2, 3, 4 và 8 ngõ vào (`or_nor_xor_xnor_leads_flush_verified-2026-10-12T18-21-03-086Z.png`, `or8_xor8_flush_verified-2026-10-12T18-21-21-016Z.png`). Chân pin tiếp xúc phẳng khít hoàn hảo với đường cong lưng cổng.

### [ISSUE-003] Snap dây vào điểm giữa đoạn dây nối 2 terminal transistor gần nhau bị hút dính vào terminal
- **Mô tả**: Khi đặt 2 MOSFET dọc gần nhau (ví dụ M1 Drain nối vào M2 Source cách nhau 20px - 30px), kéo dây ngang vào điểm giữa của đoạn dây thì con trỏ bị hút dính vào cực Drain hoặc cực Source thay vì snap vào thân dây.
- **Nguyên nhân**: `snapPoint` trong `src/wires/snap.js` kiểm tra Port trước với bán kính lớn `SNAP_RADIUS = 15px` và early-return ngay lập tức. Với 2 terminal cách nhau 20px, 2 vòng tròn bán kính 15px phủ kín toàn bộ đoạn dây, khiến logic mid-wire snap không bao giờ được chạy.
- **Giải pháp**: 
  - Triển khai **Distance Arbitration with Mid-Wire Priority**: Tính toán đồng thời cả khoảng cách đến terminal (`distTerm`) và khoảng cách vuông góc đến thân dây (`distWire`).
  - Khi con trỏ nằm trực diện trên thân dây gần hơn terminal (`distWire < distTerm`) hoặc ngoài vùng tiếp xúc trực tiếp (`distTerm > DIRECT_TERMINAL_RADIUS = 6px`), ưu tiên bắt dính trực tiếp vào thân dây (`snapPoint.y = seg.y`).
  - Hỗ trợ chiều cao động cho logic gates đa đầu vào (`extraH = ((data?.inputs || 2) - 2) * 10`).
- **Trạng thái**: **ĐÃ GIẢI QUYẾT (RESOLVED)**. Đã kiểm thử tự động với Playwright MCP, xác nhận snap ngang vào midpoint của dây 20px giữa M2 và M1 không bị hút vào terminal.

### [ISSUE-001] Dây chữ L / U có 2 đầu nối vào terminal bị nhảy loạn xạ khi kéo thân dây
- **Mô tả**: Khi dây hình chữ L hoặc chữ U có 2 đầu nối vào terminal, người dùng kéo thân dây sang trái / phải / lên / xuống thì dây bị giật, nhảy sai vị trí hoặc vỡ vụn thành các đoạn zigzag.
- **Nguyên nhân**: Quá trình kéo cũ tính toán cộng dồn qua từng frame trên `w.points`. Khi `simplifyMiddle` thu gọn các điểm thẳng hàng, độ dài mảng co lại làm `segIndex` bị lệch sang đoạn vuông góc khác, ép sai trục tọa độ và gây nhảy loạn xạ.
- **Giải pháp**: Áp dụng mô hình **Baseline Anchor Pattern**:
  - Tại `mousedown`, đóng băng mốc tham chiếu cố định `initialPoints` lấy từ `displayPts` (kết quả `resolvePoints`), cùng với `segIndex` và `fixedAxis`.
  - Trên mỗi frame `mousemove`, gọi hàm thuần túy `computeDraggedWire(initialPoints, segIndex, newVal)`. 0% tích lũy sai số trôi dạt, 0% lệch index.
- **Trạng thái**: **ĐÃ GIẢI QUYẾT (RESOLVED)**. Đã kiểm thử tự động bằng Playwright (`test_wire_drag_e2e.mjs` - Test A & Test B), kéo U-shape và L-shape qua lại không bị nhảy loạn xạ.

### [ISSUE-002] Không thể điều chỉnh thân dây sau khi kéo đầu mút từ đường ngang lên tạo chữ L
- **Mô tả**: Khi người dùng kéo điểm cuối của dây đi lên từ đường ngang để tạo thành chữ L, sau đó không thể bấm vào thân dây để điều chỉnh vị trí được nữa.
- **Nguyên nhân**: Hàm kéo đầu mút cũ `startEndDrag` chỉ lưu 2 điểm chéo thô vào `wire.points` mà không chèn điểm góc vuông (elbow) thực sự, đồng thời `WireHandles` dựa vào `resolveSkeleton` thay vì `resolvePoints`.
- **Giải pháp**:
  - Triển khai `computeEndpointDrag(initialPoints, isStart, snapped)` tự động phát hiện lệch hướng và chèn elbow trực giao vào `wire.points`.
  - Đồng bộ `displayPts` trong `WireHandles.jsx` với `resolvePoints` khớp 100% với đường nét vẽ trên canvas.
- **Trạng thái**: **ĐÃ GIẢI QUYẾT (RESOLVED)**. Đã kiểm thử tự động bằng Playwright (`test_wire_drag_e2e.mjs` - Test C), kéo đầu mút tạo chữ L sinh đủ 2 line handles và kéo điều chỉnh thân dây thành công.
