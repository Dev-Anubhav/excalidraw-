import { Point, WhiteboardElement } from '@whiteboard/types';

// Convert screen coordinates to world coordinates
export const screenToWorld = (
  clientX: number,
  clientY: number,
  pan: { x: number; y: number },
  zoom: number
): Point => {
  return {
    x: (clientX - pan.x) / zoom,
    y: (clientY - pan.y) / zoom,
  };
};

// Convert world coordinates to screen coordinates
export const worldToScreen = (
  worldX: number,
  worldY: number,
  pan: { x: number; y: number },
  zoom: number
): Point => {
  return {
    x: worldX * zoom + pan.x,
    y: worldY * zoom + pan.y,
  };
};

// Rotate a point around a center of rotation
export const rotatePoint = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  angle: number // in degrees
): Point => {
  if (angle === 0) return { x, y };
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
};

// Get distance between two points
export const getDistance = (p1: Point, p2: Point): number => {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
};

// Check if point is close to a line segment
export const distanceToSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  // Projection t along the line segment
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
};

// Hit detection for single element
export const isPointOnElement = (
  point: Point,
  element: WhiteboardElement,
  hitThreshold: number = 6
): boolean => {
  const { x, y, width, height, rotation, type, points, fillColor } = element;
  
  // Calculate center of the shape
  const cx = x + width / 2;
  const cy = y + height / 2;
  
  // Rotate pointer coordinate back to element space
  const localPoint = rotatePoint(point.x, point.y, cx, cy, -rotation);
  const lx = localPoint.x;
  const ly = localPoint.y;

  switch (type) {
    case 'rectangle': {
      const hasFill = fillColor !== 'transparent';
      if (hasFill) {
        // Full rect hit
        return lx >= x && lx <= x + width && ly >= y && ly <= y + height;
      } else {
        // Border hit only
        const top = distanceToSegment(lx, ly, x, y, x + width, y) <= hitThreshold;
        const bottom = distanceToSegment(lx, ly, x, y + height, x + width, y + height) <= hitThreshold;
        const left = distanceToSegment(lx, ly, x, y, x, y + height) <= hitThreshold;
        const right = distanceToSegment(lx, ly, x + width, y, x + width, y + height) <= hitThreshold;
        return top || bottom || left || right;
      }
    }
    
    case 'ellipse': {
      const rx = width / 2;
      const ry = height / 2;
      if (rx === 0 || ry === 0) return false;
      const ecx = x + rx;
      const ecy = y + ry;
      const normalizedDist = Math.pow(lx - ecx, 2) / (rx * rx) + Math.pow(ly - ecy, 2) / (ry * ry);
      
      const hasFill = fillColor !== 'transparent';
      if (hasFill) {
        return normalizedDist <= 1.05; // Slightly padded inside
      } else {
        // Ring hit: normalized distance should be close to 1
        const dist = Math.abs(normalizedDist - 1);
        // Map ring threshold relative to radius
        return dist <= 0.15 || (Math.abs(lx - ecx) < rx && Math.abs(ly - ecy) < ry && normalizedDist >= 0.85 && normalizedDist <= 1.15);
      }
    }
    
    case 'line': {
      return distanceToSegment(lx, ly, x, y, x + width, y + height) <= hitThreshold;
    }
    
    case 'arrow': {
      // The arrow is basically a line from (x, y) to (x + width, y + height)
      return distanceToSegment(lx, ly, x, y, x + width, y + height) <= hitThreshold;
    }
    
    case 'text': {
      // Bounding box hit
      return lx >= x && lx <= x + width && ly >= y && ly <= y + height;
    }
    
    case 'pencil': {
      if (!points || points.length === 0) return false;
      // First do quick bounding box check
      if (lx < x - hitThreshold || lx > x + width + hitThreshold || ly < y - hitThreshold || ly > y + height + hitThreshold) {
        return false;
      }
      // Check distance to each segment in pencil points
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        // Note: pencil points are stored in element coordinates or absolute?
        // Let's store them in absolute/world coordinates, so we don't double translate
        // When we do local check, we check against absolute segment lines directly.
        const dist = distanceToSegment(point.x, point.y, p1[0], p1[1], p2[0], p2[1]);
        if (dist <= hitThreshold) return true;
      }
      return false;
    }
    
    default:
      return false;
  }
};

// Check if element is completely inside selection bounding box
export const isElementInSelection = (
  element: WhiteboardElement,
  selection: { x: number; y: number; width: number; height: number }
): boolean => {
  const { x, y, width, height } = element;
  
  // Bound calculation for selection box
  const selMinX = Math.min(selection.x, selection.x + selection.width);
  const selMaxX = Math.max(selection.x, selection.x + selection.width);
  const selMinY = Math.min(selection.y, selection.y + selection.height);
  const selMaxY = Math.max(selection.y, selection.y + selection.height);

  // Element bounds
  const elMinX = Math.min(x, x + width);
  const elMaxX = Math.max(x, x + width);
  const elMinY = Math.min(y, y + height);
  const elMaxY = Math.max(y, y + height);

  return (
    elMinX >= selMinX &&
    elMaxX <= selMaxX &&
    elMinY >= selMinY &&
    elMaxY <= selMaxY
  );
};

// Get bounding box for a set of points (e.g. pencil drawing)
export const getPointsBounds = (points: [number, number][]): { x: number; y: number; width: number; height: number } => {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = points[0][0];
  let maxX = points[0][0];
  let minY = points[0][1];
  let maxY = points[0][1];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

// Resize anchors calculations
export type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r';

export interface HandlePosition {
  type: ResizeHandle;
  x: number;
  y: number;
}

export const getResizeHandles = (
  element: WhiteboardElement,
  zoom: number
): HandlePosition[] => {
  const { x, y, width, height, rotation } = element;
  const cx = x + width / 2;
  const cy = y + height / 2;

  // Unrotated handle positions
  const rawHandles = [
    { type: 'tl', x, y },
    { type: 't', x: x + width / 2, y },
    { type: 'tr', x: x + width, y },
    { type: 'r', x: x + width, y: y + height / 2 },
    { type: 'br', x: x + width, y: y + height },
    { type: 'b', x: x + width / 2, y: y + height },
    { type: 'bl', x, y: y + height },
    { type: 'l', x, y: y + height / 2 },
  ] as const;

  // Rotate each handle position using element rotation
  return rawHandles.map((handle) => {
    const pt = rotatePoint(handle.x, handle.y, cx, cy, rotation);
    return {
      type: handle.type,
      x: pt.x,
      y: pt.y,
    };
  });
};

// Get which handle is clicked, if any
export const getHandleAtPosition = (
  point: Point,
  element: WhiteboardElement,
  zoom: number,
  handleSize: number = 8
): ResizeHandle | null => {
  const handles = getResizeHandles(element, zoom);
  const threshold = handleSize / zoom; // Scale threshold by zoom so handle click feels accurate

  for (const handle of handles) {
    if (Math.hypot(point.x - handle.x, point.y - handle.y) <= threshold) {
      return handle.type;
    }
  }

  return null;
};
