# AGENTS.md

## Project Overview
- **Schematic_Editor**: Web-based Cadence Virtuoso schematic capture clone.
- **Tech Stack**: React 19, Vite, ReactFlow, Firebase Realtime Database (RTDB), Google Drive API, KaTeX.

## Key Architecture
- `src/Flow.jsx`: Main canvas, interaction state, node/wire lifecycle.
- `src/constants.js`: Port coordinates, symbol boxes, component library metadata.
- `src/symbols/index.jsx`: SVG renderers for schematic symbols.
- `src/nodes/`: ReactFlow custom node wrappers (`SymbolNode.jsx`, `TwoTerminalNode.jsx`, etc.).
- `src/wires/`, `src/routing/`, `src/geometry/`: Orthogonal wire routing, snapping, and connection algorithms.
- `src/realtime/`: Multi-user presence (`usePresence.js`) and circuit synchronization (`useCircuitSync.js`, `rtdbCleanup.js`).
- `src/cloud/`: Google Drive storage integration (`driveStorage.js`, `CloudPanel.jsx`).

## Core Rules & Developer Workflow
1. **Plan-First & User Approval**: Mọi lỗi hoặc tính năng mới CHỈ được đưa vào kế hoạch (`/plan`), tuyệt đối **chưa được chỉnh sửa code**. Chỉ khi nào người dùng cho phép thực thi kế hoạch mới được bắt đầu code.
2. **Verification**: Sau khi code, bắt buộc test bằng build (`npm run build`) và Playwright MCP.
3. **Issue & Question Tracking**: Lỗi chưa xong hoặc phát sinh log vào [`docs/ISSUE.md`](docs/ISSUE.md); vấn đề cần confirm ghi vào [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) (luôn gợi ý `/grill-me`, không để stale).
4. **Session Handoff**: Cuối mỗi phiên làm việc, bắt buộc cập nhật vào [`docs/HANDOFF.md`](docs/HANDOFF.md).


## Essential Documentation References
- [`docs/BRAINSTORMING.md`](docs/BRAINSTORMING.md): Feature ideas, architecture proposals, and finalized decisions.
- [`docs/HANDOFF.md`](docs/HANDOFF.md): Session progress log and status handoff (updated at end of every session).
- [`docs/ISSUE.md`](docs/ISSUE.md): Bug tracker and unresolved code/runtime issues.
- [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md): Pending questions requiring user confirmation.
- [`.agent/skills/custom-dev-skill/SKILL.md`](.agent/skills/custom-dev-skill/SKILL.md): Standard developer agent workflow guidelines.
