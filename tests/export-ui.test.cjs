const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { zip } = require('../docs/export-ui.js');

test('downloaded ZIP extracts every file with correct paths, CRCs, and Unicode contents', async () => {
  const files = [
    { path: '.github/workflows/ship-loop.yml', content: 'name: Ship loop\n' },
    { path: 'ship-loop/diagram-船.md', content: '日本語 → café\n'.repeat(1000) },
    { path: 'ship-loop/empty.txt', content: '' },
  ];
  const directory = mkdtempSync(join(tmpdir(), 'ship-loop-zip-'));
  try {
    const archive = zip(files);
    assert.equal(archive.type, 'application/zip');
    writeFileSync(join(directory, 'bundle.zip'), Buffer.from(await archive.arrayBuffer()));
    writeFileSync(join(directory, 'expected.json'), JSON.stringify(files));
    execFileSync('python3', ['-c', `
import json, pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
files = json.loads((root / 'expected.json').read_text())
with zipfile.ZipFile(root / 'bundle.zip') as archive:
    assert archive.testzip() is None
    assert archive.namelist() == [f['path'] for f in files]
    archive.extractall(root / 'extracted')
    for f in files:
        assert (root / 'extracted' / f['path']).read_text() == f['content']
`, directory]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
