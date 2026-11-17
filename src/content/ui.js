// Floating launcher button and progress toast, fixed to the page corner so they
// do not depend on where YouTube puts its own buttons.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});
  let box, launcher, label, bar, actions;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function ensure() {
    if (box && box.isConnected) return;
    box = el('div', 'ysn-box');
    launcher = el('button', 'ysn-launcher', 'Study notes');
    launcher.title = 'Generate study notes for this video';
    const toast = el('div', 'ysn-toast');
    label = el('div', 'ysn-label');
    const track = el('div', 'ysn-track');
    bar = el('div', 'ysn-bar');
    track.appendChild(bar);
    actions = el('div', 'ysn-actions');
    toast.append(label, track, actions);
    box.append(toast, launcher);
    document.documentElement.appendChild(box);
  }

  function setActions(list) {
    actions.replaceChildren(
      ...(list || []).map((a) => {
        const b = el('button', 'ysn-action', a.label);
        b.addEventListener('click', a.onClick);
        return b;
      })
    );
  }

  // state: 'idle' | 'busy' | 'done' | 'error'
  function show(state, text, opts) {
    ensure();
    box.dataset.state = state;
    label.textContent = text || '';
    const frac = opts && opts.total ? Math.min(1, opts.step / opts.total) : state === 'done' ? 1 : 0;
    bar.style.width = `${Math.round(frac * 100)}%`;
    setActions(opts && opts.actions);
  }

  function setLauncher(visible, onClick) {
    ensure();
    box.hidden = !visible;
    if (onClick) launcher.onclick = onClick;
  }

  const hideToast = () => show('idle', '');

  YSN.ui = { show, setLauncher, hideToast };
})(globalThis);
