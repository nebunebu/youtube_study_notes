// Forwards the keyboard shortcut to the active YouTube tab.
const api = globalThis.browser || globalThis.chrome;

api.commands.onCommand.addListener(async (command) => {
  if (command !== 'generate-notes') return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await api.tabs.sendMessage(tab.id, { type: 'ysn-generate' });
  } catch (e) {
    // Not a YouTube tab, or the tab predates the extension being loaded.
  }
});
