# SketchSync 🎨

A production-grade, real-time collaborative whiteboard application inspired by Excalidraw and FigJam. Built on a raw HTML5 Canvas API drawing engine with pixel-perfect cursor synchronization, operation-based history rollback, and automatic workspace persistence.

---

## Technical Architecture Overview

SketchSync is organized as a unified full-stack monorepo:

```
├── apps/
│   ├── web/               # Next.js 15 App Router + React 19 Frontend
│   └── server/            # Express.js REST API + Socket.IO Server
├── packages/
│   ├── types/             # Shared TypeScript types for REST and WebSockets
│   ├── tsconfig/          # Standardized TypeScript compiler options
│   └── eslint-config/     # Unified linting rules
```

```mermaid
graph TD
    Client1[Next.js Client A] <-->|Socket.IO Events| Server[Express + Socket.IO Server]
    Client2[Next.js Client B] <-->|Socket.IO Events| Server
    Server <-->|Prisma Client| DB[(PostgreSQL Database)]
```

---

## Core Features

- **Raw HTML5 Canvas Engine**: Optimized repaint cycles using `requestAnimationFrame`, infinite pan and zoom transformations, and custom hit-detection algorithms for complex shapes and paths.
- **Collaborative Presence**: Near zero-latency remote pointer synchronization with client-side interpolation, and visual room activity alerts.
- **Transactional History (Undo / Redo)**: Operation-based undo/redo stack localized to user modifications. Collaborative updates made by others are kept safe during history rollbacks.
- **Polished UX**: Context-sensitive properties sidebar (strokes, fills, layer ordering, opacity, text size), dynamic hover transitions, keyboard shortcuts, inline vector text editing, and skeleton loading screens.
- **File Portability**: Snapshots can be exported to PNG images or serialized JSON files, with drag-and-drop JSON importing.

---

## Canvas Engine & Math Details

To prevent DOM bottlenecks when rendering thousands of vector objects, the whiteboard is drawn entirely on a single HTML5 `<canvas>`.

### Viewport Coordinate Transformations
The engine translates screen coordinates (from mouse events) to world coordinates (where shapes reside) and back.
* **Screen to World (Click Hit-Tests):**
  $$x_{\text{world}} = \frac{x_{\text{screen}} - \text{pan}_x}{\text{zoom}}$$
  $$y_{\text{world}} = \frac{y_{\text{screen}} - \text{pan}_y}{\text{zoom}}$$
* **World to Screen (Rendering Offset):**
  $$x_{\text{screen}} = x_{\text{world}} \times \text{zoom} + \text{pan}_x$$
  $$y_{\text{screen}} = y_{\text{world}} \times \text{zoom} + \text{pan}_y$$

### Rotated Element Hit-Testing
To test if a click intersects a rotated rectangle, the engine rotates the mouse cursor *in reverse* around the center of the element, projecting the coordinates into an axis-aligned box where boundary checks are trivial:
```typescript
// From canvas-engine/math.ts
export const rotatePoint = (x: number, y: number, cx: number, cy: number, angle: number): Point => {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + (x - cx) * cos - (y - cy) * sin,
    y: cy + (x - cx) * sin + (y - cy) * cos
  };
};
```

---

## WebSocket & Synchronization Protocol

The collaboration system runs on Socket.IO using a strongly typed event payload protocol defined in `packages/types/src/index.ts`.

### WebSocket Events
| Event Name | Direction | Payload Description |
| :--- | :--- | :--- |
| `room:join` | Client $\rightarrow$ Server | Join room room workspace by UUID |
| `room:state` | Server $\rightarrow$ Client | Initial list of all room elements and members |
| `cursor:move` | Client $\rightarrow$ Server | X/Y coordinates of user pointer (throttled at 40ms) |
| `cursor:update`| Server $\rightarrow$ Client | Broadcast coordinate updates of peer users |
| `element:create`| Client $\rightarrow$ Server | Create a new vector element |
| `element:update`| Client $\rightarrow$ Server | Drag or resize modifications |
| `element:delete`| Client $\rightarrow$ Server | Delete element by UUID |
| `presence:update`| Server $\rightarrow$ Client | Refreshed list of current room collaborators |

### Debounced Writes to PostgreSQL
To avoid freezing database connections during mouse drags, the server handles `element:update` by updating clients instantly, but debouncing the database write by `500ms`. When mouse activity halts, the final vector state is cleanly flushed to the database.

---

## Why this project is impressive for frontend interviews

This application serves as an advanced portfolio highlight for several reasons:
1. **Raw Canvas Mastery**: Demonstrates high-performance rendering without relying on standard HTML templates. Focuses on matrix translations, mathematical line-distance models, and trigonometric rotations.
2. **Real-time Event Architecture**: Implements a throttled presence client, optimistic state updates, and an in-memory debounced persistence queue.
3. **Advanced State Management**: Showcases custom Zustand stores coordinate syncing, with a command pattern-based undo/redo system that works in a multi-user environment.
4. **Clean Code & Monorepo Configuration**: Structured with strict type checking, code sharing across packages, and an Express service integrated with Prisma ORM.

---

## Local Development Setup

### Prerequisites
- Node.js (version 18 or higher)
- pnpm (version 8 or higher)
- PostgreSQL database instance

### Installation
1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```
2. Configure environmental variables. Create `.env` files in both apps:
   - In `apps/server/.env`:
     ```env
     PORT=5001
     DATABASE_URL="postgresql://username:password@localhost:5432/whiteboard"
     JWT_SECRET="development-secret-key"
     CLIENT_URL="http://localhost:3000"
     ```
   - In `apps/web/.env`:
     ```env
     NEXT_PUBLIC_SERVER_URL="http://localhost:5001"
     ```

3. Generate and push database schemas:
   ```bash
   pnpm db:generate
   pnpm db:push
   ```

4. Launch the local development workspace:
   ```bash
   pnpm dev
   ```
   The client will load on `http://localhost:3000` and the API/WebSocket server will start on `http://localhost:5001`.

---

## Deployment Notes

- **Frontend (`apps/web`)**: Deployable to Vercel. Ensure the environment variable `NEXT_PUBLIC_SERVER_URL` is set to point to your live backend.
- **Backend (`apps/server`)**: Deployable to Railway or Render. Configure environment variables for `DATABASE_URL`, `JWT_SECRET`, and `CLIENT_URL` (set to your frontend's production URL).
- **PostgreSQL**: Spin up a serverless instance using Neon or Supabase.
