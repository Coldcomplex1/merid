// Does every production dependency actually run on the Node this project pins?
//
// This test exists because of a specific outage. `sanitize-html@2.17.6` declares
// `engines: { node: ">=22.12.0" }`, because it is CommonJS and requires an
// ESM-only parser, which only works from Node 22.12 onward. This project pins
// `engines.node: "22.x"`, which permits 22.0.0. The development machine happened
// to run 22.22.2, so every test passed; Vercel's Node 22 runtime is older, so
// every blog page returned a crash. Nothing compared the two numbers, and the
// mismatch was invisible until production.
//
// npm prints EBADENGINE for this at install time, but only against the machine
// doing the installing - never against the floor the project promises. That gap
// is exactly what this closes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const API_DIR = fileURLToPath(new URL('../api', import.meta.url))

/**
 * Every npm package the serverless functions import.
 *
 * Scoped to api/ on purpose. The check that matters is whether a package runs
 * on the Node the *functions* get, and the browser-side dependencies are a
 * different question: Vite bundles react-router into a browser bundle, where the
 * Node it was installed under is irrelevant. Including them made this test flag
 * react-router for needing a Node version that nothing about it actually needs
 * at runtime, which is the fastest way to teach someone to ignore a test.
 */
function packagesImportedByFunctions() {
  const found = new Set()

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!entry.endsWith('.js') && !entry.endsWith('.mjs')) continue

      const source = readFileSync(path, 'utf8')
      // Static `from 'x'` and dynamic `import('x')`, bare specifiers only:
      // anything starting with . or node: is not an npm package.
      for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const spec = match[1]
        if (spec.startsWith('.') || spec.startsWith('node:') || spec.startsWith('/')) continue
        // Keep the package name, dropping any subpath.
        found.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
      }
    }
  }

  walk(API_DIR)
  return [...found].sort()
}

/**
 * The lowest Node version a range admits.
 *
 * Only the forms that appear in real `engines` fields: "22.x", ">=22.12.0",
 * "^20.19.0 || >=22.12.0", "18 || 20 || >=22". For an `||` union the floor is
 * the lowest branch, since npm will accept any of them.
 *
 * @returns {[number, number, number] | null} null when nothing can be inferred.
 */
export function floorOf(range) {
  if (!range || typeof range !== 'string') return null

  const branches = range.split('||').map((b) => b.trim()).filter(Boolean)
  if (!branches.length) return null

  const floors = []
  for (const branch of branches) {
    // "22.x", "22", "22.12.0", ">=22.12.0", "^20.19.0", "~22.1", ">22.11.0"
    const match = /(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/.exec(branch)
    if (!match) continue

    const num = (part) => (part === undefined || part === 'x' || part === '*' ? 0 : Number(part))
    const floor = [Number(match[1]), num(match[2]), num(match[3])]

    // A strict `>` means the floor is the next patch up, not this version.
    if (/^>\s*[^=]/.test(branch)) floor[2] += 1
    floors.push(floor)
  }

  if (!floors.length) return null
  return floors.sort(compare)[0]
}

function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

const show = (v) => v.join('.')

test('floorOf reads the shapes that appear in real engines fields', () => {
    assert.deepEqual(floorOf('22.x'), [22, 0, 0])
    assert.deepEqual(floorOf('>=22.12.0'), [22, 12, 0])
    assert.deepEqual(floorOf('^20.19.0'), [20, 19, 0])
    assert.deepEqual(floorOf('>=20'), [20, 0, 0])
    assert.deepEqual(floorOf('>20.1.0'), [20, 1, 1])
    // A union is satisfied by its lowest branch.
    assert.deepEqual(floorOf('^20.19.0 || >=22.12.0'), [20, 19, 0])
    assert.equal(floorOf(undefined), null)
    assert.equal(floorOf(''), null)
})

test('this project promises a Node version', () => {
    // Everything below depends on there being a floor to compare against.
    assert.ok(pkg.engines?.node, 'package.json must declare engines.node')
    assert.ok(floorOf(pkg.engines.node), `engines.node "${pkg.engines.node}" must have a readable floor`)
})

test('the functions only import packages that are declared dependencies', () => {
    // A function importing something that is only a devDependency works locally
    // and is absent from the deployed bundle.
    const declared = new Set(Object.keys(pkg.dependencies ?? {}))
    const undeclared = packagesImportedByFunctions().filter((name) => !declared.has(name))
    assert.deepEqual(undeclared, [], `api/ imports packages missing from "dependencies": ${undeclared.join(', ')}`)
})

test('no package the functions import needs a newer Node than this project promises', () => {
    const ours = floorOf(pkg.engines.node)
    const offenders = []

    for (const name of packagesImportedByFunctions()) {
        let manifest
        try {
            manifest = require.resolve(`${name}/package.json`)
        } catch {
            // Some packages do not export their manifest; fall back to the path.
            const guess = new URL(`../node_modules/${name}/package.json`, import.meta.url)
            if (!existsSync(guess)) continue
            manifest = guess
        }

        const dep = JSON.parse(readFileSync(manifest, 'utf8'))
        const theirs = floorOf(dep.engines?.node)
        if (!theirs) continue

        if (compare(theirs, ours) > 0) {
            offenders.push(
                `${name}@${dep.version} needs Node >=${show(theirs)}, ` +
                `but this project promises only ${pkg.engines.node} (floor ${show(ours)})`,
            )
        }
    }

    assert.deepEqual(
        offenders,
        [],
        'A package the serverless functions import requires a newer Node than engines.node\n' +
        'guarantees. It will work on a developer machine running a recent patch and fail on a\n' +
        'deployment platform running an older one - which is exactly how the blog went down.\n' +
        'Either raise engines.node, or pin the dependency lower:\n  ' +
        offenders.join('\n  '),
    )
})

test('the guard catches the dependency that actually broke production', () => {
    // Proof the check is worth having: these are the real numbers from the
    // outage. sanitize-html@2.17.6 against engines.node "22.x".
    const ours = floorOf('22.x')
    const theirs = floorOf('>=22.12.0')
    assert.ok(
        compare(theirs, ours) > 0,
        'sanitize-html@2.17.6 needing >=22.12.0 must register as newer than the 22.x floor',
    )
})
