# CalcInk

A web-based digital notebook that reads handwritten arithmetic and writes the
answer next to it, entirely in the browser. Nothing is sent to a server.

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
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the math engine's unit tests |

**Requirements:** Node 18 or newer. No API keys, no backend, no network access
after the first load.

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
30, drawn on the canvas
```

### Strokes are stored as coordinates, not pixels

Every stroke is kept as the list of points it was drawn through. This one
decision makes most of the rest possible: the eraser can remove a stroke by
measuring distance to it, symbols can be regrouped without re-reading the
screen, operators can be identified from stroke angles, and the whole page can
be re-read after any edit.

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
JavaScript file rather than a model file. The weights were copied unchanged
into ONNX format so they can run under ONNX Runtime Web. No training or
fine-tuning was performed, and the converted model's outputs match the original
implementation to within 1e-6. The conversion script is in
`tools/convert-math-symbols.md`.

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

### When the app refuses to answer

A line is only evaluated if it contains a real binary operation — something
followed by `+`, `−`, `×` or `÷`. Neither model has a "this is not a symbol"
class, so a letter or a stray mark is always classified as *some* digit. We
measured confidence as a possible filter and rejected it: the digit model
assigns handwritten `B`, `D` and `k` a confidence of 1.00, and 13 of 30 random
scribbles scored above 0.9. Structural validation is the reliable guard, so
`A B C =` produces nothing while `12 + 7 =` is answered.

### Tests

```bash
npm test
```

19 unit tests covering precedence, associativity, brackets, decimals, negative
numbers, floating-point rounding, division by zero, malformed input, and the
rules for when a line should not be answered.

---

## Performance and runtime constraints

- **Inference runs in a Web Worker** (`src/recognize/worker.ts`), so neither
  model ever blocks the main thread or the drawing loop.
- **The canvas repaints at most once per display frame.** Pointer events can
  arrive 100–200 times per second; a `requestAnimationFrame` guard collapses
  them into a single repaint, and coalesced pointer events are used so no
  input is lost.
- **Re-reading the whole page took roughly 10–15 ms** in development on a page
  of four expressions, including both models.
- **The canvas scales for `devicePixelRatio`**, so ink stays sharp on
  high-density displays.

## On-device operation

Both `.onnx` files and the ONNX Runtime WebAssembly binary are bundled with the
application and served from its own origin — no CDN, no inference API. After
the first load the application performs no network requests, which can be
verified in the browser's Network tab.

---

## Project structure

```
calcink/
├── public/models/
│   ├── mnist-12.onnx           digit model
│   └── math-symbols.onnx       symbol model
├── src/
│   ├── canvas/canvas.tsx       drawing, eraser, answer rendering
│   ├── recognize/
│   │   ├── index.ts            reading pipeline, geometry rules
│   │   ├── segment.ts          stroke → symbol → line grouping
│   │   ├── preProcessing.ts    strokes → model input images
│   │   └── worker.ts           both models, off the main thread
│   └── math/
│       ├── parser.ts           tokenizer, shunting-yard, evaluator
│       └── parser.test.ts      unit tests
└── tools/
    └── convert-math-symbols.md how the symbol model was converted to ONNX
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

React 19, TypeScript, Vite, ONNX Runtime Web (WASM backend), Vitest.
Rendering uses the Canvas 2D API with Pointer Events, so mouse, stylus and
touch are handled by the same code path.

---

## Known limitations

Stated plainly rather than discovered by the reader:

- **Letters and doodles cannot be rejected by the models.** Both must output
  one of their classes. The structural check described above is the mitigation;
  a model trained with a "not a symbol" class would be the proper fix.
- **`=`, `÷` and `.` depend on geometric rules,** so unusual handwriting for
  those three can fail where a model might have generalised.
- **Symbols must not touch.** Segmentation works on bounding boxes, so digits
  written joined together are read as one symbol.
- **First load is large** because the ONNX Runtime WebAssembly binary is around
  14 MB. Subsequent loads are served from cache.
- **Accuracy was measured on programmatically generated strokes** during
  development, not on a labelled corpus of real handwriting.

---

## Credits

- Digit model: [ONNX Model Zoo](https://github.com/onnx/models) — MNIST
- Symbol model: [Maciej Caputa](https://github.com/MaciejCaputa/handwritten-mathematics-recogniser),
  MIT licence, trained on CROHME-derived data
- Inference: [ONNX Runtime Web](https://onnxruntime.ai/)

Built for the Inter-IIT Software Development Bootcamp.
