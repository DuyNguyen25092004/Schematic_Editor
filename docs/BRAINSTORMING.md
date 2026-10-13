# Brainstorming & Finalized Decisions

Tài liệu lưu trữ các ý tưởng, giải pháp kiến trúc và các quyết định kỹ thuật đã chốt.

---

## 1. Quyết định đã chốt (Finalized Decisions)
- [x] **Đồng bộ thời gian thực (Realtime Sync)**: Chuyển đồng bộ mạch từ Firestore sang Firebase Realtime Database (RTDB) để tối ưu độ trễ, tránh Quota Exceeded và hỗ trợ edit trực tiếp đa người dùng.
- [x] **Lưu trữ đám mây (Cloud Storage)**: Tích hợp Google Drive để lưu trữ và mở các tệp mạch sơ đồ.
- [x] **Tab quản lý mạch**: Thay thế giao diện Group cũ bằng `CircuitTabBar` để quản lý nhiều trang/mạch trực quan.
- [x] **Ký hiệu D Flip-Flop**: Bổ sung biến thể `DFF (SET, RST)` bên cạnh `DFF (EN, RST)` với chân Set ở đỉnh, Reset ở đáy.
- [x] **Cổng logic đa đầu vào**: Cho phép chọn và chỉnh số lượng ngõ vào tùy ý (AND, OR, NAND, NOR, XOR, XNOR) và tự động co giãn kích thước symbol/chân nối phù hợp theo chuẩn lưới.

---

## 2. Ý tưởng đang cân nhắc (Ideas & Proposals)
- [ ] Xuất file Netlist (SPICE / CDL) phục vụ mô phỏng mạch điện tử.
- [ ] Tối ưu thuật toán tự động tránh vật cản khi đi dây phức tạp (A* obstacle router).

