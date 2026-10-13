# Handoff Log

Tài liệu này được cập nhật liên tục vào cuối mỗi phiên làm việc để bàn giao trạng thái dự án.

---

## Phiên gần nhất: 2026-10-12 (Phiên tối: Khắc phục lỗi kéo dây & Thiết kế lại QuickAddMenu)

### 1. Công việc đã hoàn thành

#### A. Khắc phục triệt để lỗi kéo dây nối (Wire Dragging & Endpoint Dragging)
- **Giải quyết lỗi dây L/U bị nhảy loạn xạ khi kéo thân dây (ISSUE-001)**:
  - Loại bỏ hoàn toàn cơ chế tính toán đột biến tích lũy sai số frame-to-frame.
  - Triển khai thuật toán thuần túy `computeDraggedWire(initialPoints, segIndex, newVal)` trong `src/wires/wireOps.js`.
  - Áp dụng **Baseline Anchor Pattern** trong `src/components/WireHandles.jsx`: cố định mốc `initialPoints` lấy từ `displayPts` tại thời điểm `mousedown`. Khi di chuột, mọi phép tính chỉ dựa trên mốc gốc, loại trừ 100% hiện tượng trôi index và nhảy dây.
- **Giải quyết lỗi không điều chỉnh được thân dây sau khi kéo đầu mút tạo chữ L (ISSUE-002)**:
  - Triển khai `computeEndpointDrag(initialPoints, isStart, snapped)` trong `src/wires/wireOps.js`, tự động chèn điểm góc vuông (elbow) trực giao vào `wire.points` khi kéo lệch hướng.
  - Chuyển đổi nguồn dữ liệu hiển thị handle trong `WireHandles.jsx` sang `resolvePoints(...)` để khớp hoàn toàn với đường vẽ SVG trên màn hình.
  - Tắt hành vi tự phóng to `zoomOnDoubleClick={false}` trên `<ReactFlow>` để ngăn cản việc zoom đột ngột khi nhấp đúp hoàn tất vẽ dây.

#### B. Thiết kế lại Hộp thoại Đặt Nhanh Linh kiện (Phím "I" - QuickAddMenu)
- **Khắc phục tràn dọc**:
  - Cố định hộp thoại với `width: 560px`, `maxHeight: 84vh`. Khu vực danh sách linh kiện sử dụng cuộn dọc nội bộ (`overflowY: auto`).
- **Tìm kiếm tức thì (Real-time Instant Search)**:
  - Tự động `autoFocus` vào ô input khi mở menu (nhấn phím `I`).
  - Hỗ trợ tìm kiếm theo `label`, `short`, `type`, `refPrefix`.
  - Chuẩn hóa tiếng Việt không dấu (`stripAccents`) giúp tìm kiếm không phân biệt dấu và chữ hoa/thường.
  - Thêm nút xóa nhanh từ khóa (✕).
  - Thêm `e.preventDefault()` khi bắt phím `I` trong `useKeyboardShortcuts.js` để tránh việc ký tự 'i' bị gõ vào ô tìm kiếm.
- **Tích chọn lọc theo họ linh kiện (Category Filters)**:
  - Thêm hàng checkbox chip cho 7 họ linh kiện từ `COMPONENT_CATEGORIES` (`Transistors`, `Passives`, `Switches`, `Power and Ports`, `Analog Blocks`, `Logic Gates`, `Shapes`).
  - Checkbox "Tất cả" (All) cho phép bật/tắt toàn bộ nhóm nhanh chóng.
- **Bố cục lưới & Điều hướng bàn phím**:
  - Danh sách hiển thị theo dạng lưới 2 cột gọn gàng, hiển thị kèm `MiniIcon`, tên linh kiện, mã viết tắt và tiền tố `refPrefix`.
  - Hỗ trợ phím mũi tên `↑` / `↓` để di chuyển, `Enter` để chọn, `Esc` để đóng.

#### C. Kiểm thử Toàn diện & Tự động bằng Playwright
- Xây dựng kịch bản kiểm thử E2E tự động (`scratch/test_wire_drag_e2e.mjs` và `scratch/verify_all.mjs`):
  - **Test QuickAddMenu**: Đo kích thước menu ($\le 84vh$), tìm kiếm linh kiện (`dff` -> ra 2 DFF), lọc họ linh kiện (`Transistors` -> ra 4 transistor), đóng bằng phím `Escape`.
  - **Test Wire Dragging Straight -> U-shape**: Kéo thân dây tạo U-shape 4 điểm, kéo ngược lại thẳng tắp không lỗi.
  - **Test Wire Dragging L-shape Stress Test**: Kéo thân dây chữ L qua lại các mốc cực hạn vượt qua chân terminal, xác nhận dây không bị nhảy loạn xạ.
  - **Test Endpoint Drag L-shape & Body Drag**: Kéo đầu mút tạo chữ L 3 điểm trực giao, xác nhận xuất hiện đầy đủ 2 line handles trên cả 2 đoạn và kéo thân dây thành công.
