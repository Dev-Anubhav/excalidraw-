'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCanvasStore } from '@/stores/canvasStore';
import { useCollabStore } from '@/stores/collabStore';
import { useCanvas } from '@/hooks/useCanvas';
import { drawElement } from '@/canvas-engine/renderer';
import { 
  MousePointer, Hand, Pencil, Square, Circle, Minus, ArrowRight, Type, Eraser,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Share2, Download, Upload, Check, Copy, ArrowLeft, Loader2
} from 'lucide-react';
import { ElementType } from '@whiteboard/types';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Local UI states
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [textInputState, setTextInputState] = useState<{
    show: boolean;
    x: number;
    y: number;
    text: string;
    elementId?: string; // If editing existing
  }>({
    show: false,
    x: 0,
    y: 0,
    text: '',
  });

  const canvasState = useCanvasStore();
  const collabState = useCollabStore();

  // 1. Fetch profile
  const { data: me, isLoading: loadingMe } = useQuery({
    queryKey: ['me'],
    queryFn: api.getMe,
    retry: false,
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loadingMe && !me) {
      router.push('/login');
    }
  }, [me, loadingMe]);

  // 2. Fetch room details
  const { data: room, isLoading: loadingRoom, error: roomError } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api.getRoom(roomId),
    enabled: !!me,
  });

  // 3. Initialize WebSocket collaboration when profiles load
  useEffect(() => {
    if (me && roomId) {
      collabState.initSocket(roomId, me.name);
    }
    return () => {
      collabState.closeSocket();
      canvasState.clearHistory();
    };
  }, [roomId, me]);

  // Initialize Canvas custom controller hook
  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    draw,
  } = useCanvas(canvasRef, textInputRef, setTextInputState);

  // Auto-focus text editor textarea
  useEffect(() => {
    if (textInputState.show && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInputState.show]);

  // Handle text submissions (on blur or enter)
  const handleTextSubmit = () => {
    if (!textInputState.show || !me) return;

    const trimmed = textInputState.text.trim();
    if (!trimmed) {
      // If empty and we were editing an existing element, delete it
      if (textInputState.elementId) {
        canvasState.deleteElement(textInputState.elementId);
        collabState.sendElementDelete(textInputState.elementId);
      }
      setTextInputState({ show: false, x: 0, y: 0, text: '' });
      return;
    }

    // Determine coordinate inside world space
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Map click coords (screen offset) back to world coordinates
    const scrollX = textInputState.x;
    const scrollY = textInputState.y;
    
    const worldPoint = {
      x: (scrollX - canvasState.pan.x) / canvasState.zoom,
      y: (scrollY - canvasState.pan.y) / canvasState.zoom,
    };

    // Calculate approximate text bounding box sizes (1.2 line spacing)
    const fontSize = canvasState.fontSize;
    const lines = trimmed.split('\n');
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const estWidth = longestLine * (fontSize * 0.55); // rough estimate
    const estHeight = lines.length * (fontSize * 1.25);

    const maxZ = canvasState.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);

    const newElement = {
      id: textInputState.elementId || Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36),
      roomId,
      type: 'text' as const,
      x: worldPoint.x,
      y: worldPoint.y,
      width: estWidth,
      height: fontSize, // Store base fontSize in height
      text: trimmed,
      strokeColor: canvasState.strokeColor,
      fillColor: 'transparent',
      strokeWidth: 1,
      opacity: canvasState.opacity,
      rotation: 0,
      zIndex: maxZ + 1,
      createdBy: me.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (textInputState.elementId) {
      canvasState.updateElement(newElement, true);
      collabState.sendElementUpdate(newElement);
    } else {
      canvasState.addElement(newElement, true);
      collabState.sendElementCreate(newElement);
    }

    setTextInputState({ show: false, x: 0, y: 0, text: '' });
  };

  // Copy Room Invite Link
  const copyInviteLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  // Export PNG logic
  const exportPNG = () => {
    const { elements } = canvasState;
    if (elements.length === 0) {
      alert('No elements to export');
      return;
    }

    // Find bounds of all elements
    let minX = elements[0].x;
    let maxX = elements[0].x + elements[0].width;
    let minY = elements[0].y;
    let maxY = elements[0].y + elements[0].height;

    elements.forEach((el) => {
      // For lines/arrows/freehand, width/height can be negative, so map min/max bounds accurately
      const boundsX1 = Math.min(el.x, el.x + el.width);
      const boundsX2 = Math.max(el.x, el.x + el.width);
      const boundsY1 = Math.min(el.y, el.y + el.height);
      const boundsY2 = Math.max(el.y, el.y + el.height);

      if (boundsX1 < minX) minX = boundsX1;
      if (boundsX2 > maxX) maxX = boundsX2;
      if (boundsY1 < minY) minY = boundsY1;
      if (boundsY2 > maxY) maxY = boundsY2;
    });

    const padding = 30;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const w = maxX - minX;
    const h = maxY - minY;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) return;

    // Draw dark background matching web design
    exportCtx.fillStyle = '#121214';
    exportCtx.fillRect(0, 0, w, h);

    // Apply translations
    exportCtx.save();
    exportCtx.translate(-minX, -minY);

    // Render sorted elements
    const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
    sorted.forEach((el) => {
      drawElement(exportCtx, el);
    });

    exportCtx.restore();

    // Trigger download
    const link = document.createElement('a');
    link.download = `${room?.title || 'whiteboard'}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  // Export JSON logic
  const exportJSON = () => {
    const json = JSON.stringify(canvasState.elements, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `${room?.title || 'whiteboard'}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  // Import JSON logic
  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !me) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as any[];
        if (!Array.isArray(parsed)) throw new Error('Not an array');

        const baseZ = canvasState.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
        
        const importedElements = parsed.map((el, idx) => {
          // Generate new element IDs to avoid collisions, map current roomId
          return {
            ...el,
            id: Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36) + '-' + idx,
            roomId,
            zIndex: baseZ + 1 + idx,
            createdBy: me.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });

        // Add to state and notify collaborators
        importedElements.forEach((el) => {
          canvasState.addElement(el);
          collabState.sendElementCreate(el);
        });

      } catch (err) {
        alert('Invalid JSON whiteboard format');
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  if (loadingMe || loadingRoom) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="text-zinc-400 text-sm">Synchronizing Canvas Session...</span>
      </div>
    );
  }

  if (roomError || !room) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-center p-4">
        <h3 className="text-xl font-bold text-white">Workspace not found</h3>
        <p className="text-zinc-500 text-sm max-w-xs">The room link is invalid or you do not have permission to collaborate here</p>
        <Link href="/dashboard" className="px-4 py-2 bg-blue-600 rounded-lg text-sm text-white hover:bg-blue-500 font-semibold">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const activeElement = canvasState.selectedIds.length === 1 
    ? canvasState.elements.find((el) => el.id === canvasState.selectedIds[0])
    : null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#121214] relative flex flex-col select-none">
      
      {/* Top Workspace Header */}
      <header className="absolute top-4 left-4 right-4 z-20 flex justify-between items-center pointer-events-none">
        <div className="flex items-center gap-3 bg-zinc-900/90 border border-zinc-800 rounded-2xl px-4 py-2 shadow-xl backdrop-blur-md pointer-events-auto">
          <Link
            href="/dashboard"
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            title="Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="h-4 w-[1px] bg-zinc-800" />
          <span className="font-bold text-white text-sm max-w-[140px] truncate">{room.title}</span>
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full">
            Live
          </span>
        </div>

        {/* History actions & Avatars bar */}
        <div className="flex items-center gap-3 pointer-events-auto">
          
          {/* Active Collaborators Avatars */}
          <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl px-3 py-1.5 shadow-xl backdrop-blur-md">
            <span className="text-xs text-zinc-500 font-semibold mr-1.5 uppercase tracking-wide">
              Active ({collabState.members.length})
            </span>
            <div className="flex -space-x-1.5 overflow-hidden">
              {collabState.members.slice(0, 4).map((member, idx) => (
                <div
                  key={idx}
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-xs ring-2 ring-zinc-900"
                  style={{ backgroundColor: member.avatarColor }}
                  title={`${member.name} (${member.status})`}
                >
                  {member.name[0].toUpperCase()}
                </div>
              ))}
              {collabState.members.length > 4 && (
                <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-300 text-xs ring-2 ring-zinc-900">
                  +{collabState.members.length - 4}
                </div>
              )}
            </div>
          </div>

          {/* Local User Undo/Redo stack buttons */}
          <div className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-1 shadow-xl backdrop-blur-md">
            <button
              onClick={() => {
                const socketEmit = (type: string, payload: any) => {
                  if (type === 'element:create') collabState.sendElementCreate(payload.element);
                  if (type === 'element:update') collabState.sendElementUpdate(payload.element);
                  if (type === 'element:delete') collabState.sendElementDelete(payload.elementId);
                };
                canvasState.undo(socketEmit);
              }}
              disabled={canvasState.undoStack.length === 0}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const socketEmit = (type: string, payload: any) => {
                  if (type === 'element:create') collabState.sendElementCreate(payload.element);
                  if (type === 'element:update') collabState.sendElementUpdate(payload.element);
                  if (type === 'element:delete') collabState.sendElementDelete(payload.elementId);
                };
                canvasState.redo(socketEmit);
              }}
              disabled={canvasState.redoStack.length === 0}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Export and Invite */}
          <div className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-1 shadow-xl backdrop-blur-md">
            <button
              onClick={copyInviteLink}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1.5 text-xs font-semibold px-3"
            >
              {copiedInvite ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
              {copiedInvite ? 'Copied' : 'Invite'}
            </button>
            
            <div className="w-[1px] h-4 bg-zinc-800" />

            <div className="relative group/export">
              <button className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1 text-xs font-semibold">
                <Download className="w-4 h-4" />
                Export
              </button>
              
              <div className="absolute right-0 mt-1.5 w-32 rounded-xl bg-zinc-950 border border-zinc-800 shadow-xl py-1 hidden group-hover/export:block">
                <button
                  onClick={exportPNG}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
                >
                  Export PNG
                </button>
                <button
                  onClick={exportJSON}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900"
                >
                  Export JSON
                </button>
              </div>
            </div>

            <label className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer">
              <Upload className="w-4 h-4" />
              Import
              <input
                type="file"
                accept=".json"
                onChange={importJSON}
                className="hidden"
              />
            </label>
          </div>

        </div>
      </header>

      {/* Left Tool rail */}
      <nav className="absolute left-6 top-1/2 -translate-y-1/2 z-20 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md flex flex-col gap-1.5">
        {[
          { type: 'select', icon: MousePointer, name: 'Select (V)' },
          { type: 'hand', icon: Hand, name: 'Hand/Pan (H)' },
          { type: 'pencil', icon: Pencil, name: 'Pencil (P)' },
          { type: 'rectangle', icon: Square, name: 'Rectangle (R)' },
          { type: 'ellipse', icon: Circle, name: 'Ellipse (O)' },
          { type: 'line', icon: Minus, name: 'Line (L)' },
          { type: 'arrow', icon: ArrowRight, name: 'Arrow (A)' },
          { type: 'text', icon: Type, name: 'Text (T)' },
          { type: 'eraser', icon: Eraser, name: 'Eraser (E)' },
        ].map((tool) => {
          const Icon = tool.icon;
          const isActive = canvasState.activeTool === tool.type;
          return (
            <button
              key={tool.type}
              onClick={() => canvasState.setActiveTool(tool.type as any)}
              className={`p-3 rounded-xl transition-all shadow-sm relative group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-blue-500/25 scale-[1.03]'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
              }`}
              title={tool.name}
            >
              <Icon className="w-5 h-5" />
              {/* Custom tooltip */}
              <div className="absolute left-full ml-3 px-2.5 py-1 rounded bg-zinc-950 text-[10px] font-semibold text-zinc-300 border border-zinc-800 shadow-xl hidden group-hover:block whitespace-nowrap top-1/2 -translate-y-1/2 pointer-events-none">
                {tool.name}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Floating Canvas Viewport */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="w-full h-full cursor-default active:cursor-default"
      />

      {/* DOM overlay for Text Inline typing editor */}
      {textInputState.show && (
        <textarea
          ref={textInputRef}
          value={textInputState.text}
          onChange={(e) => setTextInputState((prev) => ({ ...prev, text: e.target.value }))}
          onBlur={handleTextSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleTextSubmit();
            }
          }}
          className="border border-blue-500 bg-transparent resize-both outline-none leading-relaxed"
          style={{
            position: 'absolute',
            left: textInputState.x,
            top: textInputState.y,
            font: `${Math.max(14, canvasState.fontSize * canvasState.zoom)}px sans-serif`,
            color: canvasState.strokeColor,
            minWidth: '150px',
            minHeight: '24px',
            zIndex: 40,
          }}
        />
      )}

      {/* Right Styling Contextual properties panel */}
      {(canvasState.activeTool !== 'select' || canvasState.selectedIds.length > 0) && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 z-20 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-2xl backdrop-blur-md w-64 space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Properties {activeElement ? `(${activeElement.type})` : ''}
          </h3>

          {/* Stroke colors */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 block">Stroke Color</span>
            <div className="grid grid-cols-5 gap-2">
              {[
                '#3B82F6', // Blue
                '#EF4444', // Red
                '#10B981', // Green
                '#F59E0B', // Amber
                '#8B5CF6', // Purple
                '#EC4899', // Pink
                '#14B8A6', // Teal
                '#F3F4F6', // Off-White
                '#9CA3AF', // Gray
                '#111827', // Black
              ].map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    canvasState.setStrokeColor(color);
                    if (activeElement) {
                      const updated = { ...activeElement, strokeColor: color };
                      canvasState.updateElement(updated, true);
                      collabState.sendElementUpdate(updated);
                    }
                  }}
                  className={`w-7 h-7 rounded-lg border-2 shadow-sm transition-all ${
                    canvasState.strokeColor === color 
                      ? 'border-blue-500 scale-[1.08]' 
                      : 'border-zinc-800 hover:scale-[1.04]'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Fill colors (skip for lines, arrows, pencil, text) */}
          {(!activeElement || (activeElement.type !== 'line' && activeElement.type !== 'arrow' && activeElement.type !== 'pencil' && activeElement.type !== 'text')) && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-zinc-400 block">Fill Style</span>
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={() => {
                    canvasState.setFillColor('transparent');
                    if (activeElement) {
                      const updated = { ...activeElement, fillColor: 'transparent' };
                      canvasState.updateElement(updated, true);
                      collabState.sendElementUpdate(updated);
                    }
                  }}
                  className={`w-7 h-7 rounded-lg border-2 text-[10px] font-bold flex items-center justify-center ${
                    canvasState.fillColor === 'transparent'
                      ? 'border-blue-500 bg-zinc-950 text-blue-500 scale-[1.08]'
                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:scale-[1.04]'
                  }`}
                >
                  None
                </button>
                {[
                  '#3B82F6',
                  '#EF4444',
                  '#10B981',
                  '#F59E0B',
                  '#8B5CF6',
                  '#EC4899',
                  '#14B8A6',
                  '#F3F4F6',
                  '#27272A',
                ].map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      canvasState.setFillColor(color);
                      if (activeElement) {
                        const updated = { ...activeElement, fillColor: color };
                        canvasState.updateElement(updated, true);
                        collabState.sendElementUpdate(updated);
                      }
                    }}
                    className={`w-7 h-7 rounded-lg border-2 shadow-sm transition-all ${
                      canvasState.fillColor === color 
                        ? 'border-blue-500 scale-[1.08]' 
                        : 'border-zinc-800 hover:scale-[1.04]'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Stroke Thickness */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-zinc-400 block">Stroke Width</span>
            <div className="flex gap-2">
              {[
                { label: 'Thin', val: 2 },
                { label: 'Med', val: 4 },
                { label: 'Thick', val: 6 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => {
                    canvasState.setStrokeWidth(opt.val);
                    if (activeElement) {
                      const updated = { ...activeElement, strokeWidth: opt.val };
                      canvasState.updateElement(updated, true);
                      collabState.sendElementUpdate(updated);
                    }
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border border-zinc-800 transition-colors ${
                    canvasState.strokeWidth === opt.val
                      ? 'bg-blue-600/15 border-blue-500/30 text-blue-400'
                      : 'bg-zinc-950/40 text-zinc-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size (only for Text) */}
          {(canvasState.activeTool === 'text' || (activeElement && activeElement.type === 'text')) && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-zinc-400 block">Font Size</span>
              <div className="flex gap-2">
                {[
                  { label: 'Small', val: 16 },
                  { label: 'Medium', val: 24 },
                  { label: 'Large', val: 36 },
                  { label: 'XL', val: 48 },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    onClick={() => {
                      canvasState.setFontSize(opt.val);
                      if (activeElement) {
                        const updated = { ...activeElement, height: opt.val }; // text height is base size
                        canvasState.updateElement(updated, true);
                        collabState.sendElementUpdate(updated);
                      }
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border border-zinc-800 transition-colors ${
                      canvasState.fontSize === opt.val
                        ? 'bg-blue-600/15 border-blue-500/30 text-blue-400'
                        : 'bg-zinc-950/40 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Opacity slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-zinc-400">Opacity</span>
              <span className="text-xs text-zinc-500 font-semibold">{Math.round(canvasState.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={canvasState.opacity}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                canvasState.setOpacity(val);
                if (activeElement) {
                  const updated = { ...activeElement, opacity: val };
                  canvasState.updateElement(updated, true);
                  collabState.sendElementUpdate(updated);
                }
              }}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {/* Layer Ordering (only when selected) */}
          {canvasState.selectedIds.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-800/60">
              <span className="text-xs font-medium text-zinc-400 block">Actions</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                     canvasState.bringToFront();
                     // sync ordering over sockets
                     const updated = canvasState.elements.filter(el => canvasState.selectedIds.includes(el.id));
                     collabState.sendElementsBulkSync(updated);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-zinc-950/40 border border-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                >
                  Bring to Front
                </button>
                <button
                  onClick={() => {
                     canvasState.sendToBack();
                     // sync ordering
                     const updated = canvasState.elements.filter(el => canvasState.selectedIds.includes(el.id));
                     collabState.sendElementsBulkSync(updated);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-zinc-950/40 border border-zinc-800 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                >
                  Send to Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Zoom viewport bar */}
      <footer className="absolute bottom-6 left-6 z-20 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-1 shadow-2xl backdrop-blur-md flex items-center gap-1">
        <button
          onClick={() => canvasState.setZoom((z) => Math.max(0.15, z / 1.15))}
          className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-[10px] font-bold text-zinc-400 w-12 text-center uppercase tracking-wide">
          {Math.round(canvasState.zoom * 100)}%
        </span>
        <button
          onClick={() => canvasState.setZoom((z) => Math.min(4, z * 1.15))}
          className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-[1px] h-4 bg-zinc-800" />
        <button
          onClick={() => {
            canvasState.setZoom(1.0);
            canvasState.setPan({ x: 0, y: 0 });
          }}
          className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          title="Reset View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}
