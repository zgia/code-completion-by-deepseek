'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { trimContext, normalizeCompletion, delay } = require('../out/completion');

test('bounds context while retaining code closest to the cursor', () => {
  const context = trimContext('x'.repeat(20000) + 'cursor', 'next' + 'y'.repeat(10000));
  assert.equal(context.prefix.length, 12000);
  assert.ok(context.prefix.endsWith('cursor'));
  assert.equal(context.suffix.length, 4000);
  assert.ok(context.suffix.startsWith('next'));
  const lines = trimContext(Array(100).fill('before').join('\n'), Array(100).fill('after').join('\n'));
  assert.equal(lines.prefix.split('\n').length, 81);
  assert.equal(lines.suffix.split('\n').length, 21);
});

test('keeps significant whitespace and intentionally repeated prefix characters', () => {
  assert.equal(normalizeCompletion('a', { prefix: 'a', suffix: '' }, 3), 'a');
  assert.equal(normalizeCompletion('\n    return a + b;\n', { prefix: 'function add(a, b) {', suffix: '}' }, 3), '\n    return a + b;\n');
  assert.equal(normalizeCompletion(' value', { prefix: 'return', suffix: ';' }, 3), ' value');
});

test('removes code fences and existing suffix without inserting duplicate delimiters', () => {
  assert.equal(normalizeCompletion('```js\n42);\n```', { prefix: 'call(', suffix: ');' }, 3), '42');
  assert.equal(normalizeCompletion('one\ntwo\nthree', { prefix: '', suffix: '' }, 2), 'one\ntwo');
  assert.equal(normalizeCompletion('   ', { prefix: '', suffix: '' }, 3), '');
});

test('debounce rejects both prior and subsequent cancellation', async () => {
  const controller = new AbortController();
  const pending = delay(10000, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(delay(10000, controller.signal), { name: 'AbortError' });
});

test('PHP punctuation overlap does not truncate member-access code', () => {
  const cases = [
    ['return $x;', ';', 'return $x'],
    ['->where(', ');', '->where('],
    ['}', '}', ''],
    ['];', '];', ''],
    ["$query->where('active', true);", ');', "$query->where('active', true"],
  ];
  for (const [raw, suffix, expected] of cases) {
    assert.equal(normalizeCompletion(raw, { prefix: '', suffix }, 3), expected);
  }
});

test('intentional identifier, string and newline overlap remains intact', () => {
  for (const [raw, suffix] of [['a', 'a'], ['$user', 'user;'], ['hello', 'lo"'], ['return $x;\n', '\n}']]) {
    assert.equal(normalizeCompletion(raw, { prefix: '', suffix }, 3), raw);
  }
});
