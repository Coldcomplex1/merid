// Zero-dependency "lint": syntax-check every extension/script JS file with `node --check`.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
    'background.js',
    'content.js',
    'popup.js',
    'options.js',
    'deck.js',
    'lib/vocab-core.js',
    'scripts/build.js',
    'scripts/lint.js',
    'scripts/gen-assets.js',
    'scripts/png-resize.js'
];

let failed = 0;
for (const rel of files) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { console.error(`MISSING  ${rel}`); failed++; continue; }
    try {
        execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
        console.log(`ok       ${rel}`);
    } catch (e) {
        console.error(`SYNTAX   ${rel}\n${e.stderr ? e.stderr.toString() : e.message}`);
        failed++;
    }
}

if (failed) { console.error(`\n${failed} file(s) failed.`); process.exit(1); }
console.log('\nAll files passed syntax check.');
