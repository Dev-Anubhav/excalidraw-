import { create } from 'zustand';
import { WhiteboardElement, ElementType } from '@whiteboard/types';

export interface CanvasCommand {
  type: 'create' | 'update' | 'delete';
  elementsBefore: WhiteboardElement[];
  elementsAfter: WhiteboardElement[];
}

interface CanvasState {
  elements: WhiteboardElement[];
  selectedIds: string[];
  activeTool: ElementType | 'select' | 'hand' | 'eraser';
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  fontSize: number;
  pan: { x: number; y: number };
  zoom: number;
  undoStack: CanvasCommand[];
  redoStack: CanvasCommand[];
  
  // Setters
  setElements: (elements: WhiteboardElement[]) => void;
  addElement: (element: WhiteboardElement, isHistoryEvent?: boolean) => void;
  updateElement: (element: WhiteboardElement, isHistoryEvent?: boolean) => void;
  deleteElement: (elementId: string, isHistoryEvent?: boolean) => void;
  setSelectedIds: (ids: string[]) => void;
  setActiveTool: (tool: ElementType | 'select' | 'hand' | 'eraser') => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setOpacity: (opacity: number) => void;
  setFontSize: (size: number) => void;
  setPan: (pan: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;

  // Layer ordering actions
  bringToFront: () => void;
  sendToBack: () => void;

  // History Operations
  executeCommand: (command: CanvasCommand) => void;
  undo: (socketEmit: (type: string, payload: any) => void) => void;
  redo: (socketEmit: (type: string, payload: any) => void) => void;
  clearHistory: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  elements: [],
  selectedIds: [],
  activeTool: 'select',
  strokeColor: '#3B82F6', // Gorgeous blue default
  fillColor: 'transparent',
  strokeWidth: 2,
  opacity: 1.0,
  fontSize: 20,
  pan: { x: 0, y: 0 },
  zoom: 1.0,
  undoStack: [],
  redoStack: [],

  setElements: (elements) => set({ elements }),

  addElement: (element, isHistoryEvent = false) => {
    const prevElements = get().elements;
    set({ elements: [...prevElements, element] });
    
    if (isHistoryEvent) {
      const command: CanvasCommand = {
        type: 'create',
        elementsBefore: [],
        elementsAfter: [element],
      };
      set((state) => ({
        undoStack: [...state.undoStack, command],
        redoStack: [],
      }));
    }
  },

  updateElement: (element, isHistoryEvent = false) => {
    const prevElements = get().elements;
    const original = prevElements.find((el) => el.id === element.id);
    if (!original) return;

    // Maintain a history event if needed
    if (isHistoryEvent) {
      const command: CanvasCommand = {
        type: 'update',
        elementsBefore: [{ ...original }],
        elementsAfter: [{ ...element }],
      };
      set((state) => ({
        undoStack: [...state.undoStack, command],
        redoStack: [],
      }));
    }

    set({
      elements: prevElements.map((el) => (el.id === element.id ? element : el)),
    });
  },

  deleteElement: (elementId, isHistoryEvent = false) => {
    const prevElements = get().elements;
    const target = prevElements.find((el) => el.id === elementId);
    if (!target) return;

    if (isHistoryEvent) {
      const command: CanvasCommand = {
        type: 'delete',
        elementsBefore: [{ ...target }],
        elementsAfter: [],
      };
      set((state) => ({
        undoStack: [...state.undoStack, command],
        redoStack: [],
      }));
    }

    set({
      elements: prevElements.filter((el) => el.id !== elementId),
      selectedIds: get().selectedIds.filter((id) => id !== elementId),
    });
  },

  setSelectedIds: (selectedIds) => set({ selectedIds }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setFillColor: (fillColor) => set({ fillColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setOpacity: (opacity) => set({ opacity }),
  setFontSize: (fontSize) => set({ fontSize }),
  
  setPan: (panUpdate) => {
    if (typeof panUpdate === 'function') {
      set((state) => ({ pan: panUpdate(state.pan) }));
    } else {
      set({ pan: panUpdate });
    }
  },

  setZoom: (zoomUpdate) => {
    if (typeof zoomUpdate === 'function') {
      set((state) => ({ zoom: zoomUpdate(state.zoom) }));
    } else {
      set({ zoom: zoomUpdate });
    }
  },

  bringToFront: () => {
    const { elements, selectedIds } = get();
    if (selectedIds.length === 0) return;

    const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
    let updatedZ = maxZ + 1;

    const updatedElements = elements.map((el) => {
      if (selectedIds.includes(el.id)) {
        return { ...el, zIndex: updatedZ++ };
      }
      return el;
    });

    set({ elements: updatedElements });
  },

  sendToBack: () => {
    const { elements, selectedIds } = get();
    if (selectedIds.length === 0) return;

    const minZ = elements.reduce((min, el) => Math.min(min, el.zIndex), 0);
    let updatedZ = minZ - selectedIds.length;

    const updatedElements = elements.map((el) => {
      if (selectedIds.includes(el.id)) {
        return { ...el, zIndex: updatedZ++ };
      }
      return el;
    });

    set({ elements: updatedElements });
  },

  executeCommand: (command) => {
    set((state) => ({
      undoStack: [...state.undoStack, command],
      redoStack: [],
    }));
  },

  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  undo: (socketEmit) => {
    const { undoStack, elements } = get();
    if (undoStack.length === 0) return;

    const lastCommand = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);

    switch (lastCommand.type) {
      case 'create':
        // Undo a create: delete the created elements
        lastCommand.elementsAfter.forEach((el) => {
          socketEmit('element:delete', { elementId: el.id });
        });
        set({
          elements: elements.filter(
            (el) => !lastCommand.elementsAfter.some((after) => after.id === el.id)
          ),
          selectedIds: [],
        });
        break;

      case 'update':
        // Undo an update: restore original elements
        lastCommand.elementsBefore.forEach((el) => {
          socketEmit('element:update', { element: el });
        });
        set({
          elements: elements.map((el) => {
            const before = lastCommand.elementsBefore.find((b) => b.id === el.id);
            return before ? before : el;
          }),
        });
        break;

      case 'delete':
        // Undo a delete: restore deleted elements
        lastCommand.elementsBefore.forEach((el) => {
          socketEmit('element:create', { element: el });
        });
        set({
          elements: [...elements, ...lastCommand.elementsBefore],
        });
        break;
    }

    set({
      undoStack: newUndoStack,
      redoStack: [...get().redoStack, lastCommand],
    });
  },

  redo: (socketEmit) => {
    const { redoStack, elements } = get();
    if (redoStack.length === 0) return;

    const lastCommand = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    switch (lastCommand.type) {
      case 'create':
        // Redo a create: restore created elements
        lastCommand.elementsAfter.forEach((el) => {
          socketEmit('element:create', { element: el });
        });
        set({
          elements: [...elements, ...lastCommand.elementsAfter],
        });
        break;

      case 'update':
        // Redo an update: apply updated elements
        lastCommand.elementsAfter.forEach((el) => {
          socketEmit('element:update', { element: el });
        });
        set({
          elements: elements.map((el) => {
            const after = lastCommand.elementsAfter.find((a) => a.id === el.id);
            return after ? after : el;
          }),
        });
        break;

      case 'delete':
        // Redo a delete: delete the restored elements
        lastCommand.elementsBefore.forEach((el) => {
          socketEmit('element:delete', { elementId: el.id });
        });
        set({
          elements: elements.filter(
            (el) => !lastCommand.elementsBefore.some((before) => before.id === el.id)
          ),
          selectedIds: [],
        });
        break;
    }

    set({
      undoStack: [...get().undoStack, lastCommand],
      redoStack: newRedoStack,
    });
  },
}));
