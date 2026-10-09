# CalcInk

A web-based digital notebook that reads handwritten arithmetic and writes the
answer next to it, entirely in the browser. No backend, no inference API.

**Live:** https://inter-iit-ps.vercel.app

Write `18 + 4 × 3 =` on the canvas and the result appears beside the equals
sign. Erase a digit and the answer updates itself.

---

## Quick start

```bash
git clone https://github.com/Deadman1225/InterIITBootcamp.git
cd InterIITBootcamp/calcink
npm install
npm run dev
```

Open the address printed in the terminal (usually `http://localhost:5173`).

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests (Vitest) |
| `npm run lint` | ESLint |

**Requirements:** Node `^20.19.0 || >=22.12.0` (required by Vite 8). No API
keys and no backend.

---

## How it works

Everything below happens in the browser each time you lift the pen.

```
pointer events
      ↓
strokes as point arrays            canvas/canvas.tsx
      ↓
group strokes into symbols         recognize/segment.ts
and symbols into lines
      ↓
read each symbol                   recognize/index.ts
  ├─ geometry rules  →  = ÷ . + × −
  ├─ symbol model    →  operator or digit?
  └─ digit model     →  which digit?
      ↓
"18+4*3="
      ↓
tokenize → shunting-yard → evaluate     math/parser.ts
      ↓
30, drawn on the answer layer      overlay/answers.ts
```

### Strokes are stored as coordinates, not pixels

Every stroke is kept as the list of points it was drawn through. This one
decision makes most of the rest possible: the eraser can remove a stroke by
measuring distance to it, symbols can be regrouped without re-reading the
screen, operators can be identified from stroke angles, and the whole page can
be re-read after any edit.

### Two canvases

The ink and the answers live on separate, exactly overlapping canvases.

| | Ink canvas | Answer canvas |
|---|---|---|
| Owner | `canvas/canvas.tsx` | `overlay/answers.ts` (`AnswerLayer`) |
| Input | all pointer events, `touch-action: none` | `pointer-events: none` |
| Repaints on | stroke change, resize | answer change, resize, fade, font load |

Answers are never added to the stroke list, so they cannot be erased or undone,
and — more importantly — they are never fed back into recognition. If an answer
were ink, the next pass would read it as handwriting and solve it again.

### Segmentation

Strokes merge into one symbol when their bounding boxes overlap horizontally by
at least half the narrower box and are close vertically. That joins the two
bars of `=`, the bar and dots of `÷`, and the two strokes of `+`, `×` and `4`.

Symbols are then grouped into lines by vertical position, and a line is split
wherever the horizontal gap between neighbouring symbols exceeds 1.5× the line
height, so two sums written side by side are solved separately.

---

## The two pre-trained models

Both are bundled in `public/models/` and loaded from the app's own origin.
Neither was trained or fine-tuned by us.

### 1. `mnist-12.onnx` — digits

