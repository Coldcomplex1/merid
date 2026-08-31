#!/usr/bin/env node
// The one rule in this repository with consequences outside it.
//
// Everything else here fails by looking wrong on a card. This fails by
// shipping, in a package a reader installs, a photograph whose licence says we
// may not - and it fails silently, because a wrongly-licensed picture looks
// exactly like a rightly-licensed one.
//
// So it is tested as a table rather than through a stage: every string these
// archives actually return, and the answer it must give for each.
//
//   node scripts/visual/test/licence.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptableLicence, licenceDeed } from '../lib/licence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

let failures = 0;
function ok(cond, what, detail) {
    console.log((cond ? '  ok   ' : '  FAIL ') + what + (detail ? ' -> ' + detail : ''));
    if (!cond) failures++;
}

// The strings are real: Wikimedia's LicenseShortName and Openverse's `license`
// plus `license_version`, in the spellings they come back in.
const ACCEPT = [
    'CC0', 'CC0 1.0', 'cc0', 'CC-0',
    'Public domain', 'PUBLIC DOMAIN', 'PDM', 'PD-USGov',
    'CC BY 2.0', 'CC BY 3.0', 'CC BY 4.0', 'BY 4.0', 'by 2.0',
    // The third source writes its own licence, and it permits redistribution -
    // which is why the pictures are in the package at all.
    'PEXELS'
];
const REFUSE = [
    // Share-alike: we crop, so the crop would have to carry the same licence.
    'CC BY-SA 4.0', 'CC BY-SA 3.0', 'by-sa 4.0', 'BY_SA', 'Attribution-ShareAlike',
    // No derivatives: the crop is the derivative.
    'CC BY-ND 4.0', 'by-nd 3.0',
    // Non-commercial, and every combination of it.
    'CC BY-NC 2.0', 'CC BY-NC-SA 4.0', 'CC BY-NC-ND 3.0', 'by-nc 4.0',
    // Free, but not on terms this project has taken on.
    'GFDL', 'FAL', 'Copyrighted free use', 'Fair use',
    // Nothing at all is the case that matters most: an archive that returns no
    // licence field must never be read as permission.
    '', '   ', null, undefined
];

console.log('\nlicences a cropped copy may ship under');
for (const l of ACCEPT) ok(acceptableLicence(l) === true, 'accepts ' + JSON.stringify(l));

console.log('\nlicences it must refuse');
for (const l of REFUSE) ok(acceptableLicence(l) === false, 'refuses ' + JSON.stringify(l));

// The failure mode worth naming: a rule that recognises what it likes and lets
// everything else through would pass every test above except this one.
console.log('\nanything unrecognised is refused, not waved through');
for (const l of ['MIT', 'Some Licence 1.0', 'CC', 'BY-SA-NC', 'unknown', 'ALL RIGHTS RESERVED']) {
    ok(acceptableLicence(l) === false, 'refuses ' + JSON.stringify(l));
}

console.log('\na link to the terms, or nothing');
ok(licenceDeed('cc0') === 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC0 points at the zero deed', licenceDeed('cc0'));
ok(licenceDeed('pdm') === 'https://creativecommons.org/publicdomain/mark/1.0/',
    'PDM points at the mark', licenceDeed('pdm'));
ok(licenceDeed('by', '3.0') === 'https://creativecommons.org/licenses/by/3.0/',
    'CC BY points at its own version', licenceDeed('by', '3.0'));
ok(licenceDeed('CC BY 4.0') === 'https://creativecommons.org/licenses/by/4.0/',
    'and reads the version out of the name when it has to', licenceDeed('CC BY 4.0'));
// A deed URL for a licence we refuse would be a link to terms we are not
// meeting - worse than no link at all.
ok(licenceDeed('by-sa', '4.0') === '', 'a refused licence gets no link');
ok(licenceDeed('GFDL') === '' && licenceDeed('') === '',
    'and neither does one we cannot name');
ok(licenceDeed('PEXELS') === 'https://www.pexels.com/license/',
    'the Pexels licence has a page too', licenceDeed('PEXELS'));

// ---- against what is actually shipped ---------------------------------------
//
// The table above says what the rule does. This says whether the artwork in
// the package obeys it - which is the question that matters, and the one that
// would otherwise only be asked by whoever ran the pipeline last.
const CREDITS = path.join(ROOT, 'merid-extension-final', 'vis', 'CREDITS.json');
if (fs.existsSync(CREDITS)) {
    console.log('\nthe pictures already in the package');
    const credits = JSON.parse(fs.readFileSync(CREDITS, 'utf8')).credits || {};
    const rows = Object.entries(credits);
    const names = [...new Set(rows.map(([, c]) => c.license || ''))];
    ok(rows.length > 0, 'there is artwork to check', rows.length + ' pictures');

    const bad = rows.filter(([, c]) => !acceptableLicence(c.license));
    ok(bad.length === 0,
        'every shipped picture is under a licence this project may ship',
        bad.length ? bad.slice(0, 3).map(([s, c]) => s + ': ' + c.license).join(', ') : 'all ' + names.join(', '));

    // Not "has a URL" - the pictures shipped before that field existed do not,
    // and will get one the next time stage 06 runs. What must hold is that we
    // COULD point a reader at the terms of every licence we ship: a licence
    // nobody can look up is one nobody can check us against.
    const unlinkable = names.filter(n => !licenceDeed(n));
    ok(unlinkable.length === 0,
        'and its terms can be linked to',
        unlinkable.length ? 'no known URL for: ' + unlinkable.join(', ') : names.join(', '));

    const wrong = rows.filter(([, c]) => c.licenseUrl && !/^https:\/\//.test(c.licenseUrl));
    ok(wrong.length === 0, 'every licence link that is recorded is an https URL');
} else {
    console.log('\n(no vis/CREDITS.json in this checkout - the shipped-artwork checks are skipped)');
}

console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
process.exit(failures ? 1 : 0);
