import { useRef, useEffect, MouseEvent as ReactMouseEvent } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useCollabStore } from '../stores/collabStore';
import { screenToWorld, isPointOnElement, isElementInSelection, getHandleAtPosition, ResizeHandle, getPointsBounds } from '../canvas-engine/math';
import { drawGrid, drawElement, drawSelectionOutline, drawDragSelectionBox, drawCollaboratorCursor } from '../canvas-engine/renderer';
import { WhiteboardElement, Point } from '@whiteboard/types';

// Client-side UUID generator fallback
const generateId = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
};

// Simple throttle helper
const useThrottle = (callback: (...args: any[]) => void, delay: number) => {
  const lastCall = useRef(0);
  return (...args: any[]) => {
    const now = Date.now();
    if (now - lastCall.current >= delay) {
      lastCall.current = now;
      callback(...args);
    }
  };
};

export const useCanvas = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  textInputRef: React.RefObject<HTMLTextAreaElement | null>,
  setTextInputState: (state: { show: boolean; x: number; y: number; text: string; elementId?: string }) => void
) => {
  // Store canvas interaction state in refs to keep render functions fast and avoid React overhead
  const stateRef = useRef<{
    isDrawing: boolean;
    isPanning: boolean;
    isDragging: boolean;
    isResizing: boolean;
    resizeHandle: ResizeHandle | null;
    startScreenPos: Point;
    startWorldPos: Point;
    dragStartElements: WhiteboardElement[]; // Copy of elements before drag/resize
    activeElementId: string | null;
    selectionBox: { x: number; y: number; width: number; height: number } | null;
  }>({
    isDrawing: false,
    isPanning: false,
    isDragging: false,
    isResizing: false,
    resizeHandle: null,
    startScreenPos: { x: 0, y: 0 },
    startWorldPos: { x: 0, y: 0 },
    dragStartElements: [],
    activeElementId: null,
    selectionBox: null,
  });

  const canvasState = useCanvasStore();
  const collabState = useCollabStore();

  // Throttled cursor broadcast to keep socket traffic lean
  const broadcastCursor = useThrottle((x: number | null, y: number | null) => {
    collabState.sendCursorMove(x, y);
  }, 40);

  // Redraw loop scheduled on canvasState updates
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and match high DPI pixel ratios
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
       canvas.width = width;
       canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    // 1. Draw grid background (requires screen space parameters)
    drawGrid(ctx, width, height, canvasState.pan, canvasState.zoom);

    // 2. Apply viewport pan and zoom
    ctx.save();
    ctx.translate(canvasState.pan.x, canvasState.pan.y);
    ctx.scale(canvasState.zoom, canvasState.zoom);

    // 3. Draw whiteboard elements sorted by zIndex
    const sortedElements = [...canvasState.elements].sort((a, b) => a.zIndex - b.zIndex);
    sortedElements.forEach((element) => {
      drawElement(ctx, element);
    });

    // 4. Draw selection outlines around selected elements
    canvasState.elements.forEach((element) => {
      if (canvasState.selectedIds.includes(element.id)) {
        // Don't draw selection outline on active text input (rendered in DOM)
        const isEditingText = textInputRef.current && element.type === 'text' && canvasState.selectedIds[0] === element.id;
        if (!isEditingText) {
          drawSelectionOutline(ctx, element, canvasState.zoom);
        }
      }
    });

    // 5. Draw active drag selection frame
    if (stateRef.current.selectionBox) {
      drawDragSelectionBox(ctx, stateRef.current.selectionBox);
    }

    // 6. Draw remote cursors
    collabState.members.forEach((member) => {
      // Don't draw our own cursor
      if (collabState.socket && member.userId !== collabState.socket.id) {
         drawCollaboratorCursor(ctx, member, canvasState.zoom);
      }
    });

    ctx.restore();
  };

  // Trigger repaint on state changes
  useEffect(() => {
    requestAnimationFrame(draw);
  }, [canvasState.elements, canvasState.selectedIds, canvasState.zoom, canvasState.pan, collabState.members]);

  // Window resize observer
  useEffect(() => {
    const handleResize = () => requestAnimationFrame(draw);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const worldPoint = screenToWorld(clientX, clientY, canvasState.pan, canvasState.zoom);

    stateRef.current.startScreenPos = { x: clientX, y: clientY };
    stateRef.current.startWorldPos = worldPoint;

    // Check hand tool/middle click panning
    if (canvasState.activeTool === 'hand' || e.button === 1 || e.shiftKey) {
      stateRef.current.isPanning = true;
      canvas.style.cursor = 'grabbing';
      return;
    }

    // 1. Check resize handle click (on selected element)
    if (canvasState.selectedIds.length === 1) {
      const selectedEl = canvasState.elements.find((el) => el.id === canvasState.selectedIds[0]);
      if (selectedEl && selectedEl.type !== 'pencil' && selectedEl.type !== 'text') {
        const handle = getHandleAtPosition(worldPoint, selectedEl, canvasState.zoom);
        if (handle) {
          stateRef.current.isResizing = true;
          stateRef.current.resizeHandle = handle;
          stateRef.current.activeElementId = selectedEl.id;
          stateRef.current.dragStartElements = [JSON.parse(JSON.stringify(selectedEl))];
          return;
        }
      }
    }

    // 2. Check hit-test on elements (traverse backward for top items)
    let clickedEl: WhiteboardElement | null = null;
    const sorted = [...canvasState.elements].sort((a, b) => b.zIndex - a.zIndex);
    for (const el of sorted) {
      if (isPointOnElement(worldPoint, el)) {
        clickedEl = el;
        break;
      }
    }

    if (canvasState.activeTool === 'select') {
      if (clickedEl) {
        // Dragging elements
        stateRef.current.isDragging = true;
        canvas.style.cursor = 'move';
        
        let newSelection = [...canvasState.selectedIds];
        if (e.metaKey || e.ctrlKey) {
          // Toggle selection
          if (newSelection.includes(clickedEl.id)) {
            newSelection = newSelection.filter((id) => id !== clickedEl.id);
          } else {
            newSelection.push(clickedEl.id);
          }
        } else {
          // Normal selection
          if (!newSelection.includes(clickedEl.id)) {
            newSelection = [clickedEl.id];
          }
        }
        canvasState.setSelectedIds(newSelection);
        
        // Stash original positions
        stateRef.current.dragStartElements = canvasState.elements
          .filter((el) => newSelection.includes(el.id))
          .map((el) => JSON.parse(JSON.stringify(el)));
      } else {
        // Drag selection box
        canvasState.setSelectedIds([]);
        stateRef.current.selectionBox = { x: worldPoint.x, y: worldPoint.y, width: 0, height: 0 };
      }
    } else if (canvasState.activeTool === 'eraser') {
      if (clickedEl) {
        canvasState.deleteElement(clickedEl.id, true);
        collabState.sendElementDelete(clickedEl.id);
      }
    } else if (canvasState.activeTool === 'text') {
      // Create text inline edit field
      const fontSize = canvasState.fontSize;
      setTextInputState({
        show: true,
        x: clientX,
        y: clientY,
        text: '',
      });
    } else {
      // Drawing a new shape
      stateRef.current.isDrawing = true;
      const elId = generateId();
      stateRef.current.activeElementId = elId;

      // Find max z-index
      const maxZ = canvasState.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);

      const newElement: WhiteboardElement = {
        id: elId,
        roomId: '', // Set by room logic
        type: canvasState.activeTool,
        x: worldPoint.x,
        y: worldPoint.y,
        width: 0,
        height: 0,
        strokeColor: canvasState.strokeColor,
        fillColor: canvasState.fillColor,
        strokeWidth: canvasState.strokeWidth,
        opacity: canvasState.opacity,
        rotation: 0,
        zIndex: maxZ + 1,
        createdBy: '', // Filled in by caller
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (canvasState.activeTool === 'pencil') {
        newElement.points = [[worldPoint.x, worldPoint.y]];
      }

      // Add to local state (optimistic) and broadcast
      canvasState.addElement(newElement);
      collabState.sendElementCreate(newElement);
    }
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const worldPoint = screenToWorld(clientX, clientY, canvasState.pan, canvasState.zoom);

    // Broadcast cursor position (throttled)
    broadcastCursor(worldPoint.x, worldPoint.y);

    if (stateRef.current.isPanning) {
      const dx = clientX - stateRef.current.startScreenPos.x;
      const dy = clientY - stateRef.current.startScreenPos.y;
      canvasState.setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      stateRef.current.startScreenPos = { x: clientX, y: clientY };
      return;
    }

    if (stateRef.current.isDragging && stateRef.current.dragStartElements.length > 0) {
      const dx = worldPoint.x - stateRef.current.startWorldPos.x;
      const dy = worldPoint.y - stateRef.current.startWorldPos.y;

      stateRef.current.dragStartElements.forEach((startEl) => {
        const updated = {
          ...startEl,
          x: startEl.x + dx,
          y: startEl.y + dy,
          points: startEl.points?.map((p) => [p[0] + dx, p[1] + dy] as [number, number]),
          updatedAt: new Date().toISOString(),
        };
        canvasState.updateElement(updated);
        collabState.sendElementUpdate(updated);
      });
      return;
    }

    if (stateRef.current.isResizing && stateRef.current.activeElementId) {
      const targetId = stateRef.current.activeElementId;
      const startEl = stateRef.current.dragStartElements[0];
      const handle = stateRef.current.resizeHandle;
      if (!startEl || !handle) return;

      const currentEl = canvasState.elements.find((el) => el.id === targetId);
      if (!currentEl) return;

      let newX = startEl.x;
      let newY = startEl.y;
      let newW = startEl.width;
      let newH = startEl.height;

      // Handle simple resize operations
      const mouseX = worldPoint.x;
      const mouseY = worldPoint.y;

      if (handle.includes('r')) {
        newW = mouseX - startEl.x;
      }
      if (handle.includes('l')) {
        newX = mouseX;
        newW = startEl.x + startEl.width - mouseX;
      }
      if (handle.includes('b')) {
        newH = mouseY - startEl.y;
      }
      if (handle.includes('t')) {
        newY = mouseY;
        newH = startEl.y + startEl.height - mouseY;
      }

      // Clamping size
      if (Math.abs(newW) < 5) newW = 5 * Math.sign(newW || 1);
      if (Math.abs(newH) < 5) newH = 5 * Math.sign(newH || 1);

      // Handle negative widths (drag handle to other side)
      let finalX = newX;
      let finalY = newY;
      let finalW = newW;
      let finalH = newH;

      if (newW < 0) {
        finalX = newX + newW;
        finalW = Math.abs(newW);
      }
      if (newH < 0) {
        finalY = newY + newH;
        finalH = Math.abs(newH);
      }

      const updated = {
        ...currentEl,
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
        updatedAt: new Date().toISOString(),
      };

      canvasState.updateElement(updated);
      collabState.sendElementUpdate(updated);
      return;
    }

    if (stateRef.current.isDrawing && stateRef.current.activeElementId) {
      const targetId = stateRef.current.activeElementId;
      const currentEl = canvasState.elements.find((el) => el.id === targetId);
      if (!currentEl) return;

      const dx = worldPoint.x - stateRef.current.startWorldPos.x;
      const dy = worldPoint.y - stateRef.current.startWorldPos.y;

      let updated = { ...currentEl };

      if (canvasState.activeTool === 'pencil') {
        const nextPoints = [...(currentEl.points || []), [worldPoint.x, worldPoint.y] as [number, number]];
        const bounds = getPointsBounds(nextPoints);
        updated = {
          ...currentEl,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          points: nextPoints,
        };
      } else {
        // Shape size bounds
        updated = {
          ...currentEl,
          width: dx,
          height: dy,
        };
      }

      canvasState.updateElement(updated);
      collabState.sendElementUpdate(updated);
      return;
    }

    if (stateRef.current.selectionBox) {
      const box = stateRef.current.selectionBox;
      const nextBox = {
        ...box,
        width: worldPoint.x - box.x,
        height: worldPoint.y - box.y,
      };
      stateRef.current.selectionBox = nextBox;

      // Identify bounding boxes intersections
      const selected = canvasState.elements
        .filter((el) => isElementInSelection(el, nextBox))
        .map((el) => el.id);

      canvasState.setSelectedIds(selected);
      requestAnimationFrame(draw);
    }
  };

  const handleMouseUp = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = canvasState.activeTool === 'hand' ? 'grab' : 'default';
    }

    // Panning complete
    if (stateRef.current.isPanning) {
      stateRef.current.isPanning = false;
      return;
    }

    // Drag-selection box complete
    if (stateRef.current.selectionBox) {
      stateRef.current.selectionBox = null;
      requestAnimationFrame(draw);
      return;
    }

    // Drawing complete
    if (stateRef.current.isDrawing && stateRef.current.activeElementId) {
      const targetId = stateRef.current.activeElementId;
      const el = canvasState.elements.find((el) => el.id === targetId);
      stateRef.current.isDrawing = false;
      stateRef.current.activeElementId = null;

      if (el) {
        // If click was tiny or dimensions are zero, delete
        if (Math.abs(el.width) < 1.5 && Math.abs(el.height) < 1.5 && el.type !== 'pencil') {
          canvasState.deleteElement(el.id);
          collabState.sendElementDelete(el.id);
        } else {
          // Normalize dimension bounds to positive
          let normX = el.x;
          let normY = el.y;
          let normW = el.width;
          let normH = el.height;

          if (el.width < 0) {
            normX = el.x + el.width;
            normW = Math.abs(el.width);
          }
          if (el.height < 0) {
            normY = el.y + el.height;
            normH = Math.abs(el.height);
          }

          const finalElement = {
            ...el,
            x: normX,
            y: normY,
            width: normW,
            height: normH,
          };

          // Trigger local history commit
          canvasState.updateElement(finalElement);
          // Push a custom create command onto local undo stack manually
          const command = {
            type: 'create' as const,
            elementsBefore: [],
            elementsAfter: [finalElement],
          };
          canvasState.executeCommand(command);
          collabState.sendElementUpdate(finalElement);
        }
      }
      return;
    }

    // Move drag complete
    if (stateRef.current.isDragging && stateRef.current.dragStartElements.length > 0) {
      stateRef.current.isDragging = false;
      const currentSelection = canvasState.selectedIds;
      
      const elementsAfter = canvasState.elements.filter((el) => currentSelection.includes(el.id));
      const elementsBefore = stateRef.current.dragStartElements;

      // Commit to local history stack
      const command = {
        type: 'update' as const,
        elementsBefore,
        elementsAfter,
      };
      canvasState.executeCommand(command);

      // Trigger DB saves (flushes debounced queue)
      elementsAfter.forEach((el) => {
        collabState.sendElementUpdate(el);
      });

      stateRef.current.dragStartElements = [];
      return;
    }

    // Resize complete
    if (stateRef.current.isResizing && stateRef.current.activeElementId) {
      stateRef.current.isResizing = false;
      const targetId = stateRef.current.activeElementId;
      const currentEl = canvasState.elements.find((el) => el.id === targetId);
      const startEl = stateRef.current.dragStartElements[0];

      if (currentEl && startEl) {
        const command = {
          type: 'update' as const,
          elementsBefore: [startEl],
          elementsAfter: [currentEl],
        };
        canvasState.executeCommand(command);
        collabState.sendElementUpdate(currentEl);
      }

      stateRef.current.activeElementId = null;
      stateRef.current.dragStartElements = [];
      return;
    }
  };

  const handleMouseLeave = () => {
    // Hide our cursor for others when pointer leaves canvas bounds
    broadcastCursor(null, null);
    
    // Clear all dragging operations
    stateRef.current.isPanning = false;
    stateRef.current.isDragging = false;
    stateRef.current.isResizing = false;
    stateRef.current.isDrawing = false;
    stateRef.current.selectionBox = null;
    requestAnimationFrame(draw);
  };

  // Keyboard actions (Delete selected, Undo, Redo, Zoom shortcut keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in input, ignore shortcuts
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      // Delete elements (Delete or Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = canvasState.selectedIds;
        if (selected.length > 0) {
          // Log bulk delete command
          const elementsBefore = canvasState.elements.filter((el) => selected.includes(el.id));
          const command = {
            type: 'delete' as const,
            elementsBefore,
            elementsAfter: [],
          };
          canvasState.executeCommand(command);

          selected.forEach((id) => {
            canvasState.deleteElement(id);
            collabState.sendElementDelete(id);
          });
          canvasState.setSelectedIds([]);
        }
      }

      // Undo / Redo
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const socketEmit = (type: string, payload: any) => {
          if (type === 'element:create') collabState.sendElementCreate(payload.element);
          if (type === 'element:update') collabState.sendElementUpdate(payload.element);
          if (type === 'element:delete') collabState.sendElementDelete(payload.elementId);
        };

        if (e.shiftKey) {
          canvasState.redo(socketEmit);
        } else {
          canvasState.undo(socketEmit);
        }
      }

      // Zoom key commands (Ctrl +/-)
      if (isCmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        canvasState.setZoom((z) => Math.min(4, z * 1.15));
      }
      if (isCmd && e.key === '-') {
        e.preventDefault();
        canvasState.setZoom((z) => Math.max(0.15, z / 1.15));
      }
      if (isCmd && e.key === '0') {
        e.preventDefault();
        canvasState.setZoom(1.0);
        canvasState.setPan({ x: 0, y: 0 });
      }

      // Tool shortcuts (1: select, 2: hand, 3: pencil, 4: rect, 5: ellipse, 6: line, 7: arrow, 8: text, 9: eraser)
      if (!isCmd) {
        switch (e.key) {
          case 'v':
          case '1':
            canvasState.setActiveTool('select');
            break;
          case 'h':
          case '2':
            canvasState.setActiveTool('hand');
            break;
          case 'p':
          case '3':
            canvasState.setActiveTool('pencil');
            break;
          case 'r':
          case '4':
            canvasState.setActiveTool('rectangle');
            break;
          case 'o':
          case '5':
            canvasState.setActiveTool('ellipse');
            break;
          case 'l':
          case '6':
            canvasState.setActiveTool('line');
            break;
          case 'a':
          case '7':
            canvasState.setActiveTool('arrow');
            break;
          case 't':
          case '8':
            canvasState.setActiveTool('text');
            break;
          case 'e':
          case '9':
            canvasState.setActiveTool('eraser');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canvasState.selectedIds, canvasState.elements, canvasState.activeTool]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    draw,
  };
};
