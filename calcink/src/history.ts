import type { Stroke } from './canvas/canvas';

// Undo/redo for the drawing. Every change replaces the whole stroke list
// with a new one, so each saved version is just a reference to an old list.
export class StrokeHistory {
  private past: Stroke[][] = [];
  private future: Stroke[][] = [];
  private present: Stroke[] = [];

  get strokes(): Stroke[] {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  // Record a new version of the drawing. A new change makes the old redo steps meaningless.
  push(next: Stroke[]): void {
    if (next === this.present) return;
    this.past.push(this.present);
    this.present = next;
    this.future = [];
  }

  // Each returns false when there is nothing to go back or forward to.
  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.present);
    this.present = previous;
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.present);
    this.present = next;
    return true;
  }
}
