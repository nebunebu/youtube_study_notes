// Shared helpers. Every lib file hangs its API off globalThis.YSN so the same
// source works as a content script, in extension pages, and under node --test.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});

  // "1:02:03" or "2:35" -> seconds; null when it is not a time.
  function parseTime(s) {
    const m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(String(s).trim());
    if (!m) return null;
    return m[3] !== undefined ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function slug(s) {
    return (
      String(s || '')
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 80)
        .toLowerCase() || 'notes'
    );
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  YSN.util = { parseTime, fmtTime, slug, sleep };
  if (typeof module !== 'undefined') module.exports = YSN.util;
})(globalThis);
