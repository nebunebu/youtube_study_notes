(function () {
  const { store, exporter, util } = globalThis.YSN;
  const api = globalThis.browser || globalThis.chrome;
  const $ = (id) => document.getElementById(id);
  let notes = [];

  const status = (text) => ($('status').textContent = text || '');

  function button(text, onClick, cls) {
    const b = document.createElement('button');
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const shown = notes.filter(
      (n) => !q || `${n.title} ${n.channel}`.toLowerCase().includes(q) || n.markdown.toLowerCase().includes(q)
    );
    $('empty').hidden = notes.length > 0;
    $('list').replaceChildren(
      ...shown.map((n) => {
        const li = document.createElement('li');
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = n.title;
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = [n.channel, util.fmtTime(n.durationSec), n.createdAt.slice(0, 10), `${n.sections.length} sections`]
          .filter(Boolean)
          .join(' · ');
        if (n.status !== 'complete') {
          const p = document.createElement('span');
          p.className = 'partial';
          p.textContent = ' · partial';
          meta.appendChild(p);
        }
        const row = document.createElement('div');
        row.className = 'row';
        const del = button('Delete', async () => {
          // Second click confirms.
          if (del.dataset.armed) {
            await store.deleteNote(n.id);
            await load();
            status('Deleted.');
          } else {
            del.dataset.armed = '1';
            del.textContent = 'Really delete?';
          }
        }, 'danger');
        row.append(
          button('Copy', async () => {
            await navigator.clipboard.writeText(n.markdown);
            status('Copied.');
          }),
          button('Export .md', () => exporter.download(exporter.noteFilename(n), n.markdown, 'text/markdown')),
          button('Open video', () => api.tabs.create({ url: n.url })),
          del
        );
        li.append(title, meta, row);
        return li;
      })
    );
  }

  async function load() {
    notes = await store.getNotes();
    render();
  }

  $('search').addEventListener('input', render);

  $('generate').addEventListener('click', async () => {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/www\.youtube\.com\/watch/.test(tab.url || '')) {
      status('Open a YouTube video in this tab first.');
      return;
    }
    try {
      const res = await api.tabs.sendMessage(tab.id, { type: 'ysn-generate' });
      if (res && res.ok) window.close();
      else status((res && res.reason) || 'Could not start.');
    } catch (e) {
      status('Reload the YouTube tab, then try again.');
    }
  });

  $('export-json').addEventListener('click', () => {
    if (!notes.length) return status('Nothing to export.');
    exporter.download(exporter.libraryFilename('json'), exporter.toJson(notes), 'application/json');
  });
  $('export-md').addEventListener('click', () => {
    if (!notes.length) return status('Nothing to export.');
    exporter.download(exporter.libraryFilename('md'), exporter.toCombinedMarkdown(notes), 'text/markdown');
  });
  $('options').addEventListener('click', (e) => {
    e.preventDefault();
    api.runtime.openOptionsPage();
  });

  load();
})();
