import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { Presence, WhiteboardElement } from '@whiteboard/types';
import { useCanvasStore } from './canvasStore';

interface CollabState {
  socket: Socket | null;
  members: Presence[];
  isConnected: boolean;
  
  // Actions
  initSocket: (roomId: string, username?: string) => void;
  closeSocket: () => void;
  sendCursorMove: (x: number | null, y: number | null) => void;
  sendElementCreate: (element: WhiteboardElement) => void;
  sendElementUpdate: (element: WhiteboardElement) => void;
  sendElementDelete: (elementId: string) => void;
  sendElementsBulkSync: (elements: WhiteboardElement[]) => void;
}

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5001';

export const useCollabStore = create<CollabState>((set, get) => ({
  socket: null,
  members: [],
  isConnected: false,

  initSocket: (roomId, username) => {
    // If socket already active, close it first
    if (get().socket) {
      get().closeSocket();
    }

    const socket = io(SERVER_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      query: username ? { name: username } : undefined,
    });

    socket.on('connect', () => {
      set({ isConnected: true });
      socket.emit('room:join', { roomId });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    // Handle initial state sync
    socket.on('room:state', ({ elements, members }: { elements: WhiteboardElement[]; members: Presence[] }) => {
      useCanvasStore.getState().setElements(elements);
      set({ members });
    });

    // Handle presence updates
    socket.on('presence:update', ({ members }: { members: Presence[] }) => {
      // Filter out self so we don't render our own cursor on top of the drawing pointer
      const socketId = socket.id;
      const selfUserId = socketId; // Or authenticated userId if we match it
      // For this implementation, we will filter cursors on render or keep them in array
      set({ members });
    });

    // Handle individual remote cursor moves
    socket.on('cursor:update', ({ userId, x, y }: { userId: string; x: number | null; y: number | null }) => {
      set((state) => ({
        members: state.members.map((member) =>
          member.userId === userId ? { ...member, cursorX: x, cursorY: y } : member
        ),
      }));
    });

    // Handle remote element creations
    socket.on('element:created', ({ element }: { element: WhiteboardElement }) => {
      // Add element to canvas store without triggering local undo/redo stack push
      const current = useCanvasStore.getState().elements;
      if (!current.some((el) => el.id === element.id)) {
        useCanvasStore.getState().setElements([...current, element]);
      }
    });

    // Handle remote element modifications
    socket.on('element:updated', ({ element }: { element: WhiteboardElement }) => {
      const current = useCanvasStore.getState().elements;
      useCanvasStore.getState().setElements(
        current.map((el) => (el.id === element.id ? element : el))
      );
    });

    // Handle remote element deletions
    socket.on('element:deleted', ({ elementId }: { elementId: string }) => {
      const current = useCanvasStore.getState().elements;
      const selected = useCanvasStore.getState().selectedIds;
      useCanvasStore.getState().setElements(current.filter((el) => el.id !== elementId));
      useCanvasStore.getState().setSelectedIds(selected.filter((id) => id !== elementId));
    });

    set({ socket });
  },

  closeSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ socket: null, members: [], isConnected: false });
  },

  sendCursorMove: (x, y) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('cursor:move', { x, y });
    }
  },

  sendElementCreate: (element) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('element:create', { element });
    }
  },

  sendElementUpdate: (element) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('element:update', { element });
    }
  },

  sendElementDelete: (elementId) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('element:delete', { elementId });
    }
  },

  sendElementsBulkSync: (elements) => {
     const { socket } = get();
     if (socket && socket.connected) {
       socket.emit('elements:bulk_sync', { elements });
     }
  }
}));
