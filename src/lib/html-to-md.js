// Converts the Ask panel's rendered reply (a <markdown-div>) back to Markdown.
// Only uses nodeType / tagName / childNodes / textContent / getAttribute, so
// it can be tested with plain objects.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});

  const BLOCK = new Set([
    'p', 'div', 'section', 'article', 'markdown-div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'pre', 'blockquote', 'hr',
  ]);
  const SKIP = new Set(['script', 'style', 'svg', 'button', 'template']);

  const kids = (n) => Array.from(n.childNodes || []);
  const tagOf = (n) => (n.nodeType === 1 ? n.tagName.toLowerCase() : '');
  const attr = (n, name) => (n.getAttribute ? n.getAttribute(name) : null);

  function wrap(inner, mark) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : inner;
  }

  function link(node, inner, o) {
    const label = inner.trim();
    if (!label) return '';
    const time = attr(node, 'data-time');
    if (time !== null || /timestamp/i.test(attr(node, 'class') || '')) {
      const t = time !== null ? parseInt(time, 10) : null;
      return o.timestampLinks && o.videoId && Number.isFinite(t)
        ? `[${label}](https://youtu.be/${o.videoId}?t=${t})`
        : label;
    }
    const href = attr(node, 'href') || '';
    if (/^https?:\/\//.test(href)) return `[${label}](${href})`;
    if (href.startsWith('/') && !href.startsWith('//')) return `[${label}](https://www.youtube.com${href})`;
    return label;
  }

  function inline(node, o) {
    // Newlines inside a paragraph are real line breaks in the Ask panel, so keep them.
    if (node.nodeType === 3) return node.textContent.replace(/[ \t\r\f]+/g, ' ').replace(/ ?\n[ \n]*/g, '\n');
    if (node.nodeType !== 1) return '';
    const tag = tagOf(node);
    if (SKIP.has(tag)) return '';
    if (tag === 'br') return '\n';
    if (tag === 'code') return '`' + node.textContent + '`';
    const inner = kids(node).map((k) => inline(k, o)).join('');
    if (tag === 'strong' || tag === 'b') return wrap(inner, '**');
    if (tag === 'em' || tag === 'i') return wrap(inner, '*');
    if (tag === 'a') return link(node, inner, o);
    return inner;
  }

  const inlineAll = (node, o) => kids(node).map((k) => inline(k, o)).join('').replace(/[ \t]+/g, ' ').trim();

  function findAll(node, tag, out) {
    out = out || [];
    for (const k of kids(node)) {
      if (tagOf(k) === tag) out.push(k);
      else if (k.nodeType === 1) findAll(k, tag, out);
    }
    return out;
  }

  function list(el, o, depth) {
    const ordered = tagOf(el) === 'ol';
    const lines = [];
    let n = 0;
    for (const li of kids(el)) {
      if (tagOf(li) !== 'li') continue;
      n++;
      let text = '';
      const nested = [];
      for (const k of kids(li)) {
        const t = tagOf(k);
        if (t === 'ul' || t === 'ol') nested.push(list(k, o, depth + 1));
        else if (BLOCK.has(t)) text += (text ? ' ' : '') + inlineAll(k, o);
        else text += inline(k, o);
      }
      text = text.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
      lines.push('  '.repeat(depth) + (ordered ? `${n}. ` : '- ') + text);
      lines.push(...nested);
    }
    return lines.join('\n');
  }

  function table(el, o) {
    const rows = findAll(el, 'tr').map((tr) =>
      kids(tr)
        .filter((c) => tagOf(c) === 'th' || tagOf(c) === 'td')
        .map((c) => inlineAll(c, o).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|'))
    );
    if (!rows.length) return '';
    const width = Math.max(...rows.map((r) => r.length));
    const fmt = (r) => '| ' + Array.from({ length: width }, (_, i) => r[i] || '').join(' | ') + ' |';
    return [fmt(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(fmt)].join('\n');
  }

  function blockOf(el, o) {
    const tag = tagOf(el);
    if (/^h[1-6]$/.test(tag)) {
      const t = inlineAll(el, o).replace(/\*\*/g, '').replace(/\s*\n\s*/g, ' ');
      return t ? ['#'.repeat(+tag[1]) + ' ' + t] : [];
    }
    if (tag === 'p') {
      const t = inlineAll(el, o);
      return t ? [t] : [];
    }
    if (tag === 'ul' || tag === 'ol') return [list(el, o, 0)];
    if (tag === 'pre') return ['```\n' + el.textContent.replace(/\n$/, '') + '\n```'];
    if (tag === 'hr') return ['---'];
    if (tag === 'table') return [table(el, o)];
    if (tag === 'blockquote') {
      return [blocks(el, o).join('\n\n').split('\n').map((l) => ('> ' + l).trimEnd()).join('\n')];
    }
    return blocks(el, o);
  }

  function blocks(node, o) {
    const out = [];
    let buf = '';
    const flush = () => {
      const t = buf.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
      if (t) out.push(t);
      buf = '';
    };
    for (const k of kids(node)) {
      const t = tagOf(k);
      if (SKIP.has(t)) continue;
      if (BLOCK.has(t)) {
        flush();
        out.push(...blockOf(k, o));
      } else buf += inline(k, o);
    }
    flush();
    return out.filter(Boolean);
  }

  // opts: {videoId, timestampLinks}
  function convert(node, opts) {
    return blocks(node, opts || {}).join('\n\n').trim();
  }

  YSN.htmlToMd = { convert };
  if (typeof module !== 'undefined') module.exports = YSN.htmlToMd;
})(globalThis);
