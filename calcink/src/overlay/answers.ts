import '@fontsource/caveat/latin-600.css';
import type { Box } from '../recognize/segment';
import { fontSizeFor, placeAnswer, toDevicePixels } from './placement';

// One answer to show: its text, colour, and where its equation was written.
export type Answer = { text: string; color: string; equals: Box; line: Box };

const FONT_FAMILY = `Caveat, 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive`;
const FADE_MS = 200;
const DIM_ALPHA = 0.35;

// Draws answers on their own canvas above the ink. It is never part of the
// stroke list, so it cannot be erased, undone or read back by recognition.
// It repaints only when answers change, the view resizes, or a fade is running.
export class AnswerLayer {
  private answers: Answer[] = [];
  private born = new Map<string, number>(); // when each answer first appeared
  private dimmed = false;
  private frame = 0;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Repaint once the bundled font has loaded, in case the first paint used a fallback.
    document.fonts?.load(`600 32px Caveat`).then(() => this.paint(), () => {});
  }

  // Match the backing store to the on-screen size times the device pixel ratio.
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.paint();
  }

  // A recognition pass has started: keep the last answers, but faded.
  setPending() {
    if (this.dimmed) return;
    this.dimmed = true;
    this.paint();
  }

  show(answers: Answer[]) {
    const now = performance.now();
    const born = new Map<string, number>();
    for (const a of answers) {
      const key = keyOf(a);
      born.set(key, this.born.get(key) ?? now); // unchanged answers do not fade in again
    }
    this.answers = answers;
    this.born = born;
    this.dimmed = false;
    this.paint();
  }

  private paint = () => {
    cancelAnimationFrame(this.frame);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // placements are converted to device pixels below
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const now = performance.now();
    let fading = false;
    const viewWidth = this.canvas.width / dpr;

    for (const a of this.answers) {
      const fontSize = fontSizeFor(a.line.maxY - a.line.minY);
      ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
      const textWidth = ctx.measureText(a.text).width;
      const p = toDevicePixels(placeAnswer({ equals: a.equals, line: a.line, textWidth, fontSize, viewWidth }), dpr);

      const age = now - (this.born.get(keyOf(a)) ?? 0);
      if (age < FADE_MS) fading = true;
      ctx.globalAlpha = Math.min(1, age / FADE_MS) * (this.dimmed ? DIM_ALPHA : 1);
      ctx.font = `600 ${p.fontSize}px ${FONT_FAMILY}`;
      ctx.fillStyle = a.color;
      ctx.fillText(a.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (fading) this.frame = requestAnimationFrame(this.paint);
  };
}

const keyOf = (a: Answer) => `${a.text}@${Math.round(a.equals.maxX)},${Math.round(a.equals.minY)}`;