- Chụp ảnh màn hình nghiệm thu đầy đủ và lưu trữ trong thư mục artifacts.
- Kiểm tra `npm run build`: Build thành công (486ms), 0 lỗi linter/compiler.

#### D. Cập nhật Quy trình Skill (`custom-dev-skill`) & `AGENTS.md`
- Bổ sung quy tắc bắt buộc: **Mọi lỗi hoặc tính năng mới CHỈ ĐƯỢC PHÉP đưa vào kế hoạch (Plan)**, tuyệt đối **chưa được chỉnh sửa code**.
- **Chỉ khi người dùng cho phép thực thi kế hoạch** thì Agent mới được bắt đầu chỉnh sửa code trong dự án.
- Cập nhật đồng bộ vào [`.agent/skills/custom-dev-skill/SKILL.md`](../.agent/skills/custom-dev-skill/SKILL.md) và [`AGENTS.md`](../AGENTS.md).

## Phiên gần nhất: 2026-10-13 (Nghiệm thu Toàn diện: Sửa Snap Giữa Dây, Cổng Logic N Ngõ Vào, Anh Hóa Toàn Diện & Chuẩn hóa Chân Cổng OR/NOR/XOR/XNOR)

### 1. Tổng kết các Hạng mục đã Triển khai & Nghiệm thu

#### A. Khắc phục lỗi snap giữa dây MOSFET gần nhau (ISSUE-003)
- **Vấn đề**: Khi đặt 2 MOSFET dọc gần nhau (cách nhau 20px–30px), kéo dây ngang vào giữa đoạn nối bị hút dính vào cực Drain hoặc Source do bán kính `SNAP_RADIUS = 15px` phủ kín cả đoạn dây.
- **Giải pháp**: Triển khai cơ chế **Distance Arbitration with Mid-Wire Priority** trong `src/wires/snap.js`:
  - Tính toán đồng thời cả khoảng cách đến terminal (`distTerm`) và khoảng cách vuông góc đến thân dây (`distWire`).
  - Khi con trỏ chuột nằm gần thân dây hơn (`distWire < distTerm`) hoặc ngoài vùng tiếp xúc cực tiểu (`distTerm > DIRECT_TERMINAL_RADIUS = 6px`), thuật toán ưu tiên bắt dính trực tiếp vào thân dây.
  - Hỗ trợ chiều cao động cho cổng logic đa đầu vào `extraH = ((data?.inputs || 2) - 2) * 10`.
- **Nghiệm thu**: Kiểm thử tự động trên Playwright MCP với đoạn dây 20px giữa M2 Source và M1 Drain, xác nhận con trỏ tại điểm giữa bắt dính chính xác vào thân dây, không bị hút vào terminal.

#### B. Cổng logic N ngõ vào co giãn kích thước động ($2 \le N \le 16$)
- **Chuẩn hóa lưới tọa độ Cadence (Grid Alignment)**:
  - Công thức tọa độ chân pin đầu vào: $y_i = 50 - (N - 1) \times 10 + (i - 1) \times 20$ trong `src/constants.js`.
  - Đảm bảo khoảng cách giữa các chân luôn là $20\text{px}$, mọi chân pin luôn rơi trúng lưới $10\text{px}$ (`GRID = 10`), không bao giờ lệch dây.
  - Chân output giữ đối xứng tại $y = 50$.
- **Động hóa khung bao (Bounding Box) và render SVG**:
  - `getSymbolBox` và `getPorts` trong `src/constants.js` tính toán động ($h_{\text{box}} = N \times 20$, $y_{\text{box}} = 50 - N \times 10$).
  - Trong `src/symbols/index.jsx`: Cập nhật toàn bộ 6 loại cổng logic (`AND`, `OR`, `NAND`, `NOR`, `XOR`, `XNOR`) render các đường dẫn (leads) động và đường cong Bezier Cadence mở rộng theo bán chiều cao $H = (N - 1) \times 10 + 5$.
  - Trong `src/nodes/SymbolNode.jsx`: Thêm `overflow="visible"` và điều chỉnh nhãn định danh (`Reference Label`) nằm trên đỉnh hộp bao.
- **Bảng điều khiển thuộc tính (Property Panel)**:
  - Thêm cụm điều khiển số ngõ vào: hiển thị `Inputs (N)`, bộ đếm `[-]` / `[+]` và các nút chọn nhanh `[2]`, `[3]`, `[4]`, `[5]`, `[8]`.

#### C. Chuyển đổi toàn diện giao diện sang tiếng Anh & Tinh chỉnh UI
- **Anh hóa 100% ứng dụng**:
  - Toàn bộ danh mục linh kiện trong `src/constants.js` (`ALL DEVICES`, `TRANSISTORS`, `PASSIVES`, `SWITCHES`, `POWER AND PORTS`, `ANALOG BLOCKS`, `LOGIC GATES`, `SHAPES`).
  - Toàn bộ text trong `PropertyPanel.jsx`, `QuickAddMenu.jsx`, `CircuitTabBar.jsx`, `TextDialog.jsx`, `RoomBar.jsx`, `OnlineUsers.jsx`, `CloudPanel.jsx`, `driveStorage.js`, `useCopyImage.js`.
  - Tên sheet mặc định đổi từ `Trang 1` thành `Sheet 1`, tên người dùng ngẫu nhiên đổi từ `Khách XXX` thành `Guest XXX`.
