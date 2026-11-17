// Drives YouTube's Ask panel: open it, send a prompt, wait for the reply.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});
  const S = YSN.selectors;
  const { sleep } = YSN.util;

  const visible = (el) => !!(el && (el.offsetParent || el.getClientRects().length));

  async function waitFor(fn, timeoutMs, intervalMs) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) return null;
      await sleep(intervalMs || 200);
    }
  }

  function findPanel() {
    const p = document.querySelector(S.panel);
    if (p) return p;
    const input = document.querySelector(S.input);
    return input ? input.closest(S.panelHost) : null;
  }

  function openPanelOrNull() {
    const p = findPanel();
    if (!p || p.getAttribute('visibility') === S.panelHidden || !visible(p)) return null;
    return p.querySelector(S.input) ? p : null;
  }

  // Every Ask button on the page, wherever YouTube put it this time; visible ones first.
  function askButtons() {
    const panel = findPanel();
    const set = new Set();
    for (const b of document.querySelectorAll('button, [role="button"]')) {
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
      if (S.askLabel.test(label)) set.add(b);
    }
    for (const b of document.querySelectorAll(S.askStructural)) set.add(b);
    return [...set]
      .filter((b) => !(panel && panel.contains(b)))
      .sort((a, b) => Number(visible(b)) - Number(visible(a)));
  }

  async function openPanel() {
    let p = openPanelOrNull();
    if (p) return p;

    for (const b of askButtons()) {
      b.click();
      if ((p = await waitFor(openPanelOrNull, 4000))) return p;
    }

    // Narrow layouts push Ask into the "..." menu under the video.
    for (const more of document.querySelectorAll(S.overflowButton)) {
      if (!visible(more)) continue;
      more.click();
      const item = await waitFor(
        () => [...document.querySelectorAll(S.overflowItem)].find((i) => visible(i) && S.askLabel.test(i.textContent.trim())),
        1500
      );
      if (item) {
        item.click();
        if ((p = await waitFor(openPanelOrNull, 4000))) return p;
      } else document.body.click(); // close the menu again
    }
    throw new Error("Could not find YouTube's Ask button. It needs a signed-in account and a video that offers Ask.");
  }

  const adShowing = () => !!document.querySelector(S.adShowing);

  // The Ask panel refuses input during ads, and the ad also reports the wrong duration.
  async function waitForAd(onWaiting) {
    if (!adShowing()) return;
    if (onWaiting) onWaiting();
    if (!(await waitFor(() => !adShowing(), 180000, 500))) throw new Error('An ad is still playing; skip it and try again.');
    await sleep(1000);
  }

  function setText(input, text) {
    input.focus();
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, text);
    } else {
      document.getSelection().selectAllChildren(input);
      document.execCommand('insertText', false, text);
    }
    fire(input);
  }

  // Send only becomes enabled on keyup, so plain input/change events are not enough.
  function fire(input) {
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
  }

  const inputValue = (input) => ('value' in input ? input.value : input.textContent);

  // Sends one prompt and resolves with the reply element (a rendered markdown-div).
  async function ask(prompt, opts) {
    const timeoutMs = (opts && opts.timeoutMs) || 120000;
    await waitForAd();
    const panel = await openPanel();
    const input = panel.querySelector(S.input);
    if (!input) throw new Error('Ask panel has no text box');

    const repliesBefore = panel.querySelectorAll(S.reply).length;
    const itemsBefore = panel.querySelectorAll(S.item).length;

    setText(input, prompt);
    const send = await waitFor(() => {
      const b = panel.querySelector(S.send);
      if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') return b;
      fire(input);
      return null;
    }, 8000, 400);
    if (!send) throw new Error('The Ask panel would not accept the prompt (Send stayed disabled).');
    send.click();

    const sent = await waitFor(
      () => inputValue(input) === '' || panel.querySelectorAll(S.item).length > itemsBefore,
      6000
    );
    if (!sent) throw new Error('The prompt was not sent.');

    // Replies arrive whole, followed by a row of suggestion chips. Wait for a new
    // reply whose text has stopped changing; the chips shorten the wait.
    const start = Date.now();
    let lastLen = -1;
    let stableSince = Date.now();
    for (;;) {
      await sleep(250);
      const now = Date.now();
      const replies = panel.querySelectorAll(S.reply);
      if (replies.length > repliesBefore) {
        const el = replies[replies.length - 1];
        const len = el.textContent.length;
        if (len !== lastLen) {
          lastLen = len;
          stableSince = now;
        }
        const item = el.closest(S.item);
        const next = item && item.nextElementSibling;
        const chipsAfter = !!(next && next.querySelector && next.querySelector(S.chips));
        const quiet = now - stableSince;
        if (len > 0 && ((chipsAfter && quiet > 600) || quiet > 4000)) return el;
      } else {
        // An error turn shows up as a new item with text but no markdown.
        const extra = [...panel.querySelectorAll(S.item)]
          .slice(itemsBefore)
          .filter((i) => !i.querySelector(S.chips) && i.textContent.trim());
        if (extra.length && now - start > 8000) {
          throw new Error('Ask replied without notes: ' + extra[extra.length - 1].textContent.trim().slice(0, 200));
        }
      }
      if (now - start > timeoutMs) throw new Error('Timed out waiting for the Ask panel to reply.');
    }
  }

  YSN.driver = { openPanel, ask, waitForAd, askButtons };
})(globalThis);
