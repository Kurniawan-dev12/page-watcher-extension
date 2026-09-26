import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumber, evaluate, formatAlert, describeCondition, sameUrl, timeAgo, escapeHtml,
} from '../extension/lib/core.js';

test('parseNumber handles common price formats', () => {
  const cases = [
    ['$129.00', 129],
    ['$1,299.00', 1299],
    ['Rp 1.250.000', 1250000],
    ['1.299,50 €', 1299.5],
    ['Price: 99.99.', 99.99],
    ['In stock (12)', 12],
    ['12,5', 12.5],
    ['-3.2%', -3.2],
    ['S$ 1 049,00', 1049],
    ['no number here', null],
    [null, null],
  ];
  for (const [input, expected] of cases) {
    assert.equal(parseNumber(input), expected, `input: ${input}`);
  }
});

test('changed: fires only when a previous value exists and differs', () => {
  const w = { condition: 'changed' };
  assert.equal(evaluate(w, null, '$129').triggered, false);
  assert.equal(evaluate(w, '$129', '$129').triggered, false);
  assert.equal(evaluate(w, '$129', '$99').triggered, true);
});

test('below: fires when crossing, not while staying below', () => {
  const w = { condition: 'below', threshold: 100 };
  assert.equal(evaluate(w, '$129.00', '$99.00').triggered, true);
  assert.equal(evaluate(w, '$99.00', '$89.00').triggered, false);
  assert.equal(evaluate(w, '$89.00', '$129.00').triggered, false);
  assert.equal(evaluate(w, null, '$50').triggered, true, 'first reading already below');
});

test('above: fires when crossing upward', () => {
  const w = { condition: 'above', threshold: '1000' };
  assert.equal(evaluate(w, '900', '1,200').triggered, true);
  assert.equal(evaluate(w, '1,200', '1,300').triggered, false);
});

test('contains: case-insensitive and fires once', () => {
  const w = { condition: 'contains', threshold: 'in stock' };
  assert.equal(evaluate(w, 'Sold out', 'In Stock (3)').triggered, true);
  assert.equal(evaluate(w, 'In Stock (3)', 'In Stock (2)').triggered, false);
});

test('missing element never triggers', () => {
  assert.equal(evaluate({ condition: 'changed' }, '$1', null).triggered, false);
});

test('formatAlert and describeCondition', () => {
  const w = { label: 'Earbuds price', condition: 'below', threshold: 100 };
  const { title, body } = formatAlert(w, '$129.00', '$89.00');
  assert.match(title, /Earbuds price/);
  assert.match(body, /Now \$89\.00/);
  assert.match(body, /Before: \$129\.00/);
  assert.equal(describeCondition({ condition: 'changed' }), 'any change');
});

test('helpers', () => {
  assert.equal(sameUrl('https://a.com/p#x', 'https://a.com/p'), true);
  assert.equal(sameUrl('https://a.com/p?id=1', 'https://a.com/p?id=2'), false);
  assert.equal(timeAgo(0), 'never');
  assert.equal(timeAgo(1_000, 31_000), '30s ago');
  assert.equal(timeAgo(0 + 1, 1 + 3 * 3600_000), '3h ago');
  assert.equal(escapeHtml('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
});
