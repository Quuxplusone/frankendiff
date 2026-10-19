import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeDiff } from '../scripts/diff'
import { DiffOp } from '../lib/types'

/** The text each side of a diff reconstructs to: 1818 = equal + delete, 1831 = equal + insert. */
function reconstruct(ops: DiffOp[]): { a: string; b: string } {
  return {
    a: ops.filter((o) => o.type !== 'insert').map((o) => o.text).join(''),
    b: ops.filter((o) => o.type !== 'delete').map((o) => o.text).join(''),
  }
}

function assertRoundTrip(a: string, b: string) {
  const ops = computeDiff(a, b)
  const r = reconstruct(ops)
  assert.equal(r.a, a, 'delete + equal ops must reproduce the 1818 text')
  assert.equal(r.b, b, 'insert + equal ops must reproduce the 1831 text')
  return ops
}

test('identical texts are a single equal op', () => {
  assert.deepEqual(computeDiff('The same.', 'The same.'), [{ type: 'equal', text: 'The same.' }])
})

test('a one-word change keeps the surrounding words equal', () => {
  const ops = assertRoundTrip('Every one adored Elizabeth.', 'Every one loved Elizabeth.')
  assert.deepEqual(ops, [
    { type: 'equal', text: 'Every one ' },
    { type: 'delete', text: 'adored' },
    { type: 'insert', text: 'loved' },
    { type: 'equal', text: ' Elizabeth.' },
  ])
})

test('a shared word between two insertions is kept on both sides (Letter, Chapter VI)', () => {
  // Regression: the "semantic island" cleanup absorbed a short equal run into
  // both neighbours; when both were insertions the word appeared twice in
  // 1831 and vanished from 1818 ("Justine Moritz Justine Moritz").
  const a = '"And now I must tell you a little story that will please, and perhaps amuse you. Do you not remember Justine Moritz? Probably you do not.'
  const b = '"Little alteration, except the growth of our dear children, has taken place since you left us. My trifling occupations take up my time and amuse me. Do you remember on what occasion Justine Moritz entered our family? Probably you do not.'
  const ops = assertRoundTrip(a, b)
  const inserted = ops.filter((o) => o.type === 'insert').map((o) => o.text).join('')
  const deleted = ops.filter((o) => o.type === 'delete').map((o) => o.text).join('')
  assert.ok((inserted.match(/Justine Moritz/g) ?? []).length <= 1, 'the shared name must not be duplicated on the 1831 side')
  assert.ok((inserted.match(/amuse/g) ?? []).length <= 1, '"amuse" must not be duplicated on the 1831 side')
  assert.ok(deleted.includes('amuse you'), '"amuse you" must survive on the 1818 side')
})

test('a full rewrite collapses to one delete and one insert', () => {
  const a = 'My father had a sister whom he tenderly loved.'
  const b = 'From Italy they visited Germany and France with the utmost care.'
  const ops = assertRoundTrip(a, b)
  assert.deepEqual(ops.map((o) => o.type), ['delete', 'insert'])
})

test('never produces empty or adjacent same-type ops', () => {
  const a = 'She busied herself in following the aërial creations of the poets. The world was to me a secret, which I desired to discover.'
  const b = 'She busied herself with following the aerial creations of the poets; and in the majestic scenes she found delight. The world was to me a secret which I desired to divine.'
  const ops = assertRoundTrip(a, b)
  for (let i = 0; i < ops.length; i++) {
    assert.ok(ops[i].text.length > 0, 'empty op')
    if (i > 0) assert.notEqual(ops[i].type, ops[i - 1].type, 'adjacent ops of the same type')
  }
})

test('a word with a curly apostrophe is one token, like one with a straight apostrophe', () => {
  const ops = assertRoundTrip('my father’s house', 'my brother’s house')
  assert.deepEqual(ops, [
    { type: 'equal', text: 'my ' },
    { type: 'delete', text: 'father’s' },
    { type: 'insert', text: 'brother’s' },
    { type: 'equal', text: ' house' },
  ])
})

test('an escaped asterisk stays with its backslash', () => {
  const ops = assertRoundTrip('from the eye\\*.', 'from the eye.')
  assert.deepEqual(ops, [
    { type: 'equal', text: 'from the eye' },
    { type: 'delete', text: '\\*' },
    { type: 'equal', text: '.' },
  ])
})

// ── Clause splitting ────────────────────────────────────────────────────────

import { splitClauses } from '../scripts/diff'

test('clauses end after sentence and clause punctuation, keeping their trailing space', () => {
  const text = 'She died calmly; and her countenance expressed affection even in death. It is so long! Is it? Yes: quite.'
  const clauses = splitClauses(text)
  assert.deepEqual(clauses, [
    'She died calmly; ',
    'and her countenance expressed affection even in death. ',
    'It is so long! ',
    'Is it? ',
    'Yes: ',
    'quite.',
  ])
  assert.equal(clauses.join(''), text, 'clauses concatenate back to the text')
})

