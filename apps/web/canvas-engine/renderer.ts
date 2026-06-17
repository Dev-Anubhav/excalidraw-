import { WhiteboardElement, Presence } from '@whiteboard/types';
import { getResizeHandles } from './math';

// Draw a subtle dot background grid
export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pan: { x: number; y: number },
  zoom: number,
  gridSize: number = 30
) => {
  ctx.save();
  ctx.strokeStyle = '#2A2A2E';
  ctx.fillStyle = '#2A2A2E';
  ctx.lineWidth = 1;

  // Calculate grid start position based on panning
  const startX = pan.x % (gridSize * zoom);
  const startY = pan.y % (gridSize * zoom);

  ctx.beginPath();
  for (let x = startX; x < width; x += gridSize * zoom) {
    for (let y = startY; y < height; y += gridSize * zoom) {
      // Draw a small 1x1 dot
      ctx.rect(x, y, 1.5, 1.5);
    }
  }
  ctx.fill();
  ctx.restore();
};

// Draw an arrow head
const drawArrowHead = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  strokeWidth: number
) => {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  // Head length proportional to stroke thickness
  const headLength = Math.max(12, strokeWidth * 3);
  
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
};

// Render a single whiteboard element
export const drawElement = (
  ctx: CanvasRenderingContext2D,
  element: WhiteboardElement
) => {
  const {
    type,
    x,
    y,
    width,
    height,
    points,
    text,
    strokeColor,
    fillColor,
    strokeWidth,
    opacity,
    rotation,
  } = element;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = fillColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Apply rotation around the center
  const cx = x + width / 2;
  const cy = y + height / 2;
  if (rotation !== 0) {
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  switch (type) {
    case 'rectangle':
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      if (fillColor !== 'transparent') {
        ctx.fill();
      }
      ctx.stroke();
      break;

    case 'ellipse':
      ctx.beginPath();
      // Ellipse center and radii
      const rx = Math.abs(width / 2);
      const ry = Math.abs(height / 2);
      ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, 2 * Math.PI);
      if (fillColor !== 'transparent') {
        ctx.fill();
      }
      ctx.stroke();
      break;

    case 'line':
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y + height);
      ctx.stroke();
      break;

    case 'arrow':
      // Draw line shaft
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y + height);
      ctx.stroke();
      
      // Draw arrowhead
      ctx.save();
      ctx.fillStyle = strokeColor; // Arrowheads filled with stroke color
      drawArrowHead(ctx, x, y, x + width, y + height, strokeWidth);
      ctx.restore();
      break;

    case 'text':
      if (text) {
        ctx.save();
        ctx.fillStyle = strokeColor;
        // Font sizes scale dynamically. Text height is height, sizing is based on font-family
        const fontSize = Math.max(14, height);
        ctx.font = `500 ${fontSize}px sans-serif`;
        ctx.textBaseline = 'top';
        
        // Render text lines
        const lines = text.split('\n');
        lines.forEach((line, idx) => {
          ctx.fillText(line, x, y + idx * (fontSize * 1.2));
        });
        ctx.restore();
      }
      break;

    case 'pencil':
      if (points && points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        
        // Render smooth quadratic curves between drawing points
        if (points.length > 2) {
          for (let i = 1; i < points.length - 2; i++) {
            const xc = (points[i][0] + points[i + 1][0]) / 2;
            const yc = (points[i][1] + points[i + 1][1]) / 2;
            ctx.quadraticCurveTo(points[i][0], points[i][1], xc, yc);
          }
          // Connect last two points
          ctx.quadraticCurveTo(
            points[points.length - 2][0],
            points[points.length - 2][1],
            points[points.length - 1][0],
            points[points.length - 1][1]
          );
        } else if (points.length === 2) {
          ctx.lineTo(points[1][0], points[1][1]);
        }
        ctx.stroke();
      }
      break;
  }

  ctx.restore();
};

// Draw selection box outline and resize handle squares around selected items
export const drawSelectionOutline = (
  ctx: CanvasRenderingContext2D,
  element: WhiteboardElement,
  zoom: number,
  handleSize: number = 8
) => {
  const { x, y, width, height, rotation } = element;
  const cx = x + width / 2;
  const cy = y + height / 2;

  ctx.save();
  ctx.strokeStyle = '#3B82F6'; // Selection color blue
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([5 / zoom, 5 / zoom]);

  // Apply rotation
  if (rotation !== 0) {
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  // Draw bounding box
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.stroke();
  ctx.restore();

  // Draw handles (do not rotate again, getResizeHandles returns pre-rotated positions)
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#3B82F6';
  ctx.lineWidth = 1.5 / zoom;

  const handles = getResizeHandles(element, zoom);
  const size = handleSize / zoom;

  handles.forEach((handle) => {
    ctx.beginPath();
    ctx.rect(handle.x - size / 2, handle.y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
};

// Draw transient selection bounding box (drag selecting)
export const drawDragSelectionBox = (
  ctx: CanvasRenderingContext2D,
  selection: { x: number; y: number; width: number; height: number }
) => {
  ctx.save();
  ctx.strokeStyle = '#3B82F6';
  ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.rect(selection.x, selection.y, selection.width, selection.height);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

// Draw a collaborator cursor
export const drawCollaboratorCursor = (
  ctx: CanvasRenderingContext2D,
  cursor: Presence,
  zoom: number
) => {
  const { cursorX, cursorY, name, avatarColor } = cursor;
  if (cursorX === null || cursorY === null) return;

  ctx.save();
  ctx.fillStyle = avatarColor;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5;

  // Draw mouse pointer triangle
  ctx.beginPath();
  ctx.moveTo(cursorX, cursorY);
  ctx.lineTo(cursorX + 10 / zoom, cursorY + 18 / zoom);
  ctx.lineTo(cursorX + 4 / zoom, cursorY + 14 / zoom);
  ctx.lineTo(cursorX, cursorY + 20 / zoom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw label tag
  ctx.fillStyle = avatarColor;
  const paddingX = 6 / zoom;
  const paddingY = 3 / zoom;
  const fontSize = Math.max(10, 12 / zoom);
  ctx.font = `${fontSize}px sans-serif`;

  const textWidth = ctx.measureText(name).width;
  const tagW = textWidth + paddingX * 2;
  const tagH = fontSize + paddingY * 2;

  // Offset tag slightly so it doesn't cover cursor pointer
  const tagX = cursorX + 12 / zoom;
  const tagY = cursorY + 12 / zoom;

  ctx.beginPath();
  // Draw rounded card background
  ctx.rect(tagX, tagY, tagW, tagH);
  ctx.fill();

  // Draw tag text
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';
  ctx.fillText(name, tagX + paddingX, tagY + paddingY);
  
  ctx.restore();
};
