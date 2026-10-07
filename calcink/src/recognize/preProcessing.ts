import type { Stroke } from '../canvas/canvas';

const SIZE = 28;
const FIT = 20;
const SS = 3;

const BIG = SIZE * SS;
const PEN = 2.4;

export function toDigitInput(strokes: Stroke[]): Float32Array
{
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    const out = new Float32Array(SIZE * SIZE);

    for(const stroke of strokes)
    {
        for(const point of stroke.points)
        {
            if(point.x < minx) minx = point.x;
            if(point.x > maxx) maxx = point.x;
            if(point.y < miny) miny = point.y;
            if(point.y > maxy) maxy = point.y;
        }
    }

    const scale = (FIT * SS) / Math.max(maxx - minx, maxy - miny, 1);
    const radius = (PEN * SS) / 2;

    const draw = (shiftx: number, shifty: number):Uint8Array =>
    {
        const grid = new Uint8Array(BIG * BIG);
        for(const stroke of strokes)
        {
            const pts = stroke.points.map(p =>
            ({
                x: (p.x - minx) * scale + shiftx,
                y: (p.y - miny) * scale + shifty
            }));

            for(let i = 0; i < pts.length - 1; i++)
            {
                const a = pts[i];
                const b = pts[Math.min(i + 1, pts.length - 1)];
                const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius));
                const x1 = Math.min(BIG - 1, Math.ceil(Math.max(a.x, b.x) + radius));
                const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius));
                const y1 = Math.min(BIG - 1, Math.ceil(Math.max(a.y, b.y) + radius));

                const dx = b.x - a.x;
                const dy = b.y - a.y;

                const lenSq = dx * dx + dy * dy;

                for(let y = y0; y <= y1; y++)
                {
                    for(let x = x0; x <= x1; x++)
                    {
                        const px = x + 0.5;
                        const py = y + 0.5;

                        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));

                        const ex = px - (a.x + t * dx);
                        const ey = py - (a.y + t * dy);

                        if(ex * ex + ey * ey <= radius * radius)
                            grid[y * BIG + x] = 1;
                    }
                }
            }
            
        }
        return grid;
    };
    
    const first = draw(0,0);

    let sumx = 0, sumy = 0, count = 0;
    
    for(let y = 0; y < BIG; y++)
    {
        for(let x = 0; x < BIG; x++)
        {
            if(first[y * BIG + x])
            {
                sumx += x;
                sumy += y;
                count++;
            }
        }
    }

    if(count === 0) return out;

    const big = draw(BIG / 2 - sumx / count, BIG / 2 - sumy / count);

    for(let y = 0; y < SIZE; y++)
    {
        for(let x = 0; x < SIZE; x++)
        {
            let ink = 0;
            for(let dy = 0; dy < SS; dy++)
            {
                for(let dx = 0; dx < SS; dx++)
                {
                    ink += big[(y * SS + dy) * BIG + (x * SS + dx)];
                }
            }   
            out[y * SIZE + x] = ink / (SS * SS);
        }
    }

    return out;

}


const S = 32; // the symbol model's image is 32×32
const BIG_S = 128; // draw 4× larger first, then shrink

// Peel pixels off the edges of each line until it is one pixel wide (Zhang-Suen).
const thin = (img: Uint8Array): Uint8Array => {
  const at = (x: number, y: number) => img[y * S + x];
  // The 8 neighbours, clockwise from the one above.
  const ring = (x: number, y: number) => [
    at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1),
    at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1),
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pass of [0, 1]) {
      const remove: number[] = [];
      for (let y = 1; y < S - 1; y++) {
        for (let x = 1; x < S - 1; x++) {
          if (!at(x, y)) continue;
          const n = ring(x, y);
          const count = n.reduce((a, b) => a + b, 0);
          let steps = 0; // 0→1 changes going once around the ring
          for (let i = 0; i < 8; i++) if (n[i] === 0 && n[(i + 1) % 8] === 1) steps++;
          if (count < 2 || count > 6 || steps !== 1) continue;

          const [up, , right, , down, , left] = n;
          const ok = pass === 0
            ? up * right * down === 0 && right * down * left === 0
            : up * right * left === 0 && up * down * left === 0;
          if (ok) remove.push(y * S + x);
        }
      }
      for (const i of remove) img[i] = 0;
      if (remove.length > 0) changed = true;
    }
  }
  return img;
};

