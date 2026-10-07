import { useEffect, useRef, useState } from 'react';
import {recognizeLines} from '../recognize';
import {solve} from '../math/parser.ts'
import { StrokeHistory } from '../history';
import { AnswerLayer } from '../overlay/answers';
import { toAnswers } from '../overlay/toAnswers';
import { ClearIcon, EraserIcon, LogoIcon, PenIcon, RedoIcon, UndoIcon } from '../ui/icons';


export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; width: number };

type Tool = 'pen' | 'eraser';

const ERASER_RADIUS = 12;
const MIN_WIDTH = 1;
const MAX_WIDTH = 12;



// Shortest distance from point p to the line segment a-b.
const distToSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

// True if point p is within the eraser's radius of any part of the stroke.
const hitsStroke = (p: Point, s: Stroke) => {
  const pts = s.points;
  if (pts.length === 1) {
    return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= ERASER_RADIUS;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(p, pts[i], pts[i + 1]) <= ERASER_RADIUS) return true;
  }
  return false;
};

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // The toolbar must visibly update when the tool changes, so this is state.
  const [tool, setTool] = useState<Tool>('pen');

  // Only these two flags reach React, so the Undo/Redo buttons can enable and disable.
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Clear is disabled on an empty page. Like the flags above, it changes only
  // after a stroke is finished, never during pointer-move.
  const [isEmpty, setIsEmpty] = useState(true);

  // Pen width for the next stroke. Changes only when the slider moves.
  const [penWidth, setPenWidth] = useState(3);

  // Drawing data lives in refs, so drawing never triggers a React re-render.
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const erasing = useRef(false);
  const frameRequested = useRef(false);

  // Saved versions of the stroke list, created on first use.
  const history = useRef<StrokeHistory | null>(null);
  const getHistory = () => (history.current ??= new StrokeHistory());

  // Answers live on their own layer above the ink, never in the stroke list.
  const answerLayer = useRef<AnswerLayer | null>(null);
  // Counts recognition passes, so a slow, older pass cannot overwrite a newer one.
  const pass = useRef(0);

  // Draw one stroke as a smooth curve through the midpoints of its points.
  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const pts = stroke.points;
    if (pts.length === 0) return;

    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    if (pts.length === 1) {
      // A single tap: draw a dot.
      ctx.lineTo(pts[0].x + 0.01, pts[0].y);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  };

  // Wipe the canvas and repaint every stroke from the list.
  const redraw = () => {
    frameRequested.current = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // work in CSS pixels
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';

    for (const s of strokes.current) drawStroke(ctx, s);
    if (current.current) drawStroke(ctx, current.current);
  };

  // At most one repaint per display frame, however many pointer events arrive.
  const requestRedraw = () => {
    if (frameRequested.current) return;
    frameRequested.current = true;
    requestAnimationFrame(redraw);
  };

  // Match the canvas's pixel size to its on-screen size times the device pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const layer = (answerLayer.current ??= new AnswerLayer(overlay));

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      redraw();
      layer.resize();
    };

    resize();
    // The paper's size depends on the toolbar and window, so watch the canvas itself.
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Convert a pointer event's position to canvas coordinates.
  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Read every line again, then draw the answers. Runs only after a change to
  // the strokes, never on pointer-move.
  const recompute = () => {
    const layer = answerLayer.current;
    const id = ++pass.current;
    if (strokes.current.length === 0) {
      layer?.show([]);
      return;
    }
    layer?.setPending();
    recognizeLines(strokes.current).then(
      (lines) => {
        if (id !== pass.current) return;
        for (const line of lines)
        {
            const result = solve(line.text);
            console.log('Read:', line.text, '→', result ? (result.ok ? result.text : result.error) : '(no = yet)');
        }
        layer?.show(toAnswers(lines));
      },
      () => {
        if (id === pass.current) layer?.show([]);
      },
    );
  };

  // Repaint, re-read the page, and update the Undo/Redo buttons after any change.
  const afterChange = () => {
    const h = getHistory();
    setCanUndo(h.canUndo);
    setCanRedo(h.canRedo);
    setIsEmpty(h.strokes.length === 0);
    requestRedraw();
    recompute();
  };

  // Save the current stroke list as a new undo step, if it changed.
  const commit = () => {
    const h = getHistory();
    if (strokes.current === h.strokes) return;
    h.push(strokes.current);
    afterChange();
  };

  const undo = () => {
    const h = getHistory();
    if (!h.undo()) return;
    strokes.current = h.strokes;
    afterChange();
  };

  const redo = () => {
    const h = getHistory();
    if (!h.redo()) return;
    strokes.current = h.strokes;
    afterChange();
  };

  // Wipe the page. This is one undo step, so Undo brings the ink back.
  const clear = () => {
    if (strokes.current.length === 0) return;
    strokes.current = [];
    commit();
  };

  // Stroke eraser: remove every stroke the eraser touches.
  const eraseAt = (p: Point) => {
    const before = strokes.current.length;
    strokes.current = strokes.current.filter((s) => !hitsStroke(p, s));
    if (strokes.current.length !== before) requestRedraw();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === 'eraser') {
      erasing.current = true;
      eraseAt(toPoint(e));
      return;
    }

    current.current = { points: [toPoint(e)], width: penWidth };
    requestRedraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Coalesced events give every sampled position between frames.
    const native = e.nativeEvent;
    const events = native.getCoalescedEvents?.() ?? [];
    const samples = events.length > 0 ? events : [native];

    if (erasing.current) {
      for (const ev of samples) eraseAt(toPoint(ev));
      return;
    }

    if (!current.current) return;
    for (const ev of samples) current.current.points.push(toPoint(ev));
    requestRedraw();
  };

  const onPointerUp = () => {
    // A whole eraser drag is one undo step.
    if (erasing.current) {
      erasing.current = false;
      commit();
      return;
    }
    if (!current.current) return;

    // Replace the list instead of mutating it, so undo/redo can keep old versions.
    strokes.current = [...strokes.current, current.current];
    current.current = null;
    commit();
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          <LogoIcon />
          CalcInk
        </h1>
        <p className="tagline">write it, get the answer</p>
      </header>

      <nav className="toolbar" aria-label="Drawing tools">
        <div className="group" role="group" aria-label="Tools">
          <span className="group-label">Tools</span>
          <button
            className="tool"
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
            onClick={() => setTool('pen')}
          >
            <PenIcon />
            <span className="label">Pen</span>
          </button>
          <button
            className="tool"
            aria-label="Eraser"
            aria-pressed={tool === 'eraser'}
            onClick={() => setTool('eraser')}
          >
            <EraserIcon />
            <span className="label">Eraser</span>
          </button>
        </div>

        <div className="group" role="group" aria-label="History">
          <span className="group-label">History</span>
          <button className="tool" aria-label="Undo" onClick={undo} disabled={!canUndo}>
            <UndoIcon />
            <span className="label">Undo</span>
          </button>
          <button className="tool" aria-label="Redo" onClick={redo} disabled={!canRedo}>
            <RedoIcon />
            <span className="label">Redo</span>
          </button>
        </div>

        <div className="group" role="group" aria-label="Canvas">
          <span className="group-label">Canvas</span>
          <button className="tool danger" aria-label="Clear" onClick={clear} disabled={isEmpty}>
            <ClearIcon />
            <span className="label">Clear</span>
          </button>
        </div>

        <div className="group width-control">
          <label className="group-label" htmlFor="pen-width">Width</label>
          <input
            id="pen-width"
            className="width-slider"
            type="range"
            min={MIN_WIDTH}
            max={MAX_WIDTH}
            step={1}
            value={penWidth}
            aria-valuetext={`${penWidth} pixels`}
            onChange={(e) => setPenWidth(Number(e.target.value))}
          />
          <span className="width-preview" aria-hidden="true">
            <span className="width-dot" style={{ width: penWidth, height: penWidth }} />
          </span>
        </div>
      </nav>

      <main className="paper-card">
        <canvas
          ref={canvasRef}
          className="ink-canvas"
          aria-label="Writing area. Write a sum ending in an equals sign."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
        />

        {/* Answers, drawn above the ink. Clicks and pen input pass straight through. */}
        <canvas ref={overlayRef} className="answer-canvas" aria-hidden="true" />
      </main>

      {/* A ResultPanel, when added, goes here as <section className="result-panel">:
          under the paper on desktop, a compact bar on mobile. */}
    </div>
  );
}
