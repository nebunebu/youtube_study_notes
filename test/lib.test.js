const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('../src/lib/util.js');
const prompts = require('../src/lib/prompts.js');
const pipeline = require('../src/lib/pipeline.js');
const htmlToMd = require('../src/lib/html-to-md.js');
const exporter = require('../src/lib/export.js');

// ---- fake DOM nodes for the converter ----
const txt = (s) => ({ nodeType: 3, textContent: s, childNodes: [] });
function el(tag, attrs, ...children) {
  const childNodes = children.map((c) => (typeof c === 'string' ? txt(c) : c));
  return {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes,
    getAttribute: (n) => (attrs && n in attrs ? attrs[n] : null),
    get textContent() {
      return childNodes.map((c) => c.textContent).join('');
    },
  };
}
const stamp = (label, sec) =>
  el('a', { class: 'ytwMarkdownDivTimestamp', 'data-time': String(sec), href: `?t=${sec}s` }, el('span', null, label), el('span', null));

test('time helpers', () => {
  assert.equal(util.parseTime('2:35'), 155);
  assert.equal(util.parseTime('1:02:03'), 3723);
  assert.equal(util.parseTime('abc'), null);
  assert.equal(util.fmtTime(155), '2:35');
  assert.equal(util.fmtTime(3723), '1:02:03');
  assert.equal(util.slug('All American Banknotes: Explained!'), 'all-american-banknotes-explained');
});

test('prompt templates fill and can be overridden', () => {
  const p = prompts.build('section', { start: '0:00', end: '3:00', titles: 'Intro', typeRule: prompts.typeRule('list') });
  assert.match(p, /from 0:00 to 3:00 \(Intro\)/);
  assert.match(p, /cover every single item/);
  assert.ok(!/\{\{/.test(p));
  assert.equal(prompts.build('gap', {}, { gap: 'custom {{x}}' }), 'custom {{x}}');
  assert.equal(prompts.build('gap', {}, { gap: '  ' }), prompts.DEFAULTS.gap);
});

test('parseOutline reads the real reply shape', () => {
  const md = 'TYPE: documentary\n\n0:00-1:00 $1 Bill\n1:00-1:51 $2 Bill\n1:51-2:36 $5 Bill\n7:59-8:41 $100,000 Bill';
  const o = pipeline.parseOutline(md, 520);
  assert.equal(o.type, 'documentary');
  assert.equal(o.sections.length, 4);
  assert.deepEqual(o.sections[0], { start: 0, end: 60, title: '$1 Bill' });
  // gaps are closed and the last section runs to the end of the video
  assert.equal(o.sections[2].end, 479);
  assert.equal(o.sections[3].end, 520);
});

test('parseOutline copes with bullets, links, bold and start-only lines', () => {
  const md = [
    '**TYPE:** Lecture',
    '- [0:00](https://youtu.be/x?t=0) – [5:00](https://youtu.be/x?t=300): **Intro**',
    '* 5:00 Main idea',
    '1. 1:10:00 - 1:20:00 Wrap up',
  ].join('\n');
  const o = pipeline.parseOutline(md, 4800);
  assert.equal(o.type, 'lecture');
  assert.deepEqual(o.sections.map((s) => [s.start, s.end, s.title]), [
    [0, 300, 'Intro'],
    [300, 4200, 'Main idea'],
    [4200, 4800, 'Wrap up'],
  ]);
  // ranges run together on one line still split into sections
  const oneLine = pipeline.parseOutline('TYPE: list 0:00-1:00 $1 Bill 1:00-1:51 $2 Bill 1:51-2:36 $5 Bill', 156);
  assert.deepEqual(oneLine.sections.map((s) => s.title), ['$1 Bill', '$2 Bill', '$5 Bill']);
  assert.equal(pipeline.parseOutline('no outline here', 600).sections.length, 0);
  assert.equal(pipeline.parseOutline('TYPE: nonsense', 600).type, 'other');
});

test('buildSegments merges short sections and splits long ones', () => {
  const secs = pipeline.parseOutline(
    '0:00-1:00 A\n1:00-1:51 B\n1:51-2:36 C\n2:36-3:19 D\n3:19-14:00 E', 840
  ).sections;
  const segs = pipeline.buildSegments(secs, 840, { segmentSec: 180 });
  assert.deepEqual(segs[0], { start: 0, end: 156, title: 'A; B; C' });
  assert.equal(segs[1].title, 'D');
  // E is 641s: split into 4 equal parts
  assert.equal(segs.length, 6);
  assert.equal(segs[2].title, 'E (part 1 of 4)');
  assert.equal(segs[5].end, 840);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].start, segs[i - 1].end);
});

test('buildSegments falls back to fixed windows and caps the prompt count', () => {
  const segs = pipeline.buildSegments([], 600, { segmentSec: 180 });
  assert.equal(segs.length, 4);
  assert.equal(segs[0].start, 0);
  assert.equal(segs[3].end, 600);
  const long = pipeline.buildSegments([], 4 * 3600, { segmentSec: 180, maxSegments: 40 });
  assert.equal(long.length, 40);
  assert.deepEqual(pipeline.buildSegments([], 0, {}), []);
});

