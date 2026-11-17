// Notes library and settings on extension storage.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});
  const api = () => root.browser || root.chrome;

  async function getNotes() {
    const { notes } = await api().storage.local.get('notes');
    return Array.isArray(notes) ? notes : [];
  }

  async function addNote(rec) {
    const notes = await getNotes();
    notes.unshift(rec);
    await api().storage.local.set({ notes });
  }

  async function deleteNote(id) {
    const notes = (await getNotes()).filter((n) => n.id !== id);
    await api().storage.local.set({ notes });
  }

  async function getSettings() {
    const { settings } = await api().storage.local.get('settings');
    const d = YSN.pipeline.DEFAULT_SETTINGS;
    return Object.assign({}, d, settings, { templates: Object.assign({}, d.templates, settings && settings.templates) });
  }

  async function saveSettings(settings) {
    await api().storage.local.set({ settings });
  }

  YSN.store = { getNotes, addNote, deleteNote, getSettings, saveSettings };
  if (typeof module !== 'undefined') module.exports = YSN.store;
})(globalThis);
