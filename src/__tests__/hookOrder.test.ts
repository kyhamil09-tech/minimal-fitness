import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A hook (useState, useEffect, ...) after an early `return` in the same component changes how many hooks run between
 * renders, and React then throws and blanks the whole app. This guards against it: the workout summary once did exactly
 * that and a finished walk was lost.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });

export const hooksAfterEarlyReturn = (source: string): { line: number; early: number; code: string }[] => {
  const lines = source.replace(/^﻿/, '').split(/\r?\n/);
  const found: { line: number; early: number; code: string }[] = [];
  let inFunction = false;
  let early = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // A component or hook opens at column 0 and closes at column 0.
    if (/^(export )?(const|function) [A-Za-z]\w*.*(=>\s*\{|\)\s*\{)\s*$/.test(l) || /^export (default )?function /.test(l)) {
      inFunction = true;
      early = -1;
      continue;
    }
    if (/^\};?\s*$/.test(l)) {
      inFunction = false;
      early = -1;
      continue;
    }
    if (!inFunction) continue;
    const isEarlyReturn =
      /^ {2}if \(.*\) return\b.*;\s*$/.test(l) ||
      /^ {2}return null;\s*$/.test(l) ||
      (/^ {2}if \(.*\) \{\s*$/.test(l) && /^ {4}return\b/.test(lines[i + 1] ?? '') && /^ {2}\}\s*$/.test(lines[i + 2] ?? ''));
    if (early < 0 && isEarlyReturn) {
      early = i;
      continue;
    }
    if (early >= 0 && /^ {2}(const|let|var)? ?.*\buse[A-Z]\w*\s*\(/.test(l)) {
      found.push({ line: i + 1, early: early + 1, code: l.trim() });
    }
  }
  return found;
};

test('the checker catches a hook placed after an early return', () => {
  const broken = [
    'export const Broken = ({ w }) => {',
    '  const [a, setA] = useState(0);',
    '  if (!w) return null;',
    '  const [b, setB] = useState(false);',
    '  return null;',
    '};',
  ].join('\n');
  assert.equal(hooksAfterEarlyReturn(broken).length, 1);
  assert.equal(hooksAfterEarlyReturn(broken.replace('  if (!w) return null;\n', '')).length, 0);
});

test('no component calls a hook after an early return', () => {
  const problems: string[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const f of hooksAfterEarlyReturn(fs.readFileSync(file, 'utf8'))) {
      problems.push(`${path.relative(SRC, file)}:${f.line} uses a hook after the early return at line ${f.early}: ${f.code}`);
    }
  }
  assert.deepEqual(problems, []);
});