test('assessReply flags lazy replies', () => {
  const seg = { start: 0, end: 180 };
  const bullets = (times) => times.map((t) => `- (${t}) ${'A detailed point about the topic. '.repeat(4)}`).join('\n');
  assert.equal(pipeline.assessReply(bullets(['0:05', '0:40', '1:10', '1:45', '2:20', '2:50', '2:58', '1:00', '2:00']), seg).ok, true);

  const short = pipeline.assessReply('- (0:05) One line.\n- (1:30) Two.\n- (2:50) Three.', seg);
  assert.equal(short.ok, false);
  assert.match(short.issues[0], /too short/);

  const early = pipeline.assessReply(bullets(['0:05', '0:10', '0:20', '0:30', '0:40', '0:45', '0:50', '0:55', '1:00']), seg);
  assert.match(early.issues.join(), /stops at 1:00/);

  const wrong = pipeline.assessReply(bullets(['5:00', '5:10', '5:20', '5:30', '5:40', '5:50', '6:00', '6:10', '6:20']), seg);
  assert.match(wrong.issues.join(), /outside the requested range/);

  const refused = pipeline.assessReply("Sorry, I can't help with that.", seg);
  assert.deepEqual(refused.issues, ['it did not provide the notes']);

  assert.match(pipeline.assessReply('x'.repeat(2000), seg).issues.join(), /no timestamps/);
  // linked timestamps count, and URLs do not inflate the length
  assert.deepEqual(pipeline.extractTimestamps('([0:06](https://youtu.be/abc?t=6)) and (1:02:03)'), [6, 3723]);
});

test('normalizeHeadings shifts to the requested level', () => {
  assert.equal(pipeline.normalizeHeadings('# A\n## B\ntext', 3), '### A\n#### B\ntext');
  assert.equal(pipeline.normalizeHeadings('#### A', 3), '### A');
  assert.equal(pipeline.normalizeHeadings('no headings', 3), 'no headings');
});

const info = { videoId: 'abc123', url: 'https://www.youtube.com/watch?v=abc123', title: 'Test video', channel: 'Chan', durationSec: 360 };
const goodNotes = (from) =>
  `### Topic\n` +
  Array.from({ length: 9 }, (_, i) => `- (${util.fmtTime(from + i * 20)}) ${'Detail about the subject matter. '.repeat(4)}`).join('\n');

