// The multi-pass run: outline -> per-section notes (with laziness checks and
// one retry) -> gap check -> stitched Markdown. Everything here is DOM-free;
// the caller injects ask(prompt) -> Promise<markdown>.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});
  if (typeof require === 'function' && typeof module !== 'undefined') {
    require('./util.js');
    require('./prompts.js');
  }
  const { parseTime, fmtTime } = YSN.util;
  const P = YSN.prompts;

  const DEFAULT_SETTINGS = {
    segmentSec: 180, // target length of video covered by one prompt
    maxSegments: 40, // long videos get longer segments rather than more prompts
    delayMs: 1500, // pause between prompts
    minCharsPerMin: 350, // below this a reply counts as too thin
    gapCheck: true,
    timestampLinks: true,
    autoCopy: true,
    templates: {},
  };

  const TIME = '\\d{1,3}:\\d{2}(?::\\d{2})?';
  const stripMd = (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');

  // ---- outline -------------------------------------------------------------

  function parseOutline(md, durationSec) {
    // Put every "M:SS-M:SS" range on its own line in case the reply ran them together.
    const text = stripMd(md || '').replace(
      new RegExp(`[ \\t]+(?=${TIME}\\s*(?:-|–|—|to)\\s*${TIME})`, 'g'),
      '\n'
    );
    const tm = /TYPE:\s*([a-z-]+)/i.exec(text);
    const type = tm && P.TYPES.includes(tm[1].toLowerCase()) ? tm[1].toLowerCase() : 'other';
    const range = new RegExp(`^(${TIME})\\s*(?:-|–|—|to)\\s*(${TIME})\\s*[:\\-–—|]?\\s*(.*)$`);
    const single = new RegExp(`^(${TIME})\\s*[:\\-–—|]?\\s*(.+)$`);
    const sections = [];
    for (let line of text.split('\n')) {
      line = line.replace(/^[\s>#\-•\d.)(\[\]]*?(?=\d{1,3}:\d{2})/, '').trim();
      let m = range.exec(line);
      if (m) sections.push({ start: parseTime(m[1]), end: parseTime(m[2]), title: m[3].trim() });
      else if ((m = single.exec(line))) sections.push({ start: parseTime(m[1]), end: null, title: m[2].trim() });
    }
    return { type, sections: normalizeSections(sections, durationSec) };
  }

  // Sort, drop junk, and make the sections contiguous from 0 to the end.
  function normalizeSections(sections, durationSec) {
    const dur = durationSec > 0 ? durationSec : null;
    const s = sections
      .filter((x) => x.start !== null && (dur === null || x.start < dur))
      .sort((a, b) => a.start - b.start)
      .filter((x, i, arr) => i === 0 || x.start > arr[i - 1].start);
    if (!s.length) return [];
    s[0].start = 0;
    for (let i = 0; i < s.length; i++) {
      const next = s[i + 1];
      if (next) s[i].end = next.start;
      else s[i].end = dur !== null ? dur : Math.max(s[i].end || 0, s[i].start + 60);
      s[i].title = s[i].title || `Part ${i + 1}`;
    }
    return s.map((x) => ({ start: x.start, end: x.end, title: x.title }));
  }

  // ---- segments ------------------------------------------------------------

  // Merge short neighbouring sections up to the target length and split long
  // ones, so each prompt covers a stretch Gemini will actually do in detail.
  function buildSegments(sections, durationSec, settings) {
    const st = Object.assign({}, DEFAULT_SETTINGS, settings);
    const total = durationSec > 0 ? durationSec : sections.length ? sections[sections.length - 1].end : 0;
    const target = Math.max(st.segmentSec, Math.ceil(total / st.maxSegments));
    const maxLen = target * 1.6;
    let src = sections;
    if (!src.length) {
      if (!total) return [];
      src = [{ start: 0, end: total, title: 'Full video' }];
    }

    const merged = [];
    for (const sec of src) {
      const cur = merged[merged.length - 1];
      if (cur && sec.end - cur.start <= target) {
        cur.end = sec.end;
        cur.titles.push(sec.title);
      } else merged.push({ start: sec.start, end: sec.end, titles: [sec.title] });
    }

    const out = [];
    for (const seg of merged) {
      const len = seg.end - seg.start;
      if (len <= maxLen) {
        out.push({ start: seg.start, end: seg.end, title: seg.titles.join('; ') });
        continue;
      }
      const n = Math.ceil(len / target);
      for (let i = 0; i < n; i++) {
        out.push({
          start: Math.round(seg.start + (len * i) / n),
          end: Math.round(seg.start + (len * (i + 1)) / n),
          title: `${seg.titles.join('; ')} (part ${i + 1} of ${n})`,
        });
      }
    }
    return out;
  }

  // ---- laziness checks -----------------------------------------------------

  function extractTimestamps(md) {
    const out = [];
    const re = new RegExp(`(?<![\\d:])(${TIME})(?![\\d:])`, 'g');
    let m;
    while ((m = re.exec(stripMd(md)))) {
      const t = parseTime(m[1]);
      if (t !== null) out.push(t);
    }
    return out;
  }

  // Returns {ok, issues[]}; issues are phrased so they can go straight into the retry prompt.
  function assessReply(md, seg, settings) {
    const st = Object.assign({}, DEFAULT_SETTINGS, settings);
    const text = stripMd(md || '').trim();
    const issues = [];
    const len = seg.end - seg.start;

    if (text.length < 400 && /\b(I can['’]?t|I cannot|I(?: a|['’])m (?:unable|not able|sorry)|unable to|something went wrong|try again)\b/i.test(text)) {
      issues.push('it did not provide the notes');
      return { ok: false, issues };
    }
    const need = Math.min(6000, Math.round((st.minCharsPerMin * len) / 60));
    if (text.length < need) {
      issues.push(`it is far too short (${text.length} characters for ${fmtTime(len)} of video), which means content was skipped`);
    }
    const ts = extractTimestamps(md);
    if (!ts.length) issues.push('the bullets have no timestamps');
    else if (ts.length >= 3) {
      const inRange = ts.filter((t) => t >= seg.start - 20 && t <= seg.end + 20);
      if (inRange.length / ts.length < 0.6) {
        issues.push(`most of it is outside the requested range ${fmtTime(seg.start)} to ${fmtTime(seg.end)}`);
      } else if (len >= 60 && Math.max(...inRange) < seg.start + len * 0.6) {
        issues.push(`it stops at ${fmtTime(Math.max(...inRange))}, well before ${fmtTime(seg.end)}`);
      }
    }
    return { ok: issues.length === 0, issues };
  }

  // ---- stitching -----------------------------------------------------------

  // Shift headings so the shallowest one in a reply sits at minLevel.
  function normalizeHeadings(md, minLevel) {
    const levels = [...md.matchAll(/^(#{1,6}) /gm)].map((m) => m[1].length);
    if (!levels.length) return md;
    const shift = minLevel - Math.min(...levels);
    if (!shift) return md;
    return md.replace(/^(#{1,6}) /gm, (m, h) => '#'.repeat(Math.min(6, Math.max(1, h.length + shift))) + ' ');
  }

  function stitch(rec) {
    const range = (s) => `${fmtTime(s.start)}–${fmtTime(s.end)}`;
    const lines = [`# ${rec.title || 'Untitled video'}`, ''];
    if (rec.channel) lines.push(`- Channel: ${rec.channel}`);
    lines.push(`- URL: ${rec.url}`);
    if (rec.durationSec) lines.push(`- Duration: ${fmtTime(rec.durationSec)}`);
    lines.push(`- Type: ${rec.videoType}`, `- Generated: ${rec.createdAt.slice(0, 10)}`);
    if (rec.status !== 'complete') lines.push(`- Status: ${rec.status}${rec.error ? ` (${rec.error})` : ''}`);
    if (rec.outline.length) {
      lines.push('', '## Outline', '');
      for (const o of rec.outline) lines.push(`- ${range(o)} ${o.title}`);
    }
    for (const s of rec.sections) {
      lines.push('', s.extra ? `## ${s.title}` : `## ${range(s)} · ${s.title}`, '');
      if (s.flagged) lines.push('> This section may be incomplete: the reply stayed thin after a retry.', '');
      lines.push(normalizeHeadings(s.markdown.trim(), 3));
    }
    return lines.join('\n') + '\n';
  }

  // ---- the run -------------------------------------------------------------

  // info: {videoId, url, title, channel, durationSec}
  // ask(prompt) -> Promise<markdown>; onProgress({step, total, label}); isCancelled() -> bool
  async function run({ ask, info, settings, onProgress, isCancelled, sleep }) {
    const st = Object.assign({}, DEFAULT_SETTINGS, settings);
    const wait = sleep || YSN.util.sleep;
    const progress = onProgress || (() => {});
    const cancelled = isCancelled || (() => false);
    const rec = {
      id: `${info.videoId}-${Date.now()}`,
      videoId: info.videoId,
      url: info.url,
      title: info.title,
      channel: info.channel,
      durationSec: Math.round(info.durationSec || 0),
      createdAt: new Date().toISOString(),
      videoType: 'other',
      status: 'partial',
      error: null,
      outline: [],
      sections: [],
      markdown: '',
      promptVersion: P.VERSION,
    };

    try {
      progress({ step: 0, total: 0, label: 'Mapping the video' });
      const outlineMd = await ask(
        P.build('outline', { title: info.title, duration: fmtTime(rec.durationSec) }, st.templates)
      );
      const parsed = parseOutline(outlineMd, rec.durationSec);
      rec.videoType = parsed.type;
      rec.outline = parsed.sections;
      const segments = buildSegments(parsed.sections, rec.durationSec, st);
      if (!segments.length) throw new Error('Could not work out the video length or outline');
      const total = segments.length + (st.gapCheck ? 1 : 0);

      for (let i = 0; i < segments.length; i++) {
        if (cancelled()) throw new Error('Cancelled');
        const seg = segments[i];
        const vars = {
          start: fmtTime(seg.start),
          end: fmtTime(seg.end),
          titles: seg.title,
          typeRule: P.typeRule(rec.videoType),
        };
        progress({ step: i + 1, total, label: `Notes for ${vars.start}–${vars.end}` });
        await wait(st.delayMs);
        let md = await ask(P.build('section', vars, st.templates));
        let check = assessReply(md, seg, st);
        if (!check.ok && !cancelled()) {
          progress({ step: i + 1, total, label: `Reply too thin, asking again for ${vars.start}–${vars.end}` });
          await wait(st.delayMs);
          const again = await ask(
            P.build('retry', Object.assign({ issues: check.issues.join('; ') }, vars), st.templates)
          );
          const recheck = assessReply(again, seg, st);
          if (recheck.ok || again.length > md.length) {
            md = again;
            check = recheck;
          }
        }
        rec.sections.push({ start: seg.start, end: seg.end, title: seg.title, markdown: md, flagged: !check.ok });
      }

      if (st.gapCheck && !cancelled()) {
        progress({ step: total, total, label: 'Checking for anything missed' });
        await wait(st.delayMs);
        const gaps = (await ask(P.build('gap', {}, st.templates))).trim();
        if (gaps && !(gaps.length < 200 && /nothing\s+missing/i.test(gaps))) {
          rec.sections.push({
            start: 0,
            end: rec.durationSec,
            title: 'Additional points',
            markdown: gaps,
            flagged: false,
            extra: true,
          });
        }
      }
      rec.status = cancelled() ? 'partial' : 'complete';
      if (cancelled()) rec.error = 'Cancelled';
    } catch (e) {
      rec.status = 'partial';
      rec.error = (e && e.message) || String(e);
    }
    rec.markdown = stitch(rec);
    return rec;
  }

  YSN.pipeline = {
    DEFAULT_SETTINGS,
    parseOutline,
    normalizeSections,
    buildSegments,
    extractTimestamps,
    assessReply,
    normalizeHeadings,
    stitch,
    run,
  };
  if (typeof module !== 'undefined') module.exports = YSN.pipeline;
})(globalThis);
