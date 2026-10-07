import { toDigitInput, toSymbolInput } from './preProcessing';
import type { Point, Stroke } from '../canvas/canvas';
import { boxOf, groupLines, groupStrokes, height, width } from './segment';
import type { Box, SymbolGroup } from './segment';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

// Send one image to one model and get its raw scores back.
const ask = (model: 'digit' | 'symbol', input: Float32Array): Promise<number[]> =>
{
    return new Promise((resolve, reject) =>
    {
        worker.onmessage = (event) =>
        {
            if (event.data.type === 'result')
                resolve(event.data.output);
            else if (event.data.type === 'error')
                reject(new Error(event.data.error ?? event.data.message));
        };
        worker.postMessage({ model, input });
    });
};

// Position of the largest score.
const best = (scores: number[]) => scores.indexOf(Math.max(...scores));

// The symbol model's 17 classes, in its training order. "*" is ×.
const SYMBOLS = ['(', ')', '+', '-', '.', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '√', '*'];

// ---- Shape helpers -------------------------------------------------------

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// 1 for a perfectly straight stroke, lower the more it bends.
const straightness = (s: Stroke) =>
{
    let path = 0;
    for (let i = 0; i < s.points.length - 1; i++)
        path += dist(s.points[i], s.points[i + 1]);

    return path === 0 ? 1 : dist(s.points[0], s.points[s.points.length - 1]) / path;
};

// How steep a stroke is, in degrees: 0 is flat, 90 is upright.
const tilt = (s: Stroke) =>
{
    const a = s.points[0];
    const b = s.points[s.points.length - 1];
    const degrees = Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180 / Math.PI;
    return degrees > 90 ? 180 - degrees : degrees;
};

// Do two strokes cross, treating each as a straight line between its ends?
// Each line is stretched by 15% first, so a "+" whose bars only just touch still counts.
const strokesCross = (s: Stroke, t: Stroke) =>
{
    const stretch = (a: Point, b: Point): [Point, Point] =>
    {
        const dx = (b.x - a.x) * 0.15;
        const dy = (b.y - a.y) * 0.15;
        return [{ x: a.x - dx, y: a.y - dy }, { x: b.x + dx, y: b.y + dy }];
    };

    const [a, b] = stretch(s.points[0], s.points[s.points.length - 1]);
    const [c, d] = stretch(t.points[0], t.points[t.points.length - 1]);

    // Which side of the line p-q the point r is on.
    const side = (p: Point, q: Point, r: Point) =>
        Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));

    return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
};

const isFlat = (b: Box) => height(b) < 0.5 * width(b);

// Symbols identified by layout alone. "=" and "÷" are made of separate marks,
// so no single-symbol model can read them, and they are not in SYMBOLS either.
const byShape = (g: SymbolGroup, lineHeight: number): string | null =>
{
    const dotSize = Math.max(0.2 * lineHeight, 4);
    const boxes = g.strokes.map((s) => boxOf([s]));
    const isDot = (b: Box) => Math.max(width(b), height(b)) < dotSize;

    if (isDot(g.box)) return '.';

    // Two roughly straight strokes: "=", "+" or "×", told apart by their angles.
    // Angles work where bounding boxes do not, because slanted writing tilts
    // every box but leaves the angle between the two strokes unchanged.
    if (g.strokes.length === 2 && g.strokes.every((s) => straightness(s) > 0.75))
    {
        const [s, t] = g.strokes;
        const flatter = Math.min(tilt(s), tilt(t));
        const steeper = Math.max(tilt(s), tilt(t));

        if (strokesCross(s, t))
        {
            // The gap between the two angles tells them apart, whatever the
            // slant: a "+" is built from two strokes about 90 degrees apart,
            // while the two strokes of a "×" are both diagonal and alike.
            return steeper - flatter > 40 ? '+' : '*';
        }
        else if (steeper < 40) return '='; // two near-level bars that do not cross
    }

    // "÷": a bar with a dot above it and a dot below it.
    if (boxes.length === 3)
    {
        const bars = boxes.filter((b) => isFlat(b) && !isDot(b));
        const dots = boxes.filter(isDot);
        if (bars.length === 1 && dots.length === 2)
        {
            const barY = (bars[0].minY + bars[0].maxY) / 2;
            if (dots.some((d) => d.maxY < barY) && dots.some((d) => d.minY > barY)) return '/';
        }
    }

    return null;
};

// ---- Reading --------------------------------------------------------------

// One symbol: layout rules first, then the symbol model, then the digit model.
async function readSymbol(group: SymbolGroup, lineHeight: number): Promise<string>
{
    const shape = byShape(group, lineHeight);
    if (shape) return shape;

    // The symbol model decides: operator, bracket, or digit?
    const guess = SYMBOLS[best(await ask('symbol', toSymbolInput(group.strokes)))];
    const strokes = group.strokes;

    // Accept an operator only if it also looks the part, so a 4 is not read as +.
    if ((guess === '+' || guess === '*') && strokes.length >= 2
        && strokes.every((s) => straightness(s) > 0.75)) return guess;

    if (guess === '-' && isFlat(group.box)) return guess;

    if ((guess === '(' || guess === ')') && strokes.length === 1
        && straightness(strokes[0]) < 0.97
        && height(group.box) > 1.5 * width(group.box)) return guess;

    // Otherwise it is a digit, and the digit model picks which one.
    return String(best(await ask('digit', toDigitInput(strokes))));
}

async function readPage(strokes: Stroke[]): Promise<string[]>
{
    const lines = groupLines(groupStrokes(strokes));
    const texts: string[] = [];

    for (const line of lines)
    {
        const lineHeight = height(line.box);

        let text = '';
        for (const group of line.groups)
        {
            text += await readSymbol(group, lineHeight);
        }
        texts.push(text);
    }
    return texts;
}

// One pass at a time: the worker has a single message handler, so overlapping
// passes would steal each other's replies.
let queue: Promise<unknown> = Promise.resolve();

export function recognizeLines(strokes: Stroke[]): Promise<string[]>
{
    const result = queue.then(() => readPage(strokes));
    queue = result.catch(() => {});
    return result;
}