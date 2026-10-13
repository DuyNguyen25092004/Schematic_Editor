---
name: custom-dev-skill
description: Quy trình chuẩn cho Developer Agent trong dự án Schematic Editor: lập kế hoạch trước và chỉ code khi người dùng duyệt, kiểm tra code/MCP sau khi sửa, log lỗi vào ISSUE.md, ghi câu hỏi vào OPEN_QUESTIONS.md, grill-me nếu có thắc mắc, và cập nhật HANDOFF.md cuối phiên.
---

# Custom Dev Skill

Skill này quy định quy trình làm việc chuẩn cho Agent trong dự án **Schematic_Editor**.

## Quy trình làm việc bắt buộc (Mandatory Workflow)

### 1. Lập Kế hoạch Trước & Chờ Người dùng Duyệt (Plan-First & User Approval Before Code)
- Khi tiếp nhận bất kỳ báo lỗi (bug) hoặc yêu cầu tính năng mới nào từ người dùng:
  - **CHỈ ĐƯỢC PHÉP thêm vào kế hoạch (Plan / Artifact)**, phân tích nguyên nhân cốt lõi và đề xuất các giải pháp kỹ thuật cụ thể.
  - **TUYỆT ĐỐI CHƯA ĐƯỢC CHỈNH SỬA CODE** (không sửa/thêm/xóa bất kỳ file source code nào trong dự án trước khi có lệnh rõ ràng).
  - **CHỈ KHI NÀO người dùng cho phép thực thi những gì trong kế hoạch** (ví dụ: người dùng xác nhận "đồng ý", "hãy làm theo kế hoạch", "tiến hành code đi", v.v.) thì Agent mới được bắt đầu thực hiện chỉnh sửa code.


### 2. Kiểm tra sau khi code (Post-Implementation Verification)
- Sau khi được người dùng duyệt và hoàn thành code:
  - Chạy kiểm tra build: `npm run build` hoặc lint để đảm bảo không có lỗi cú pháp/import.
  - Sử dụng công cụ MCP (hoặc kịch bản tự động hóa Playwright) để kiểm tra tương tác thực tế trên giao diện web nếu có thay đổi UI/logic canvas.
- **Nếu phát hiện lỗi hoặc cảnh báo**:
  - Ghi nhận chi tiết vào [`docs/ISSUE.md`](../../../docs/ISSUE.md).
  - Khắc phục lỗi và kiểm thử lại trước khi bàn giao cho người dùng.

### 3. Xử lý câu hỏi cần Confirm (Clarification & Alignment)
- Khi có bất kỳ điểm nào chưa rõ ràng, có nhiều phương án thiết kế hoặc cần người dùng chốt:
  - Ghi câu hỏi vào [`docs/OPEN_QUESTIONS.md`](../../../docs/OPEN_QUESTIONS.md).
  - **Không bao giờ để câu hỏi bị stale (bỏ quên)**: Chủ động hỏi người dùng hoặc gợi ý kích hoạt lệnh `/grill-me` để phỏng vấn làm rõ chi tiết trong quá trình lập kế hoạch.

### 4. Cập nhật cuối mỗi phiên (Session Handoff)
- Ở cuối mỗi phiên làm việc hoặc trước khi kết thúc tác vụ:
  - Bắt buộc cập nhật vào [`docs/HANDOFF.md`](../../../docs/HANDOFF.md):
    1. Những tính năng / lỗi đã xử lý trong phiên.
    2. Trạng thái hiện tại của codebase.
    3. Các bước tiếp theo dự kiến.