export function toSymbolInput(strokes: Stroke[]): Float32Array
{
    const out = new Float32Array(S * S).fill(1); // start as blank paper (1 = paper)

    // 1. Bounding box, including half the pen width on every side.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const stroke of strokes)
    {
        const half = stroke.width / 2;
        for (const point of stroke.points)
        {
            if (point.x - half < minX) minX = point.x - half;
            if (point.x + half > maxX) maxX = point.x + half;
            if (point.y - half < minY) minY = point.y - half;
            if (point.y + half > maxY) maxY = point.y + half;
        }
    }
    if (minX === Infinity) return out; // no points

    // 2. Scale so the longer side fills the whole 128-pixel frame.
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const scale = BIG_S / Math.max(w, h);

    // 3. Draw the strokes into a 128×128 grid (1 = ink), moved by (shiftX, shiftY).
    const draw = (shiftX: number, shiftY: number): Uint8Array =>
    {
        const grid = new Uint8Array(BIG_S * BIG_S);
        for (const stroke of strokes)
        {
            const radius = Math.max((stroke.width * scale) / 2, 1);
            const pts = stroke.points.map((p) => ({
                x: (p.x - minX) * scale + shiftX,
                y: (p.y - minY) * scale + shiftY,
            }));
            for (let i = 0; i < pts.length; i++)
            {
                const a = pts[i];
                const b = pts[Math.min(i + 1, pts.length - 1)];
                const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius));
                const x1 = Math.min(BIG_S - 1, Math.ceil(Math.max(a.x, b.x) + radius));
                const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius));
                const y1 = Math.min(BIG_S - 1, Math.ceil(Math.max(a.y, b.y) + radius));
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const lenSq = dx * dx + dy * dy;
                // Ink every pixel within `radius` of the segment a-b.
                for (let y = y0; y <= y1; y++)
                {
                    for (let x = x0; x <= x1; x++)
                    {
                        const px = x + 0.5;
                        const py = y + 0.5;
                        const t = lenSq === 0
                            ? 0
                            : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
                        const ex = px - (a.x + t * dx);
                        const ey = py - (a.y + t * dy);
                        if (ex * ex + ey * ey <= radius * radius) grid[y * BIG_S + x] = 1;
                    }
                }
            }
        }
        return grid;
    };

    // 4. First pass: find the ink's centre of mass.
    const first = draw(0, 0);
    let sumX = 0, sumY = 0, count = 0;
    for (let y = 0; y < BIG_S; y++)
    {
        for (let x = 0; x < BIG_S; x++)
        {
            if (first[y * BIG_S + x]) { sumX += x; sumY += y; count++; }
        }
    }
    if (count === 0) return out;

    // 5. Second pass: centred on the shorter side only.
    const big = w >= h
        ? draw(0, BIG_S / 2 - sumY / count)   // wide symbol: centre vertically
        : draw(BIG_S / 2 - sumX / count, 0);  // tall symbol: centre horizontally

    // 6. Shrink 128×128 to 32×32: a cell is ink when more than half of its 4×4 block is ink.
    const small = new Uint8Array(S * S);
    for (let y = 0; y < S; y++)
    {
        for (let x = 0; x < S; x++)
        {
            let ink = 0;
            for (let v = 0; v < 4; v++)
            {
                for (let u = 0; u < 4; u++) ink += big[(y * 4 + v) * BIG_S + (x * 4 + u)];
            }
            small[y * S + x] = ink > 8 ? 1 : 0;
        }
    }

    // 7. Thin the lines to one pixel wide.
    thin(small);

    // 8. The model wants the reverse: 1 = paper, 0 = ink.
    for (let i = 0; i < out.length; i++) out[i] = 1 - small[i];
    return out;
}