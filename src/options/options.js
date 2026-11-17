(function () {
  const { store, prompts, pipeline } = globalThis.YSN;
  const $ = (id) => document.getElementById(id);
  const NUMBERS = ['segmentSec', 'maxSegments', 'delayMs', 'minCharsPerMin'];
  const CHECKS = ['gapCheck', 'timestampLinks', 'autoCopy'];
  const TEMPLATES = ['outline', 'section', 'retry', 'gap'];

  function fill(s) {
    for (const k of NUMBERS) $(k).value = s[k];
    for (const k of CHECKS) $(k).checked = !!s[k];
    for (const k of TEMPLATES) {
      $('t-' + k).value = (s.templates && s.templates[k]) || '';
      $('t-' + k).placeholder = prompts.DEFAULTS[k];
    }
  }

  function read() {
    const d = pipeline.DEFAULT_SETTINGS;
    const s = { templates: {} };
    for (const k of NUMBERS) {
      const v = Number($(k).value);
      s[k] = Number.isFinite(v) && $(k).value !== '' ? Math.min(+$(k).max, Math.max(+$(k).min, v)) : d[k];
    }
    for (const k of CHECKS) s[k] = $(k).checked;
    for (const k of TEMPLATES) if ($('t-' + k).value.trim()) s.templates[k] = $('t-' + k).value;
    return s;
  }

  const flash = (text) => {
    $('saved').textContent = text;
    setTimeout(() => ($('saved').textContent = ''), 2000);
  };

  $('save').addEventListener('click', async () => {
    const s = read();
    await store.saveSettings(s);
    fill(s);
    flash('Saved.');
  });
  $('reset').addEventListener('click', async () => {
    await store.saveSettings({});
    fill(await store.getSettings());
    flash('Reset.');
  });

  store.getSettings().then(fill);
})();
