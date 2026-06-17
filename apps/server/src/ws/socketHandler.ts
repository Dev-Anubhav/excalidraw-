import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { WhiteboardElement } from '@whiteboard/types';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeychangeinproduction';

// Ephemeral room presence storage
// roomId -> Map of socketId -> presence details
interface UserPresence {
  userId: string;
  name: string;
  avatarColor: string;
  cursorX: number | null;
  cursorY: number | null;
  status: 'active' | 'idle';
}

const presenceState: Record<string, Map<string, UserPresence>> = {};

// Cache for debounced database updates to prevent hammering PostgreSQL during drags
// elementId -> { timeout: NodeJS.Timeout, element: WhiteboardElement }
const pendingDbUpdates: Map<string, { timeout: NodeJS.Timeout; element: WhiteboardElement }> = new Map();

const parseCookies = (cookieHeader: string): Record<string, string> => {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
};

// Queue DB upsert for an element
const queueDbUpdate = (element: WhiteboardElement) => {
  const existing = pendingDbUpdates.get(element.id);
  if (existing) {
    clearTimeout(existing.timeout);
  }

  const timeout = setTimeout(async () => {
    try {
      pendingDbUpdates.delete(element.id);
      await saveElementToDb(element);
    } catch (err) {
      console.error(`Failed to flush debounced update for element ${element.id}:`, err);
    }
  }, 500); // 500ms debounce

  pendingDbUpdates.set(element.id, { timeout, element });
};

// Force save a single element
const saveElementToDb = async (element: WhiteboardElement) => {
  await prisma.whiteboardElement.upsert({
    where: { id: element.id },
    create: {
      id: element.id,
      roomId: element.roomId,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      points: element.points ? JSON.stringify(element.points) : undefined,
      text: element.text,
      strokeColor: element.strokeColor,
      fillColor: element.fillColor,
      strokeWidth: element.strokeWidth,
      opacity: element.opacity,
      rotation: element.rotation,
      zIndex: element.zIndex,
      createdBy: element.createdBy,
    },
    update: {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      points: element.points ? JSON.stringify(element.points) : undefined,
      text: element.text,
      strokeColor: element.strokeColor,
      fillColor: element.fillColor,
      strokeWidth: element.strokeWidth,
      opacity: element.opacity,
      rotation: element.rotation,
      zIndex: element.zIndex,
      updatedAt: new Date(),
    },
  });
};

