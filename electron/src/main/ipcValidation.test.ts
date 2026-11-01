import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IpcValidationError,
  validateCopyText,
  validateId,
  validateKind,
  validateListOptions,
  validateSearchArgs,
  validateSnippetInput,
} from './ipcValidation';

const rejects = (fn: () => unknown) => assert.throws(fn, IpcValidationError);

test('validateId accepts positive safe integers only', () => {
  assert.equal(validateId(1), 1);
  assert.equal(validateId(42), 42);
  for (const bad of [0, -1, 1.5, '1', NaN, Number.MAX_SAFE_INTEGER + 1, undefined, null]) rejects(() => validateId(bad));
});

test('validateKind is case-sensitive and supports optional', () => {
  assert.equal(validateKind('CODE'), 'CODE');
  for (const bad of ['code', 'X', 1, undefined]) rejects(() => validateKind(bad));
  assert.equal(validateKind(undefined, true), undefined);
  rejects(() => validateKind('note', true));
});

test('validateSearchArgs', () => {
  assert.deepEqual(validateSearchArgs('  docker ', { kind: 'CODE', limit: 5 }), { q: 'docker', opts: { kind: 'CODE', limit: 5 } });
  assert.deepEqual(validateSearchArgs('x', undefined), { q: 'x', opts: {} });
  rejects(() => validateSearchArgs('   ', {}));
  rejects(() => validateSearchArgs(1, {}));
  rejects(() => validateSearchArgs('x'.repeat(201), {}));
  for (const limit of [0, 201, 1.5, '5']) rejects(() => validateSearchArgs('x', { limit }));
  rejects(() => validateSearchArgs('x', 'opts'));
  rejects(() => validateSearchArgs('x', []));
  rejects(() => validateSearchArgs('x', { kind: 'code' }));
});

test('validateListOptions', () => {
  assert.deepEqual(validateListOptions(undefined), {});
  assert.deepEqual(validateListOptions({ page: 0, size: 20, kind: 'NOTE' }), { page: 0, size: 20, kind: 'NOTE' });
  rejects(() => validateListOptions({ page: -1 }));
  rejects(() => validateListOptions({ size: 0 }));
  rejects(() => validateListOptions({ size: 101 }));
  rejects(() => validateListOptions(5));
});

test('validateSnippetInput', () => {
  assert.deepEqual(
    validateSnippetInput({ title: 't', content: 'c', tags: ['a'], kind: 'CODE', source: 'ALMA', extra: 1 }),
    { title: 't', content: 'c', tags: ['a'], kind: 'CODE' },
  );
  assert.deepEqual(validateSnippetInput({ title: 't' }), { title: 't' });
  rejects(() => validateSnippetInput(null));
  rejects(() => validateSnippetInput({ title: 5 }));
  rejects(() => validateSnippetInput({ title: 'x'.repeat(201) }));
  rejects(() => validateSnippetInput({ title: 't', content: 'x'.repeat(1_000_001) }));
  rejects(() => validateSnippetInput({ title: 't', content: 1 }));
  rejects(() => validateSnippetInput({ title: 't', tags: 'a' }));
  rejects(() => validateSnippetInput({ title: 't', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }));
  rejects(() => validateSnippetInput({ title: 't', tags: ['x'.repeat(41)] }));
  rejects(() => validateSnippetInput({ title: 't', tags: [1] }));
  rejects(() => validateSnippetInput({ title: 't', kind: 'BOGUS' }));
});

test('validateCopyText', () => {
  assert.equal(validateCopyText('hi'), 'hi');
  rejects(() => validateCopyText(1));
  rejects(() => validateCopyText('x'.repeat(1_000_001)));
});
