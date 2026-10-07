import { describe, expect, it } from 'vitest';
import type { Box } from '../recognize/segment';
import { fontSizeFor, placeAnswer, toDevicePixels } from './placement';
import { toAnswers } from './toAnswers';

// "18+4×3 =" written at y 100–160, with the "=" at x 300–340, y 120–140.
const line: Box = { minX: 50, minY: 100, maxX: 340, maxY: 160 };
const equals: Box = { minX: 300, minY: 120, maxX: 340, maxY: 140 };

describe('placeAnswer', () => {
  it('puts the answer right of the "=", half its width away, centred on it', () => {
    const p = placeAnswer({ equals, line, textWidth: 60, fontSize: 54, viewWidth: 1000 });
    expect(p).toEqual({ x: 360, y: 130, fontSize: 54, wrapped: false });
  });

  it('wraps below the equation, left-aligned, when the answer would run off the edge', () => {
    const p = placeAnswer({ equals, line, textWidth: 60, fontSize: 40, viewWidth: 400 });
    expect(p.wrapped).toBe(true);
    expect(p.x).toBe(line.minX);
    expect(p.y).toBeGreaterThan(line.maxY + 20); // middle of the text sits fully below the ink
    expect(p.y).toBe(160 + 10 + 20);
  });

  it('stays on the right when the answer just fits', () => {
    // 360 + 32 = 392 = 400 - 8 margin
    const p = placeAnswer({ equals, line, textWidth: 32, fontSize: 40, viewWidth: 400 });
    expect(p.wrapped).toBe(false);
  });
});

describe('toDevicePixels', () => {
  it('scales position and font size by devicePixelRatio', () => {
    const css = placeAnswer({ equals, line, textWidth: 60, fontSize: 54, viewWidth: 1000 });
    expect(toDevicePixels(css, 2)).toEqual({ x: 720, y: 260, fontSize: 108, wrapped: false });
    expect(toDevicePixels(css, 1.5)).toEqual({ x: 540, y: 195, fontSize: 81, wrapped: false });
  });

  it('leaves CSS pixels unchanged at a ratio of 1', () => {
    const css = placeAnswer({ equals, line, textWidth: 60, fontSize: 54, viewWidth: 1000 });
    expect(toDevicePixels(css, 1)).toEqual(css);
  });
});

describe('fontSizeFor', () => {
  it('follows the handwriting height, within limits', () => {
    expect(fontSizeFor(60)).toBe(54);
    expect(fontSizeFor(5)).toBe(18);
    expect(fontSizeFor(1000)).toBe(120);
  });
});

describe('toAnswers', () => {
  const read = (text: string) => ({ text, box: line, last: equals });

  it('answers a line that ends in "="', () => {
    expect(toAnswers([read('18+4*3=')])).toMatchObject([{ text: '30', equals, line }]);
  });

  it('shows "Undefined" in red for division by zero', () => {
    expect(toAnswers([read('5/0=')])).toMatchObject([{ text: 'Undefined', color: '#dc2626' }]);
  });

  it('shows nothing for unreadable input or a line without a final "="', () => {
    expect(toAnswers([read('5+*=')])).toEqual([]);
    expect(toAnswers([read('18+4')])).toEqual([]);
    expect(toAnswers([read('2=3')])).toEqual([]);
  });
});
