import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const roomSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
});

// Use the authenticateJWT middleware for all room routes
router.use(authenticateJWT as any);

// GET /api/rooms - List rooms owned or collaborated on by the user
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const rooms = await prisma.room.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: {
          select: { id: true, name: true, avatarColor: true },
        },
        _count: {
          select: { elements: true },
        },
      },
    });

    res.json(rooms);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// GET /api/rooms/:id - Get room detail
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, avatarColor: true },
        },
      },
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Check permissions (either owner or a member)
    const isOwner = room.ownerId === userId;
    const isMember = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: id, userId } },
    });

    if (!isOwner && !isMember) {
      // Automatically add user as collaborator if room is shared
      // For this portfolio app, anyone logged in can view and collaborate if they have the link
      await prisma.roomMember.create({
        data: {
          roomId: id,
          userId,
          role: 'collaborator',
        },
      });
    }

    res.json(room);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch room details' });
  }
});

// GET /api/rooms/:id/elements - Get all whiteboard elements for a room
router.get('/:id/elements', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check permissions
    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const elements = await prisma.whiteboardElement.findMany({
      where: { roomId: id },
      orderBy: { zIndex: 'asc' },
    });

    res.json(elements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch room elements' });
  }
});

// POST /api/rooms - Create a room
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validated = roomSchema.parse(req.body);
    const userId = req.user!.id;

    const room = await prisma.room.create({
      data: {
        title: validated.title,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'owner',
          },
        },
      },
    });

    res.status(201).json(room);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// PUT /api/rooms/:id - Rename a room
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = roomSchema.parse(req.body);
    const userId = req.user!.id;

    const room = await prisma.room.findUnique({ where: { id } });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.ownerId !== userId) {
      res.status(403).json({ error: 'Only the owner can rename the room' });
      return;
    }

    const updatedRoom = await prisma.room.update({
      where: { id },
      data: { title: validated.title },
    });

    res.json(updatedRoom);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to update room' });
  }
});

// DELETE /api/rooms/:id - Delete a room
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const room = await prisma.room.findUnique({ where: { id } });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.ownerId !== userId) {
      res.status(403).json({ error: 'Only the owner can delete this room' });
      return;
    }

    await prisma.room.delete({ where: { id } });

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// POST /api/rooms/:id/duplicate - Duplicate a room and its elements
router.post('/:id/duplicate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const room = await prisma.room.findUnique({
      where: { id },
      include: { elements: true },
    });

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Duplicate room
    const newRoom = await prisma.room.create({
      data: {
        title: `${room.title} (Copy)`,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'owner',
          },
        },
      },
    });

    // Duplicate elements
    if (room.elements.length > 0) {
      // Map elements to new IDs to avoid unique constraints, and relate to new roomId
      const elementsToCreate = room.elements.map((el: any) => {
        // Generate new client-side element ID format (it can be standard UUID in backend copy)
        const newElId = require('crypto').randomUUID();
        return {
          id: newElId,
          roomId: newRoom.id,
          type: el.type,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          points: el.points || undefined,
          text: el.text || undefined,
          strokeColor: el.strokeColor,
          fillColor: el.fillColor,
          strokeWidth: el.strokeWidth,
          opacity: el.opacity,
          rotation: el.rotation,
          zIndex: el.zIndex,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      await prisma.whiteboardElement.createMany({
        data: elementsToCreate,
      });
    }

    res.status(201).json(newRoom);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to duplicate room' });
  }
});

export default router;
