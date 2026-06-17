export type ElementType = 'pencil' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text';

export interface Point {
  x: number;
  y: number;
}

export interface WhiteboardElement {
  id: string;
  roomId: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: [number, number][]; // used for pencil free-draw
  text?: string;               // used for text elements
  strokeColor: string;
  fillColor: string;           // 'transparent' or color hex
  strokeWidth: number;
  opacity: number;
  rotation: number;
  zIndex: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface Room {
  id: string;
  title: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  role: 'owner' | 'member';
}

export interface Presence {
  userId: string;
  name: string;
  avatarColor: string;
  roomId: string;
  cursorX: number | null;
  cursorY: number | null;
  status: 'active' | 'idle';
}

// WS CLIENT -> SERVER PAYLOADS
export interface ClientToServerEvents {
  'room:join': (payload: { roomId: string }) => void;
  'room:leave': () => void;
  'cursor:move': (payload: { x: number | null; y: number | null }) => void;
  'element:create': (payload: { element: WhiteboardElement }) => void;
  'element:update': (payload: { element: WhiteboardElement }) => void;
  'element:delete': (payload: { elementId: string }) => void;
  'elements:bulk_sync': (payload: { elements: WhiteboardElement[] }) => void;
}

// WS SERVER -> CLIENT PAYLOADS
export interface ServerToClientEvents {
  'room:state': (payload: { elements: WhiteboardElement[]; members: Presence[] }) => void;
  'presence:update': (payload: { members: Presence[] }) => void;
  'cursor:update': (payload: { userId: string; x: number | null; y: number | null }) => void;
  'element:created': (payload: { element: WhiteboardElement }) => void;
  'element:updated': (payload: { element: WhiteboardElement }) => void;
  'element:deleted': (payload: { elementId: string }) => void;
  'user:joined': (payload: { user: Presence }) => void;
  'user:left': (payload: { userId: string; username: string }) => void;
  'error': (payload: { message: string }) => void;
}
