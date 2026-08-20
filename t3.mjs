import { startFakeArchives } from './scripts/visual/test/fake-archives.mjs';
import { spawn } from 'node:child_process';
const a = await startFakeArchives({});
const env = { ...process.env, MERID_OPENVERSE_URL: a.base, MERID_WIKIMEDIA_URL: a.base,
  MERID_PEXELS_URL: a.base, PEXELS_API_KEY: 'fake' };
const p = spawn('node', ['scripts/visual/03-fetch.mjs', '--limit', '8'], { env, stdio: 'inherit' });
p.on('exit', c => { a.stop(); process.exit(c); });
