// Content-script entry: launcher button, run orchestration, clipboard.
(function (root) {
  const YSN = root.YSN;
  const { ui, driver, videoInfo, pipeline, store, htmlToMd } = YSN;
  const api = root.browser || root.chrome;
  let run = null; // {cancelled} while a run is in progress

  async function writeClipboard(text) {
    try {
      // writeText can stay pending forever (seen on the live page), so race it.
      const done = await Promise.race([
        navigator.clipboard.writeText(text).then(() => true),
        new Promise((r) => setTimeout(() => r(false), 1500)),
      ]);
      if (done) return true;
    } catch (e) {
      // Falls through: no focus or no user activation after a long run.
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  // Copy now; if the tab is in the background, copy as soon as it gets focus back.
  async function copyNotes(text) {
    if (await writeClipboard(text)) return true;
    if (!document.hasFocus()) {
      window.addEventListener('focus', () => writeClipboard(text), { once: true });
    }
    return false;
  }

  async function start() {
    if (run) return { ok: false, reason: 'A run is already in progress.' };
    if (!videoInfo.videoId()) {
      ui.show('error', 'Open a video first.', { actions: [{ label: 'Dismiss', onClick: ui.hideToast }] });
      return { ok: false, reason: 'Not a video page.' };
    }
    const ctl = (run = { cancelled: false });
    const cancel = [{ label: 'Cancel', onClick: () => ((ctl.cancelled = true), ui.show('busy', 'Stopping after this reply…')) }];
    const dismiss = { label: 'Dismiss', onClick: ui.hideToast };

    try {
      ui.show('busy', 'Starting…', { actions: cancel });
      await driver.waitForAd(() => ui.show('busy', 'Waiting for the ad to finish…', { actions: cancel }));
      const info = videoInfo.read();
      const settings = await store.getSettings();

      const ask = async (prompt) => {
        if (videoInfo.videoId() !== info.videoId) throw new Error('You navigated to another video');
        const replyEl = await driver.ask(prompt);
        return htmlToMd.convert(replyEl, { videoId: info.videoId, timestampLinks: settings.timestampLinks });
      };

      const rec = await pipeline.run({
        ask,
        info,
        settings,
        isCancelled: () => ctl.cancelled,
        onProgress: (p) => {
          if (ctl.cancelled) return;
          const count = p.total ? ` (${p.step} of ${p.total})` : '';
          ui.show('busy', p.label + count, { step: p.step, total: p.total, actions: cancel });
        },
      });

      if (!rec.sections.length) {
        ui.show('error', `No notes were produced: ${rec.error || 'unknown error'}`, { actions: [dismiss] });
        return { ok: false, reason: rec.error };
      }

      await store.addNote(rec);
      const copied = settings.autoCopy ? await copyNotes(rec.markdown) : false;
      const copyBtn = {
        label: 'Copy',
        onClick: async () => ui.show('done', (await writeClipboard(rec.markdown)) ? 'Copied.' : 'Copy failed.', { actions: [dismiss] }),
      };
      const flagged = rec.sections.filter((s) => s.flagged).length;
      const size = `${rec.sections.length} sections, ${rec.markdown.length.toLocaleString()} characters`;
      const parts = [
        rec.status === 'complete' ? `Notes saved: ${size}.` : `Partial notes saved (${rec.error}): ${size}.`,
        copied ? 'Copied to clipboard.' : settings.autoCopy ? 'Could not copy automatically; use Copy.' : '',
        flagged ? `${flagged} section${flagged > 1 ? 's' : ''} stayed thin after a retry.` : '',
      ];
      ui.show(rec.status === 'complete' ? 'done' : 'error', parts.filter(Boolean).join(' '), { actions: [copyBtn, dismiss] });
      return { ok: true, id: rec.id };
    } catch (e) {
      ui.show('error', (e && e.message) || String(e), { actions: [dismiss] });
      return { ok: false, reason: (e && e.message) || String(e) };
    } finally {
      run = null;
    }
  }

  function refreshLauncher() {
    ui.setLauncher(!!videoInfo.videoId(), () => start());
  }

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'ysn-generate') return;
    if (run) sendResponse({ ok: false, reason: 'A run is already in progress.' });
    else if (!videoInfo.videoId()) sendResponse({ ok: false, reason: 'Open a video first.' });
    else {
      start();
      sendResponse({ ok: true });
    }
  });

  // YouTube is a single-page app: this fires on every in-site navigation.
  document.addEventListener('yt-navigate-finish', () => {
    if (!run) ui.hideToast();
    refreshLauncher();
  });
  refreshLauncher();
})(globalThis);
