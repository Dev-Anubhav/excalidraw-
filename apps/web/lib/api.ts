import { User, Room, WhiteboardElement } from '@whiteboard/types';

const API_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5001') + '/api';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Crucial for HTTP-only JWT cookies
  });

  if (!response.ok) {
    let errorMsg = 'An error occurred';
    try {
      const data = await response.json();
      errorMsg = data.error || errorMsg;
    } catch (e) {
      // Ignore if body is not JSON
    }
    throw new ApiError(errorMsg, response.status);
  }

  // Handle empty replies (like DELETE)
  if (response.status === 204) return {} as T;
  
  return response.json();
}

export const api = {
  // AUTH
  signup: (body: any) => request<User>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: any) => request<User>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  getMe: () => request<User | null>('/auth/me', { method: 'GET' }),

  // ROOMS
  getRooms: () => request<(Room & { owner: { name: string; avatarColor: string }; _count: { elements: number } })[]>('/rooms', { method: 'GET' }),
  getRoom: (id: string) => request<Room & { owner: { name: string; avatarColor: string } }>([`/rooms/`, id].join(''), { method: 'GET' }),
  getRoomElements: (id: string) => request<WhiteboardElement[]>([`/rooms/`, id, `/elements`].join(''), { method: 'GET' }),
  createRoom: (body: { title: string }) => request<Room>('/rooms', { method: 'POST', body: JSON.stringify(body) }),
  renameRoom: (id: string, title: string) => request<Room>([`/rooms/`, id].join(''), { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteRoom: (id: string) => request<{ message: string }>([`/rooms/`, id].join(''), { method: 'DELETE' }),
  duplicateRoom: (id: string) => request<Room>([`/rooms/`, id, `/duplicate`].join(''), { method: 'POST' }),
};