test('run: full pass with a retry, gap check and stitched output', async () => {
  const asked = [];
  let sectionCalls = 0;
  const ask = async (prompt) => {
    asked.push(prompt);
    if (/map it out/.test(prompt)) return 'TYPE: tutorial\n0:00-3:00 Setup\n3:00-6:00 Build';
    if (/Final check/.test(prompt)) return '- (5:50) One more thing.';
    if (/not acceptable/.test(prompt)) return goodNotes(0);
    sectionCalls++;
    return sectionCalls === 1 ? '- (0:05) Too thin.' : goodNotes(180);
  };
  const steps = [];
  const rec = await pipeline.run({ ask, info, settings: { delayMs: 0 }, onProgress: (p) => steps.push(p.label), sleep: async () => {} });

  assert.equal(rec.status, 'complete');
  assert.equal(rec.videoType, 'tutorial');
  assert.equal(asked.length, 5); // outline, section 1, retry, section 2, gap
  assert.match(asked[1], /numbered list/); // tutorial rule applied
  assert.match(asked[2], /far too short/);
  assert.equal(rec.sections.length, 3);
  assert.equal(rec.sections[0].flagged, false);
  assert.equal(rec.sections[2].title, 'Additional points');
  assert.match(rec.markdown, /^# Test video\n/);
  assert.match(rec.markdown, /## Outline\n\n- 0:00–3:00 Setup/);
  assert.match(rec.markdown, /## 3:00–6:00 · Build\n\n### Topic/);
  assert.match(rec.markdown, /## Additional points\n\n- \(5:50\)/);
  assert.ok(steps.some((s) => /asking again/.test(s)));
});

test('run: keeps a still-thin section but flags it; NOTHING MISSING adds nothing', async () => {
  const ask = async (prompt) => {
    if (/map it out/.test(prompt)) return 'TYPE: lecture\n0:00-3:00 Only';
    if (/Final check/.test(prompt)) return 'NOTHING MISSING';
    return /not acceptable/.test(prompt) ? '- (0:05) Still thin, slightly longer.' : '- (0:05) Thin.';
  };
  const rec = await pipeline.run({ ask, info: { ...info, durationSec: 180 }, settings: {}, sleep: async () => {} });
  assert.equal(rec.status, 'complete');
  assert.equal(rec.sections.length, 1);
  assert.equal(rec.sections[0].flagged, true);
  assert.match(rec.sections[0].markdown, /Still thin/);
  assert.match(rec.markdown, /may be incomplete/);
});

test('run: an error mid-way keeps what was collected as partial', async () => {
  let n = 0;
  const ask = async (prompt) => {
    if (/map it out/.test(prompt)) return 'TYPE: lecture\n0:00-3:00 A\n3:00-6:00 B';
    if (++n === 2) throw new Error('Timed out');
    return goodNotes(0);
  };
  const rec = await pipeline.run({ ask, info, settings: {}, sleep: async () => {} });
  assert.equal(rec.status, 'partial');
  assert.equal(rec.error, 'Timed out');
  assert.equal(rec.sections.length, 1);
  assert.match(rec.markdown, /Status: partial \(Timed out\)/);
});

test('run: cancel stops before the next section; no outline still yields fixed windows', async () => {
  let cancelled = false;
  const ask = async (prompt) => {
    if (/map it out/.test(prompt)) return 'I could not make an outline.';
    cancelled = true;
    return goodNotes(0);
  };
  const rec = await pipeline.run({ ask, info, settings: {}, isCancelled: () => cancelled, sleep: async () => {} });
  assert.equal(rec.outline.length, 0);
  assert.equal(rec.sections.length, 1);
  assert.equal(rec.status, 'partial');
  assert.equal(rec.error, 'Cancelled');
});

test('htmlToMd converts the reply structures the Ask panel renders', () => {
  const dom = el('markdown-div', null,
    el('p', null, 'PINEAPPLE'),
    txt('\n'),
    el('h3', null, '$1 Bill (', stamp('0:00', 0), ' - ', stamp('1:00', 60), ')'),
    el('ul', null,
      el('li', null, '(', stamp('0:06', 6), ') It features ', el('strong', null, 'George Washington'), ', the ', el('em', null, 'first'), ' president.'),
      el('li', null, el('p', null, 'Parent point'), el('ul', null, el('li', null, 'Nested point')))
    ),
    el('ol', null, el('li', null, 'Step one'), el('li', null, 'Run ', el('code', null, 'npm test'))),
    el('table', null,
      el('thead', null, el('tr', null, el('th', null, 'Note'), el('th', null, 'Portrait'))),
      el('tbody', null, el('tr', null, el('td', null, '$2'), el('td', null, 'Jefferson | 3rd')))
    ),
    el('pre', null, el('code', null, 'x = 1\n')),
    el('p', null, 'See ', el('a', { href: 'https://example.com/a' }, 'this'), ' and ', el('a', { href: '/watch?v=zzz' }, 'that'), '.')
  );
  const md = htmlToMd.convert(dom, { videoId: 'abc', timestampLinks: true });
  assert.equal(md, [
    'PINEAPPLE',
    '### $1 Bill ([0:00](https://youtu.be/abc?t=0) - [1:00](https://youtu.be/abc?t=60))',
    '- ([0:06](https://youtu.be/abc?t=6)) It features **George Washington**, the *first* president.\n- Parent point\n  - Nested point',
    '1. Step one\n2. Run `npm test`',
    '| Note | Portrait |\n| --- | --- |\n| $2 | Jefferson \\| 3rd |',
    '```\nx = 1\n```',
    'See [this](https://example.com/a) and [that](https://www.youtube.com/watch?v=zzz).',
  ].join('\n\n'));

  const plain = htmlToMd.convert(dom, { videoId: 'abc', timestampLinks: false });
  assert.match(plain, /- \(0:06\) It features/);
  // converted output feeds straight back into the outline parser
  // (the live outline reply is one <p> whose lines are separated by raw newlines)
  const outline = el('markdown-div', null,
    el('p', null, 'TYPE: list\n', stamp('0:00', 0), '-', stamp('1:00', 60), ' $1 Bill\n', stamp('1:00', 60), '-', stamp('1:51', 111), ' $2 Bill')
  );
  const outlineMd = htmlToMd.convert(outline, { videoId: 'abc', timestampLinks: true });
  assert.equal(outlineMd.split('\n').length, 3);
  assert.deepEqual(pipeline.parseOutline(outlineMd, 111), {
    type: 'list',
    sections: [
      { start: 0, end: 60, title: '$1 Bill' },
      { start: 60, end: 111, title: '$2 Bill' },
    ],
  });
});

test('export formats', () => {
  const notes = [
    { videoId: 'a1', title: 'First: Video', markdown: '# First\n\nbody\n' },
    { videoId: 'b2', title: 'Second', markdown: '# Second\n' },
  ];
  assert.deepEqual(JSON.parse(exporter.toJson(notes)), notes);
  assert.equal(exporter.toCombinedMarkdown(notes), '# First\n\nbody\n\n---\n\n# Second\n');
  assert.equal(exporter.noteFilename(notes[0]), 'first-video-a1.md');
  assert.equal(exporter.libraryFilename('json', new Date('2026-11-17T10:00:00Z')), 'youtube-study-notes-2026-11-17.json');
});
