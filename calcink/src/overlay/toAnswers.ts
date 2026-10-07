import { solve } from '../math/parser';
import type { ReadLine } from '../recognize';
import type { Answer } from './answers';

const ANSWER_COLOR = '#1d4ed8';
const ERROR_COLOR = '#dc2626';

// Turn recognised lines into answers to draw. Only a line that ends in "=" gets
// one. Division by zero shows "Undefined"; unreadable input shows nothing.
export function toAnswers(lines: ReadLine[]): Answer[] {
  const answers: Answer[] = [];
  for (const line of lines) {
    if (!line.text.endsWith('=')) continue;
    const result = solve(line.text);
    if (!result) continue;
    if (result.ok) answers.push({ text: result.text, color: ANSWER_COLOR, equals: line.last, line: line.box });
    else if (result.error === 'Undefined')
      answers.push({ text: 'Undefined', color: ERROR_COLOR, equals: line.last, line: line.box });
  }
  return answers;
}
