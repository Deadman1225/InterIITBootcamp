import type { Stroke } from '../canvas/canvas';

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

// One handwritten symbol: the strokes that form it and the box around them.
export type SymbolGroup = { strokes: Stroke[]; box: Box };

// One line of writing: its symbols, ordered left to right.
export type Line = { groups: SymbolGroup[]; box: Box };

export const boxOf = (strokes: Stroke[]): Box => {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of strokes) {
    const r = s.width / 2;
    for (const p of s.points) {
      box.minX = Math.min(box.minX, p.x - r);
      box.minY = Math.min(box.minY, p.y - r);
      box.maxX = Math.max(box.maxX, p.x + r);
      box.maxY = Math.max(box.maxY, p.y + r);
    }
  }
  return box;
};

const union = (a: Box, b: Box): Box => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

export const width = (b: Box) => b.maxX - b.minX;
export const height = (b: Box) => b.maxY - b.minY;

// Two boxes belong to the same symbol when they share most of their horizontal
// extent and are not far apart vertically. This joins the two bars of "=", the
// bar and dots of "÷", the two strokes of "+", "×", "4", "5", and so on.
const sameSymbol = (a: Box, b: Box) => {
  const overlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const narrower = Math.min(width(a), width(b));
  if (overlap < 0.5 * narrower) return false;

  const gap = Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY);
  const taller = Math.max(height(a), height(b), width(a), width(b));
  return gap < 0.6 * taller;
};

export const groupStrokes = (strokes: Stroke[]): SymbolGroup[] => {
  let groups: SymbolGroup[] = strokes
    .filter((s) => s.points.length > 0)
    .map((s) => ({ strokes: [s], box: boxOf([s]) }));

  // Keep merging until no two groups belong together.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (sameSymbol(groups[i].box, groups[j].box)) {
          groups[i] = {
            strokes: [...groups[i].strokes, ...groups[j].strokes],
            box: union(groups[i].box, groups[j].box),
          };
          groups = groups.filter((_, k) => k !== j);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups;
};

// Split symbols into lines of writing, then order each line left to right.
export const groupLines = (groups: SymbolGroup[]): Line[] => {
  const rows: Line[] = [];

  // Tall symbols first, so each row's vertical range is set by digits rather
  // than by a stray minus sign or decimal point.
  const byHeight = [...groups].sort((a, b) => height(b.box) - height(a.box));

  for (const g of byHeight) {
    const centerY = (g.box.minY + g.box.maxY) / 2;
    // A little slack below and above, so a decimal point sitting just under
    // the baseline still joins its row.
    const row = rows.find((l) => {
      const slack = 0.25 * height(l.box);
      return centerY >= l.box.minY - slack && centerY <= l.box.maxY + slack;
    });
    if (row) {
      row.groups.push(g);
      row.box = union(row.box, g.box);
    } else {
      rows.push({ groups: [g], box: { ...g.box } });
    }
  }

  // Two sums written side by side share a row. Cut the row wherever the space
  // between neighbouring symbols is wider than 1.5 times the row's height.
  const lines: Line[] = [];
  for (const row of rows) {
    row.groups.sort((a, b) => a.box.minX - b.box.minX);
    const widest = 1.5 * height(row.box);

    let current: Line = { groups: [row.groups[0]], box: { ...row.groups[0].box } };
    for (const g of row.groups.slice(1)) {
      if (g.box.minX - current.box.maxX > widest) {
        lines.push(current);
        current = { groups: [g], box: { ...g.box } };
      } else {
        current.groups.push(g);
        current.box = union(current.box, g.box);
      }
    }
    lines.push(current);
  }

  return lines.sort((a, b) => a.box.minY - b.box.minY || a.box.minX - b.box.minX);
};