test('abbreviations and a closing quote do not end a clause early', () => {
  assert.deepEqual(splitClauses('I met M. Krempe and Mr. Waldman. "Go on." She went.'), [
    'I met M. Krempe and Mr. Waldman. ',
    '"Go on." ',
    'She went.',
  ])
})

test('a paragraph break always ends a clause', () => {
  assert.deepEqual(splitClauses('First paragraph\n\nSecond one.'), ['First paragraph\n\n', 'Second one.'])
})

// ── Passages from reader feedback ───────────────────────────────────────────

test('a shared opening sentence is diffed even when the rest of the paragraph was rewritten (Chapter I)', () => {
  const a = 'Every one adored Elizabeth. If the servants had any request to make, it was always through her intercession. We were strangers to any species of disunion and dispute; for although there was a great dissimilitude in our characters, there was an harmony in that very dissimilitude.'
  const b = 'Every one loved Elizabeth. The passionate and almost reverential attachment with which all regarded her became, while I shared it, my pride and my delight. On the evening previous to her being brought to my home, my mother had said playfully,—"I have a pretty present for my Victor—to-morrow he shall have it."'
  const ops = assertRoundTrip(a, b)
  assert.deepEqual(ops.slice(0, 4), [
    { type: 'equal', text: 'Every one ' },
    { type: 'delete', text: 'adored' },
    { type: 'insert', text: 'loved' },
    { type: 'equal', text: ' Elizabeth. ' },
  ])
  assert.deepEqual(ops.slice(4).map((o) => o.type), ['delete', 'insert'], 'the rest is one replacement')
})

test('a sentence kept in the middle of a rewritten paragraph is aligned (Clerval, Chapter I)', () => {
  const a = 'My brothers were considerably younger than myself; but I had a friend in one of my schoolfellows, who compensated for this deficiency. Henry Clerval was the son of a merchant of Geneva, an intimate friend of my father. He was a boy of singular talent and fancy. I remember, when he was nine years old, he wrote a fairy tale, which was the delight and amazement of all his companions.'
  const b = 'It was my temper to avoid a crowd, and to attach myself fervently to a few. I was indifferent, therefore, to my schoolfellows in general; but I united myself in the bonds of the closest friendship to one among them. Henry Clerval was the son of a merchant of Geneva. He was a boy of singular talent and fancy. He loved enterprise, hardship, and even danger, for its own sake.'
  const ops = assertRoundTrip(a, b)
  const rendered = ops.map((o) => (o.type === 'equal' ? o.text : o.type === 'delete' ? `[-${o.text}-]` : `{+${o.text}+}`)).join('')
  assert.ok(
    rendered.includes('Henry Clerval was the son of a merchant of Geneva[-, an intimate friend of my father-]. He was a boy of singular talent and fancy. '),
    rendered,
  )
})

test('a rewritten opening followed by a lightly edited sentence (Justine, Chapter VI)', () => {
  const a = '"And now I must tell you a little story that will please, and perhaps amuse you. Do you not remember Justine Moritz? Probably you do not; I will relate her history, therefore, in a few words.'
  const b = '"Little alteration, except the growth of our dear children, has taken place since you left us. Do you remember on what occasion Justine Moritz entered our family? Probably you do not; I will relate her history, therefore, in a few words.'
  const ops = assertRoundTrip(a, b)
  const rendered = ops.map((o) => (o.type === 'equal' ? o.text : o.type === 'delete' ? `[-${o.text}-]` : `{+${o.text}+}`)).join('')
  assert.equal(
    rendered,
    '[-"And now I must tell you a little story that will please, and perhaps amuse you.-]{+"Little alteration, except the growth of our dear children, has taken place since you left us.+} Do you[- not-] remember{+ on what occasion+} Justine Moritz{+ entered our family+}? Probably you do not; I will relate her history, therefore, in a few words.',
  )
})

test('a changed clause boundary (comma to semicolon) does not break the diff (Chapter III)', () => {
  const a = 'He desired me to procure, and dismissed me, after mentioning that he intended to commence a course of lectures upon natural philosophy in its general relations, and that M. Waldman would lecture upon chemistry the alternate days that he missed.'
  const b = 'He desired me to procure; and dismissed me, after mentioning that he intended to commence a course of lectures upon natural philosophy in its general relations, and that M. Waldman would lecture upon chemistry the alternate days that he omitted.'
  const ops = assertRoundTrip(a, b)
  const rendered = ops.map((o) => (o.type === 'equal' ? o.text : o.type === 'delete' ? `[-${o.text}-]` : `{+${o.text}+}`)).join('')
  assert.equal(rendered, 'He desired me to procure[-,-]{+;+} and dismissed me, after mentioning that he intended to commence a course of lectures upon natural philosophy in its general relations, and that M. Waldman would lecture upon chemistry the alternate days that he [-missed-]{+omitted+}.')
})