- **Tinh chỉnh giao diện**:
  - Xóa dòng chữ gợi ý *"Kéo linh kiện vào canvas, hoặc bấm phím I để gọi nhanh"* ở chân sidebar trong `ComponentPalette.jsx`.
  - Ẩn hiển thị tiền tố `[comp.refPrefix]` trong danh sách tìm kiếm `QuickAddMenu.jsx`.

#### D. Khắc phục lỗi chân input cổng OR, NOR, XOR, XNOR bị chụm và lòi vào trong symbol (ISSUE-004)
- **Vấn đề**: Các chân input bị xiên chụm đầu về tâm $(y = 0)$ và các đầu mút $x2$ bị đâm xuyên qua lưng cong vào bên trong thân symbol (càng nhiều chân input càng lòi sâu).
- **Nguyên nhân gốc rễ**: 
  1. Trong `src/symbols/index.jsx`, thẻ `<line>` của chân input bị thiếu thuộc tính `y2={y}`, khiến SVG mặc định `y2 = 0`.
  2. Công thức tính giao điểm $x2$ trước đây sử dụng trực tiếp độ lệch điểm điều khiển ngoài đường cong ($\Delta = 9$ và $\Delta = 7.3$) thay vì độ võng thực của đường cong Bezier bậc hai ($\Delta / 2 = 4.5$ và $3.65$). Do đó đầu mút $x2$ bị đẩy sâu gấp đôi độ võng thực, đâm xuyên qua lưng cổng $4.5\text{px}$ vào bên trong thân symbol.
- **Giải pháp**:
  - Bổ sung `y2={y}` vào tất cả các thẻ `<line>` chân input trong `OrGateSymbol`, `NorGateSymbol`, `XorGateSymbol`, `XnorGateSymbol`.
  - Chuẩn hóa hệ số Bezier: $x2 = -20 + 4.5(1 - (y/H)^2)$ cho OR/NOR và $x2 = -20 + 3.65(1 - (y/H)^2)$ cho XOR/XNOR.
  - Thêm giới hạn tỷ lệ clamp `Math.min(1, Math.abs(y) / H)` để tính toán giao điểm $x2$ chạm mút lưng cong phẳng khít tuyệt đối với 0px sai số.
- **Nghiệm thu**:
  - `npm run build`: Hoàn thành trong **442ms**, 0 lỗi.
  - Playwright MCP: Kiểm tra DOM xác nhận $y1 === y2$ cho 100% các chân pin input, $x2$ khớp phẳng khít mút lưng cong của `OR_2`, `OR_4`, `NOR_2`, `XOR_2`, `XOR_3`, `XNOR_4`, `OR_8`, `XOR_8`.
  - Ảnh chụp visual proof: `or_nor_xor_xnor_leads_flush_verified-2026-10-12T18-21-03-086Z.png` và `or8_xor8_flush_verified-2026-10-12T18-21-21-016Z.png`.

---

### 2. Trạng thái Dự án Hiện tại
- **Codebase**: Ổn định, sạch sẽ, hoàn thành 100% tất cả yêu cầu của người dùng, không có cảnh báo hay lỗi cú pháp.
- **Tài liệu**:
  - `docs/ISSUE.md`: Tất cả các issue (`ISSUE-001`, `ISSUE-002`, `ISSUE-003`, `ISSUE-004`) đều đã được giải quyết (`RESOLVED`). Hiện không còn issue tồn đọng.
  - `docs/OPEN_QUESTIONS.md`: `OQ-001` đã xác nhận và giải quyết. Không còn câu hỏi mở.
  - `docs/HANDOFF.md`: Đã cập nhật đầy đủ toàn bộ tiến trình làm việc.
  - Các artifact kỹ thuật lưu trữ tại thư mục artifacts:
    - `verification_and_walkthrough_report.md`
    - `fix_or_nor_xor_xnor_input_leads_pinched.md`
    - `configurable_logic_gate_inputs_plan.md`
    - `full_english_localization_plan.md`
    - `fix_mid_wire_snap_between_close_terminals.md`
- **Máy chủ Vite**: Đang hoạt động bình thường tại `http://localhost:5173/Schematic_Editor/`.

---

### 3. Hướng dẫn & Dự kiến cho Phiên Kế tiếp
- Sẵn sàng bàn giao cho người dùng sử dụng trực tiếp.
- Mọi tính năng hoặc yêu cầu mới phát sinh trong phiên tiếp theo cần tiếp tục tuân thủ quy tắc **Plan-First & User Approval** (`AGENTS.md`) trước khi thực hiện chỉnh sửa code.
