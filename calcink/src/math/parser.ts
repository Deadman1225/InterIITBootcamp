// Safe arithmetic for CalcInk. No eval(): the text is split into tokens,
// reordered with the shunting-yard algorithm, then computed with a stack.
//
// Accepts digits, decimals, + - * / (also × and ÷), brackets, and a leading
// or nested minus sign such as "-8*0.25" or "3*-2".

export type Result =
  | { ok: true; value: number; text: string } // text is the value, ready to display
  | { ok: false; error: 'Undefined' | 'Invalid' };

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | 'neg' } // 'neg' is the minus in "-5"
  | { kind: 'open' }
  | { kind: 'close' };

const INVALID: Result = { ok: false, error: 'Invalid' };
const UNDEFINED: Result = { ok: false, error: 'Undefined' };

// ---- Step 1: tokenizer ---------------------------------------------------
// "12+7*3" → 12, +, 7, *, 3. Returns null if a character or number is malformed.
const tokenize = (text: string): Token[] | null => {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === ' ') {
      i++;
      continue;
    }

    // A number: digits with at most one decimal point, e.g. "12", "0.5", ".5".
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let end = i;
      let dots = 0;
      while (end < text.length && ((text[end] >= '0' && text[end] <= '9') || text[end] === '.')) {
        if (text[end] === '.') dots++;
        end++;
      }
      const piece = text.slice(i, end);
      if (dots > 1 || piece === '.') return null;
      tokens.push({ kind: 'number', value: Number(piece) });
      i = end;
      continue;
    }

    if (ch === '(') tokens.push({ kind: 'open' });
    else if (ch === ')') tokens.push({ kind: 'close' });
    else if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '×' || ch === '÷') {
      const op = ch === '×' ? '*' : ch === '÷' ? '/' : ch;

      // A + or - is a sign, not an operation, when nothing it could act on
      // comes before it: at the start, after another operator, or after "(".
      const previous = tokens[tokens.length - 1];
      const isSign = !previous || previous.kind === 'op' || previous.kind === 'open';

      if (isSign && op === '-') tokens.push({ kind: 'op', op: 'neg' });
      else if (isSign && op === '+') {
        // "+5" is just 5, so the sign is dropped.
      } else if (isSign) return null; // "*" or "/" with nothing before it
      else tokens.push({ kind: 'op', op });
    } else return null; // a character that does not belong in arithmetic

    i++;
  }
  return tokens;
};

// ---- Step 2: shunting-yard -----------------------------------------------
// Reorders tokens into postfix, where each operator comes after its numbers:
// 12 + 7 * 3  →  12 7 3 * +     This is what makes × and ÷ happen before + and −.
const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3 };

const toPostfix = (tokens: Token[]): Token[] | null => {
  const output: Token[] = [];
  const stack: Token[] = []; // operators and "(" waiting for their turn

  for (const token of tokens) {
    if (token.kind === 'number') {
      output.push(token);
    } else if (token.kind === 'op') {
      // Before this operator waits, move out any waiting operator that must
      // run first: one with higher precedence, or equal precedence for the
      // left-to-right operators (so 8-3-2 is (8-3)-2).
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.kind !== 'op') break;
        const runsFirst =
          PRECEDENCE[top.op] > PRECEDENCE[token.op] ||
          (PRECEDENCE[top.op] === PRECEDENCE[token.op] && token.op !== 'neg');
        if (!runsFirst) break;
        output.push(stack.pop()!);
      }
      stack.push(token);
    } else if (token.kind === 'open') {
      stack.push(token);
    } else {
      // ")": move out everything back to the matching "(".
      while (stack.length > 0 && stack[stack.length - 1].kind !== 'open') output.push(stack.pop()!);
      if (stack.length === 0) return null; // ")" with no "("
      stack.pop();
    }
  }

  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.kind === 'open') return null; // "(" never closed
    output.push(top);
  }
  return output;
};

// ---- Step 3: evaluator ---------------------------------------------------
// Walks the postfix list with a stack of numbers. Each operator takes the
// numbers it needs off the stack and puts its result back.
const compute = (postfix: Token[]): Result => {
  const stack: number[] = [];

  for (const token of postfix) {
    if (token.kind === 'number') {
      stack.push(token.value);
    } else if (token.kind === 'op' && token.op === 'neg') {
      if (stack.length < 1) return INVALID;
      stack.push(-stack.pop()!);
    } else if (token.kind === 'op') {
      if (stack.length < 2) return INVALID; // e.g. "5+" has nothing after the +
      const right = stack.pop()!;
      const left = stack.pop()!;
      if (token.op === '+') stack.push(left + right);
      else if (token.op === '-') stack.push(left - right);
      else if (token.op === '*') stack.push(left * right);
      else {
        if (right === 0) return UNDEFINED; // division by zero
        stack.push(left / right);
      }
    }
  }

  if (stack.length !== 1) return INVALID; // e.g. "2 3" leaves two numbers
  const value = stack[0];
  if (!Number.isFinite(value)) return UNDEFINED;

  // Round away floating-point noise, so 0.1+0.2 shows 0.3, not 0.30000000000000004.
  const rounded = Number(value.toPrecision(12));
  return { ok: true, value: rounded, text: String(rounded) };
};

// ---- Public functions ----------------------------------------------------

// Work out an expression such as "18+4*3". Never throws.
export function evaluate(expression: string): Result {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return INVALID;
  const postfix = toPostfix(tokens);
  if (!postfix) return INVALID;
  return compute(postfix);
}

// For a recognised line of handwriting. Returns null when the line has no "="
// yet, because there is nothing to answer until the equals sign is written.
export function solve(line: string): Result | null {
  const equals = line.indexOf('=');
  if (equals === -1) return null;
  return evaluate(line.slice(0, equals));
}