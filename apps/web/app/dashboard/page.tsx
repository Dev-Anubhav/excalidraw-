'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { 
  Plus, Search, MoreVertical, Copy, Trash, Edit2, LogOut, Loader2, Calendar, FileText, User as UserIcon
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  
  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  // 1. Fetch current profile
  const { data: me, isLoading: loadingMe, error: meError } = useQuery({
    queryKey: ['me'],
    queryFn: api.getMe,
    retry: false,
  });

  // Redirect to login if unauthenticated
  if (meError && typeof window !== 'undefined') {
    router.push('/login');
  }

  // 2. Fetch rooms
  const { data: rooms = [], isLoading: loadingRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: api.getRooms,
    enabled: !!me,
  });

  // 3. Mutate: Create Room
  const createMutation = useMutation({
    mutationFn: () => api.createRoom({ title: newTitle }),
    onSuccess: (newRoom) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setIsCreateOpen(false);
      setNewTitle('');
      router.push(`/room/${newRoom.id}`);
    },
  });

  // 4. Mutate: Delete Room
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setActiveMenuId(null);
    },
  });

  // 5. Mutate: Rename Room
  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.renameRoom(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setRenameId(null);
      setRenameTitle('');
      setActiveMenuId(null);
    },
  });

  // 6. Mutate: Duplicate Room
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.duplicateRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setActiveMenuId(null);
    },
  });

  // 7. Mutate: Logout
  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      router.push('/login');
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate();
  };

  const handleRenameSubmit = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!renameTitle.trim()) return;
    renameMutation.mutate({ id, title: renameTitle });
  };

  const filteredRooms = rooms.filter((room) =>
    room.title.toLowerCase().includes(search.toLowerCase())
  );

  if (loadingMe) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!me) {
     return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-900/20 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              A
            </div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              SketchSync
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: me.avatarColor }}
              >
                {me.name[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium text-zinc-300 mr-1">{me.name}</span>
            </div>

            <button
              onClick={() => logoutMutation.mutate()}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-800"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto w-full px-6 py-10 flex-1 flex flex-col">
        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Your Whiteboards</h1>
            <p className="text-sm text-zinc-400">Create, collaborate, and manage your drawing sessions</p>
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
          >
            <Plus className="w-4 h-4" />
            Create Whiteboard
          </button>
        </div>

        {/* Filter / Search */}
        <div className="relative mb-8 w-full max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search whiteboards..."
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-zinc-900/50 border border-zinc-800 focus:border-blue-500 focus:outline-none text-zinc-200 placeholder-zinc-500 text-sm transition-all"
          />
        </div>

        {/* Rooms Grid */}
        {loadingRooms ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 flex-1">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-44 rounded-2xl bg-zinc-900/30 border border-zinc-900 animate-pulse" />
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-3xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-4 shadow-sm">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">No whiteboards found</h3>
            <p className="text-zinc-500 text-sm max-w-sm mb-6">
              {search ? 'Adjust your search filters to find what you are looking for' : 'Create your first room to start drawing vector graphics collaboratively'}
            </p>
            {!search && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700/50 font-semibold text-sm transition-all"
              >
                Create Board
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                className="group relative bg-zinc-900/30 border border-zinc-900 hover:border-zinc-800/80 hover:bg-zinc-900/50 rounded-2xl p-6 shadow-sm transition-all flex flex-col justify-between h-48"
              >
                <div>
                  <div className="flex justify-between items-start">
                    {renameId === room.id ? (
                      <form
                        onSubmit={(e) => handleRenameSubmit(e, room.id)}
                        className="w-full mr-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={renameTitle}
                          onChange={(e) => setRenameTitle(e.target.value)}
                          className="w-full bg-zinc-950 border border-blue-500 focus:outline-none rounded px-2 py-1 text-sm text-white font-semibold"
                          autoFocus
                          onBlur={(e) => handleRenameSubmit(e, room.id)}
                        />
                      </form>
                    ) : (
                      <Link href={`/room/${room.id}`} className="block flex-1 group-hover:text-blue-400 transition-colors">
                        <h3 className="font-bold text-white truncate text-base leading-tight pr-6">
                          {room.title}
                        </h3>
                      </Link>
                    )}

                    <div className="absolute right-4 top-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === room.id ? null : room.id);
                        }}
                        className="p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-800 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Dropdown Options */}
                      {activeMenuId === room.id && (
                        <div className="absolute right-0 mt-1 w-40 rounded-xl bg-zinc-950 border border-zinc-800 shadow-xl py-1 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameId(room.id);
                              setRenameTitle(room.title);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900 flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Rename
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateMutation.mutate(room.id);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900 flex items-center gap-2"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Duplicate
                          </button>
                          <div className="border-t border-zinc-900 my-1" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Are you sure you want to delete this room? This is permanent.')) {
                                deleteMutation.mutate(room.id);
                              }
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-950/20 hover:text-red-300 flex items-center gap-2"
                          >
                            <Trash className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-zinc-500 text-xs mt-1">
                    {room._count.elements} drawing elements
                  </p>
                </div>

                {/* Footer specs */}
                <div className="border-t border-zinc-900/60 pt-4 flex justify-between items-center text-xs text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Edited {new Date(room.updatedAt).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5" title={`Owner: ${room.owner.name}`}>
                    <UserIcon className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="truncate max-w-[80px]">{room.owner.name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Create Whiteboard</h3>
            <p className="text-xs text-zinc-400 mb-4">Provide a workspace title to initialize collaboration</p>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Marketing Wireframe"
                className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-blue-500 focus:outline-none text-white text-sm"
                disabled={createMutation.isPending}
                autoFocus
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setNewTitle('');
                  }}
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white text-sm font-medium"
                  disabled={createMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                  disabled={createMutation.isPending || !newTitle.trim()}
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
