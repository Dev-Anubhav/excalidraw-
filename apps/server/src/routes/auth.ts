import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeychangeinproduction';

// Avatar colors presets
const AVATAR_COLORS = [
  '#FF5733', // Coral
  '#33FF57', // Lime
  '#3357FF', // Blue
  '#F3FF33', // Yellow
  '#FF33F3', // Pink
  '#33FFF0', // Cyan
  '#FFA500', // Orange
  '#8A2BE2', // BlueViolet
  '#00FA9A', // MediumSpringGreen
  '#FF1493', // DeepPink
];

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// SIGNUP
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = signupSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = await bcrypt.hash(validated.password, 10);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        passwordHash,
        avatarColor,
      },
    });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
       res.status(400).json({ error: error.errors[0].message });
       return;
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LOGIN
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (!user || !(await bcrypt.compare(validated.password, user.passwordHash))) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LOGOUT
router.post('/logout', (req: Request, res: Response): void => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

// ME
router.get('/me', authenticateJWT as any, (req: AuthenticatedRequest, res: Response): void => {
  res.status(200).json(req.user);
});

export default router;