export const registerSocketHandlers = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    let user: { id: string; name: string; avatarColor: string } | null = null;
    let currentRoomId: string | null = null;

    // 1. Authenticate user
    try {
      const cookieHeader = socket.handshake.headers.cookie || '';
      const cookies = parseCookies(cookieHeader);
      const token = cookies['token'] || socket.handshake.auth?.token;

      if (token) {
        user = jwt.verify(token, JWT_SECRET) as any;
      }
    } catch (err) {
      // Token verification failed, continue as guest fallback below
    }

    // Fallback: Guest user
    if (!user) {
      const queryName = socket.handshake.query.name || 'Anonymous';
      const guestId = `guest-${Math.random().toString(36).substr(2, 9)}`;
      user = {
        id: guestId,
        name: String(queryName),
        avatarColor: '#9CA3AF', // Gray for guests
      };
    }

    const socketUser = user!;

    // 2. Handle room join
    socket.on('room:join', async ({ roomId }) => {
      try {
        currentRoomId = roomId;
        const roomRoom = `room:${roomId}`;
        socket.join(roomRoom);

        // Fetch current room state from DB
        const elementsRaw = await prisma.whiteboardElement.findMany({
          where: { roomId },
          orderBy: { zIndex: 'asc' },
        });

        // Parse points back to native arrays
        const elements: WhiteboardElement[] = elementsRaw.map((el: any) => ({
          id: el.id,
          roomId: el.roomId,
          type: el.type as any,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          points: el.points ? (JSON.parse(el.points as string) as [number, number][]) : undefined,
          text: el.text || undefined,
          strokeColor: el.strokeColor,
          fillColor: el.fillColor,
          strokeWidth: el.strokeWidth,
          opacity: el.opacity,
          rotation: el.rotation,
          zIndex: el.zIndex,
          createdBy: el.createdBy,
          createdAt: el.createdAt.toISOString(),
          updatedAt: el.updatedAt.toISOString(),
        }));

        // Initialize presence for this room if it doesn't exist
        if (!presenceState[roomId]) {
          presenceState[roomId] = new Map();
        }

        // Add this socket to presence
        presenceState[roomId].set(socket.id, {
          userId: socketUser.id,
          name: socketUser.name,
          avatarColor: socketUser.avatarColor,
          cursorX: null,
          cursorY: null,
          status: 'active',
        });

        const members = Array.from(presenceState[roomId].values());

        // Send current elements and existing room members to the joining client
        socket.emit('room:state', { elements, members });

        // Broadcast to others that a user joined
        socket.to(roomRoom).emit('user:joined', {
          user: {
            userId: socketUser.id,
            name: socketUser.name,
            avatarColor: socketUser.avatarColor,
            cursorX: null,
            cursorY: null,
            status: 'active',
          },
        });

        // Broadcast updated presence list
        io.to(roomRoom).emit('presence:update', { members });

      } catch (err) {
        console.error('Error in room:join:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // 3. Handle cursor move
    socket.on('cursor:move', ({ x, y }) => {
      if (!currentRoomId || !presenceState[currentRoomId]) return;

      const userPresence = presenceState[currentRoomId].get(socket.id);
      if (userPresence) {
        userPresence.cursorX = x;
        userPresence.cursorY = y;
        userPresence.status = 'active';

        // Emit fast cursor update to room collaborators (excluding self)
        socket.to(`room:${currentRoomId}`).emit('cursor:update', {
          userId: socketUser.id,
          x,
          y,
        });
      }
    });

    // 4. Handle element create
    socket.on('element:create', async ({ element }) => {
      if (!currentRoomId) return;

      // Broadcast to room collaborators immediately
      socket.to(`room:${currentRoomId}`).emit('element:created', { element });

      // Save to database immediately (creates are key events)
      try {
        await saveElementToDb(element);
      } catch (err) {
        console.error(`Failed to save new element ${element.id}:`, err);
        socket.emit('error', { message: 'Failed to persist element' });
      }
    });

    // 5. Handle element update
    socket.on('element:update', ({ element }) => {
      if (!currentRoomId) return;

      // Broadcast update to others immediately for seamless visual feedback
      socket.to(`room:${currentRoomId}`).emit('element:updated', { element });

      // Queue database update (debounced)
      queueDbUpdate(element);
    });

    // 6. Handle element delete
    socket.on('element:delete', async ({ elementId }) => {
      if (!currentRoomId) return;

      // Broadcast delete to room collaborators
      socket.to(`room:${currentRoomId}`).emit('element:deleted', { elementId });

      // Cancel any pending debounced updates for this element
      const pending = pendingDbUpdates.get(elementId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingDbUpdates.delete(elementId);
      }

      // Delete from DB immediately
      try {
        await prisma.whiteboardElement.delete({
          where: { id: elementId },
        }).catch((e: any) => {
          // If already deleted by someone else, ignore
        });
      } catch (err) {
        console.error(`Failed to delete element ${elementId}:`, err);
      }
    });

    // 7. Handle bulk elements sync
    socket.on('elements:bulk_sync', async ({ elements }) => {
      if (!currentRoomId) return;

      // Broadcast bulk sync to other users
      for (const element of elements) {
         socket.to(`room:${currentRoomId}`).emit('element:updated', { element });
         queueDbUpdate(element);
      }
    });

    // 8. Handle disconnect/leave
    const handleLeave = () => {
      if (!currentRoomId || !presenceState[currentRoomId]) return;

      // Remove from room presence mapping
      presenceState[currentRoomId].delete(socket.id);
      const members = Array.from(presenceState[currentRoomId].values());

      const roomRoom = `room:${currentRoomId}`;
      
      // Notify other collaborators
      socket.to(roomRoom).emit('user:left', {
        userId: socketUser.id,
        username: socketUser.name,
      });

      // Broadcast updated member roster
      socket.to(roomRoom).emit('presence:update', { members });

      // Clean up empty room state
      if (presenceState[currentRoomId].size === 0) {
        delete presenceState[currentRoomId];
      }

      currentRoomId = null;
    };

    socket.on('room:leave', handleLeave);
    socket.on('disconnect', handleLeave);
  });
};

// Helper to flush all pending db writes before shutting down
export const flushPendingUpdates = async () => {
  const promises: Promise<void>[] = [];
  for (const [id, value] of pendingDbUpdates.entries()) {
    clearTimeout(value.timeout);
    promises.push(saveElementToDb(value.element).catch((e) => {
      console.error(`Error flushing element ${id} on shutdown:`, e);
    }));
  }
  await Promise.all(promises);
  pendingDbUpdates.clear();
  console.log('All pending database updates flushed.');
};
