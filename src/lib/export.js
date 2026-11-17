// JSON / Markdown export of the notes library.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});
  if (typeof require === 'function' && typeof module !== 'undefined') require('./util.js');

  const toJson = (notes) => JSON.stringify(notes, null, 2);

  // One document; each note keeps its own "# title" heading.
  const toCombinedMarkdown = (notes) => notes.map((n) => n.markdown.trim()).join('\n\n---\n\n') + '\n';

  const noteFilename = (note) => `${YSN.util.slug(note.title)}-${note.videoId}.md`;

  const libraryFilename = (ext, date) => `youtube-study-notes-${(date || new Date()).toISOString().slice(0, 10)}.${ext}`;

  // Browser only: hand the text to the user as a file.
  function download(filename, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  YSN.exporter = { toJson, toCombinedMarkdown, noteFilename, libraryFilename, download };
  if (typeof module !== 'undefined') module.exports = YSN.exporter;
})(globalThis);