| | |
|---|---|
| Role | Reads the digits 0–9 |
| Source | [ONNX Model Zoo — MNIST](https://github.com/onnx/models/tree/main/validated/vision/classification/mnist) |
| Size | 26 KB |
| Architecture | Convolutional network. Input `[1, 1, 28, 28]` grayscale image; output 10 scores |
| Training data | MNIST, 60,000 handwritten digits |
| License | See the model's page in the ONNX Model Zoo |

### 2. `math-symbols.onnx` — operators, brackets and digits

| | |
|---|---|
| Role | Decides operator vs. digit, and reads `+ − × ( )` |
| Source | [handwritten-mathematics-recogniser v0.0.6](https://github.com/MaciejCaputa/handwritten-mathematics-recogniser) by Maciej Caputa |
| Size | 2 MB |
| Architecture | Dense network 1024 → 503 → 17, ReLU and softmax. Input `[n, 1024]`, a flattened 32×32 binary image |
| Classes | `( ) + - . 0 1 2 3 4 5 6 7 8 9 √ ×` |
| Training data | 21 classes extracted from CROHME, ~60,000 images augmented to ~180,000 |
| License | MIT |

**Conversion note.** The upstream package ships its trained weights as a 16 MB
JavaScript file rather than a model file. The weights were read out of that file
and written unchanged into ONNX format so they can run under ONNX Runtime Web:
two dense layers with their bias vectors, ReLU between them and softmax at the
end, matching the upstream forward pass. No training or fine-tuning was
performed. The conversion script is not currently checked into this repository
— see [Roadmap](#roadmap).

### Why two models

MNIST is small and highly accurate but knows only digits. The symbol model
covers operators and brackets but is noticeably weaker at telling digits apart:
in our testing it misread most handwritten 5s as 3s. Combining them plays to
each one's strength — the symbol model answers "is this an operator or a
digit?", and when the answer is a digit, MNIST decides which one.

Every operator the symbol model proposes must also pass a geometric check
(a `−` must actually be flat, a `+` must be two straight crossing strokes)
before it is accepted. This prevents a `4` from being read as `+`.

---

## Symbols read by geometry rather than by a model

`=`, `÷` and `.` are identified from stroke layout, not by either network:

| Symbol | Rule |
|---|---|
| `.` | The whole symbol is tiny relative to the line height |
| `=` | Two near-level straight strokes that do not cross |
| `+` | Two straight crossing strokes whose angles differ by more than 40° |
| `×` | Two straight crossing strokes at similar angles |
| `÷` | A flat bar with one dot above and one below |
| `−` | A single flat straight stroke |

This is a deliberate design decision, not a shortcut. `=` and `÷` are not among
either model's classes, and both are composed of separate marks. Angle-based
rules were chosen over bounding-box rules because slanted handwriting tilts
every bounding box while leaving the angle *between* two strokes unchanged —
measured on tilted test input, box-based rules misread `=` as `2` and `+` as
`4`, while angle-based rules read both correctly.

The thresholds in these rules (straightness 0.75, angle gap 40°, flatness 0.5,
dot size 0.2× line height) were tuned by hand during development and are not
backed by a validation set.

---

## Math engine

`src/math/parser.ts` — no `eval()`, no `Function()`, no dynamic code execution
anywhere in the project.

1. **Tokenizer** splits the recognised text into numbers and operators,
   handling decimals and distinguishing a negative sign from subtraction.
2. **Shunting-yard** reorders the tokens into postfix form, giving `×` and `÷`
   precedence over `+` and `−`, with brackets and left-to-right associativity.
3. **Evaluator** computes the result with a stack.

Supports multi-digit integers, decimals, negative numbers, nested brackets, and
BODMAS precedence. Division by zero returns `Undefined`; malformed input
returns `Invalid`. Neither throws. Results are rounded to 12 significant digits
so `0.1 + 0.2` displays as `0.3`.

### When an answer is drawn

A recognised line produces a visible answer only when **both** hold:

- its text ends with `=`, and
- the expression before the `=` parses and evaluates.

Division by zero is drawn as `Undefined` in red. Anything that fails to parse
draws nothing at all, with no on-screen explanation — see
[Known issues](#known-issues).

Note that this rule is purely structural in the parsing sense: it does not
require the line to contain an actual operation. A line read as `123=` is
therefore answered with `123`. A stricter guard requiring a binary operator is
on the [roadmap](#roadmap) and is the intended mitigation for the fact that
neither model can reject a non-symbol (see
[Known limitations](#known-limitations)).

### Tests

```bash
npm test
```

9 tests in `src/overlay/placement.test.ts`, run with Vitest. They cover answer
placement (right of the `=`, wrapping below when it would overflow, and the
just-fits boundary), device-pixel conversion at ratios 1, 1.5 and 2, font
sizing against line height, and `toAnswers` for a solved line, division by zero
and unreadable input.

Coverage is limited to the overlay. The parser, segmentation and preprocessing
are verified by hand at present; extending the suite to the parser is the first
item on the [roadmap](#roadmap).

---

## Performance and runtime constraints

- **Inference runs in a Web Worker** (`src/recognize/worker.ts`), so neither
  model ever blocks the main thread or the drawing loop.
- **The canvas repaints at most once per display frame.** Pointer events can
  arrive 100–200 times per second; a `requestAnimationFrame` guard collapses
  them into a single repaint, and coalesced pointer events are used so no
  input is lost.
- **Re-reading the whole page took roughly 10–15 ms** in development on a page
  of four expressions, including both models. This was an informal measurement,
  not a benchmark.
- **The canvas scales for `devicePixelRatio`**, so ink stays sharp on
  high-density displays.
- **ONNX Runtime runs single-threaded** (`ort.env.wasm.numThreads = 1`) on the
  WASM backend. No GPU backend is attempted.
- **Recognition is not batched or debounced.** Each symbol is sent to the
  worker as its own request, and a full page re-read is queued on every
  completed stroke. See [Known issues](#known-issues).

## On-device operation

Both `.onnx` files and the ONNX Runtime WebAssembly binary are bundled with the
application and served from its own origin. There is no CDN and no inference
API: handwriting never leaves the browser, and the app makes no requests to any
third party at runtime.

There is **no service worker**, so this is not an offline-capable PWA. Repeat
loads are served from the browser's ordinary HTTP cache, and a hard reload
refetches the bundle, including the ~14 MB ONNX Runtime WebAssembly binary.

---

## Project structure

```
calcink/
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── models/
│       ├── mnist-12.onnx        digit model
│       └── math-symbols.onnx    symbol model
└── src/
    ├── main.tsx                 entry point
    ├── App.tsx                  renders Canvas
    ├── canvas/canvas.tsx        drawing, eraser, undo/redo, toolbar
    ├── history.ts              undo/redo stack
    ├── recognize/
    │   ├── index.ts             reading pipeline, geometry rules
    │   ├── segment.ts           stroke → symbol → line grouping
    │   ├── preProcessing.ts     strokes → model input arrays
    │   └── worker.ts            both models, off the main thread
    ├── math/parser.ts           tokenizer, shunting-yard, evaluator
    ├── overlay/
    │   ├── answers.ts           the answer canvas layer
    │   ├── placement.ts         where an answer is drawn
    │   ├── placement.test.ts    unit tests
    │   └── toAnswers.ts         recognised lines → answers to draw
    └── ui/icons.tsx             toolbar icons
```

### Preprocessing

The two models were trained on differently prepared images, so each has its own
conversion:

| | Digit model | Symbol model |
|---|---|---|
| Size | 28×28 | 32×32 |
| Values | 0 = background, 1 = ink | 1 = paper, 0 = ink |
| Fit | Scaled to 20px, 4px margin | Fills the frame |
| Centring | Centre of mass, both axes | Centre of mass, shorter axis |
| Extra | Anti-aliased by supersampling | Zhang-Suen thinning to 1px strokes |

Both rasterise strokes directly into arrays rather than onto a canvas element,
so they can run inside the worker.

---

## Tech stack

React 19, TypeScript, Vite 8 (with the React Compiler via Babel),
ONNX Runtime Web 1.30 (WASM backend), Vitest, `@fontsource/caveat` for the
handwritten answer font.

Rendering uses the Canvas 2D API with Pointer Events, so mouse, stylus and
touch are handled by the same code path. Stylus pressure is not used; pen width
comes from the toolbar slider.

---

## Known limitations

Design limits of the current approach, stated plainly rather than discovered by
the reader.

- **Accuracy has not been measured on real handwriting.** Development testing
  used programmatically generated strokes, not a labelled corpus. There is no
  accuracy figure for this project.
- **Letters and doodles cannot be rejected by the models.** Both must output
  one of their classes. We measured confidence as a possible filter and
  rejected it: the digit model assigns handwritten `B`, `D` and `k` a
  confidence of 1.00, and 13 of 30 random scribbles scored above 0.9.
  Structural validation is the intended guard, and is currently weaker than it
  should be (see [When an answer is drawn](#when-an-answer-is-drawn)).
- **MNIST is out of distribution for this input.** It was trained on scanned,
  thick, centred digits. Thin pointer-drawn strokes invite 1/7, 4/9 and 3/5
  confusion even with faithful preprocessing.
- **The symbol model is a dense network on raw pixels,** with no convolutions,
  so it is sensitive to stroke thickness. Zhang-Suen thinning in preprocessing
  exists to compensate for that.
- **`=`, `÷` and `.` depend on geometric rules,** so unusual handwriting for
  those three can fail where a model might have generalised.
- **Symbols must not touch.** Segmentation works on bounding boxes, so digits
  written joined together are read as one symbol. Conversely, a narrow symbol
  that overlaps a neighbour's box can be merged into it.
- **`√` is unreachable.** It is one of the symbol model's classes, but the
  reading pipeline accepts only `+ × − ( )` from that model and the parser has
  no square-root support, so a `√` prediction falls through to the digit model
  and returns a digit.
- **First load is large** because the ONNX Runtime WebAssembly binary is around
  14 MB.
- **No persistence.** Reloading the page clears the notebook. There is no save,
  export or local storage.
- **The eraser removes whole strokes,** not parts of them.
- **One fixed page.** No pan, zoom, scroll or multiple pages.
- **No keyboard shortcuts** for undo and redo.
- **Answers are not exposed to assistive technology.** The answer canvas is
  `aria-hidden`, so a screen-reader user can find the writing area but not read
  the result.
- **Scope.** Single-line arithmetic only: no fractions, exponents, stacked
  (column) arithmetic or variables.

## Known issues

Behaviour that is simply wrong rather than out of scope.

- **Every completed stroke queues a full page re-read, with no debounce and no
  cancellation.** A counter discards a stale pass's *result*, but the work still
  runs. Writing quickly builds a backlog of complete page reads that execute
  one after another, so the answer lags further behind the longer you write.
- **Inference is one request per symbol.** The symbol model's input shape
  `[n, 1024]` supports batching, but it is called with `[1, 1024]` once per
  symbol, and digits cost a second round trip to MNIST. A ten-symbol line is
  15–20 worker messages where it could be two.
- **The worker has a single reassigned `onmessage` handler and no request IDs.**
  This is correct only because reads are awaited sequentially and passes are
  serialised through a promise queue; any concurrent call would cross replies.
- **An eraser tap that removes nothing still creates an undo step,** because
  `Array.prototype.filter` always returns a new array and the change check
  compares by reference.
- **Model load failure is silent.** The worker posts `ready` and `error`
  messages that nothing listens for, and there is no timeout. If an `.onnx`
  file fails to load, writing a sum simply produces no answer and no message.
- **Unparseable input gives no feedback,** so a misread is indistinguishable
  from a broken app.
- **An answer can be drawn over existing ink.** Placement avoids the right edge
  of the view but does not check for collisions with strokes.
- **Recognition results are logged to the console** on every pass.

## Roadmap

In rough order of value:

1. Unit tests for `math/parser.ts`, then for `recognize/segment.ts` and the
   geometry rules.
2. Measure accuracy on a set of real handwritten expressions and publish the
   number.
3. Debounce recognition and cancel superseded passes.
4. Batch inference into one request per line, and tag worker messages with
   request IDs.
5. Require a binary operator before answering a line.
6. Surface model-load failures and unreadable input in the UI.
7. Check the model conversion script into `tools/`.
8. Persistence and export.

---

## Credits

- Digit model: [ONNX Model Zoo](https://github.com/onnx/models) — MNIST
- Symbol model: [Maciej Caputa](https://github.com/MaciejCaputa/handwritten-mathematics-recogniser),
  MIT licence, trained on CROHME-derived data
- Inference: [ONNX Runtime Web](https://onnxruntime.ai/)

Built for the Inter-IIT Software Development Bootcamp.
