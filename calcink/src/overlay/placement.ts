import type { Box } from '../recognize/segment';

// Where to draw an answer, in CSS pixels. (x, y) is the left end of the
// text's vertical middle, so the canvas should use textBaseline = 'middle'.
export type Placement = { x: number; y: number; fontSize: number; wrapped: boolean };

const MIN_FONT = 18;
const MAX_FONT = 120;
const EDGE_MARGIN = 8;

// The answer is written about as tall as the handwriting on its line.
export const fontSizeFor = (lineHeight: number) =>
  Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(0.9 * lineHeight)));

// To the right of "=", half the "=" width away, centred on it. If that would
// run past the right edge, below the equation instead, lined up with its start.
export function placeAnswer(opts: {
  equals: Box;
  line: Box;
  textWidth: number;
  fontSize: number;
  viewWidth: number;
}): Placement {
  const { equals, line, textWidth, fontSize, viewWidth } = opts;

  const gap = 0.5 * (equals.maxX - equals.minX);
  const x = equals.maxX + gap;
  const y = (equals.minY + equals.maxY) / 2;
  if (x + textWidth <= viewWidth - EDGE_MARGIN) return { x, y, fontSize, wrapped: false };

  return {
    x: line.minX,
    y: line.maxY + 0.25 * fontSize + fontSize / 2,
    fontSize,
    wrapped: true,
  };
}

// The same placement in device pixels, for a canvas whose backing store is
// devicePixelRatio times its CSS size and drawn without a scaling transform.
export const toDevicePixels = (p: Placement, dpr: number): Placement => ({
  ...p,
  x: p.x * dpr,
  y: p.y * dpr,
  fontSize: p.fontSize * dpr,
});
