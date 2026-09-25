/* Local export preview and downloads. No requests leave the browser. */
(function (root) {
  'use strict';

  // ZIP's stored method needs no compression dependency and works offline.
  function zip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const directory = [];
    let offset = 0;
    const crcTable = Array.from({ length: 256 }, (_, value) => {
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
      return value >>> 0;
    });
    const crc32 = (bytes) => {
      let crc = 0xffffffff;
      for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
      return (crc ^ 0xffffffff) >>> 0;
    };
    for (const file of files) {
      const name = encoder.encode(file.path);
      const data = encoder.encode(file.content);
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const header = new DataView(local.buffer);
      header.setUint32(0, 0x04034b50, true);
      header.setUint16(4, 20, true);
      header.setUint16(6, 0x0800, true); // UTF-8 filenames.
      header.setUint16(12, 33, true); // 1980-01-01, fixed for reproducible exports.
      header.setUint32(14, crc, true);
      header.setUint32(18, data.length, true);
      header.setUint32(22, data.length, true);
      header.setUint16(26, name.length, true);
      local.set(name, 30);
      chunks.push(local, data);

      const entry = new Uint8Array(46 + name.length);
      const central = new DataView(entry.buffer);
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(14, 33, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      entry.set(name, 46);
      directory.push(entry);
      offset += local.length + data.length;
    }
    const directoryLength = directory.reduce((total, entry) => total + entry.length, 0);
    const end = new Uint8Array(22);
    const footer = new DataView(end.buffer);
    footer.setUint32(0, 0x06054b50, true);
    footer.setUint16(8, files.length, true);
    footer.setUint16(10, files.length, true);
    footer.setUint32(12, directoryLength, true);
    footer.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let snapshot;
  let exported;
  const $ = (selector) => document.querySelector(selector);
  const selectedFile = () => exported.files[Number($('#export-file').value) || 0];

  function preview() {
    $('#export-preview').value = selectedFile().content;
    $('#export-status').textContent = '';
  }

  function refresh() {
    const format = $('#export-format').value;
    $('#export-context-label').hidden = format === 'json';
    $('#export-status').textContent = '';
    try {
      exported = root.ShipLoopExport.build(snapshot, { format, context: $('#export-context').value.trim() });
      $('#export-note').textContent = exported.note;
      $('#export-file').replaceChildren(...exported.files.map((file, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = file.path;
        return option;
      }));
      $('#export-file-label').hidden = exported.files.length === 1;
      $('#export-copy').textContent = format === 'actions' ? 'Copy selected file' : format === 'json' ? 'Copy JSON' : 'Copy prompt';
      $('#export-download').textContent = format === 'actions' ? 'Download Actions bundle (.zip)' : format === 'json' ? 'Download board (.json)' : 'Download prompt (.md)';
      $('#export-copy').disabled = false;
      $('#export-download').disabled = false;
      preview();
    } catch (error) {
      exported = null;
      $('#export-preview').value = '';
      $('#export-copy').disabled = true;
      $('#export-download').disabled = true;
      $('#export-status').textContent = `Export could not be generated: ${error.message}`;
    }
  }

  function open(state) {
    snapshot = JSON.parse(JSON.stringify(state));
    const control = snapshot.edges.filter((edge) => edge.kind === 'execution').length;
    $('#export-summary').textContent = `${snapshot.cards.length} nodes · ${control} control transitions · ${snapshot.edges.length - control} variable connections`;
    refresh();
    $('#export-dialog').showModal();
  }

  if (typeof document !== 'undefined') {
    $('#export-format').addEventListener('change', refresh);
    $('#export-context').addEventListener('input', refresh);
    $('#export-file').addEventListener('change', preview);
    $('#export-copy').addEventListener('click', async () => {
      if (!exported) return;
      try {
        await navigator.clipboard.writeText(selectedFile().content);
        $('#export-status').textContent = 'Copied. Paste it wherever you want to use it.';
      } catch {
        $('#export-preview').focus();
        $('#export-preview').select();
        $('#export-status').textContent = 'Clipboard access is unavailable. The text is selected; copy it with Ctrl+C or ⌘C, or download it.';
      }
    });
    $('#export-download').addEventListener('click', () => {
      if (!exported) return;
      if (exported.files.length > 1) {
        download(zip(exported.files), 'ship-loop-github-actions.zip');
      } else {
        const file = selectedFile();
        const type = $('#export-format').value === 'json' ? 'application/json' : 'text/markdown;charset=utf-8';
        download(new Blob([file.content], { type }), file.path.split('/').pop());
      }
      $('#export-status').textContent = 'Download requested. Your diagram is unchanged.';
    });
  }

  root.ShipLoopExportUI = { open, zip };
  if (typeof module !== 'undefined' && module.exports) module.exports = { zip };
})(globalThis);
