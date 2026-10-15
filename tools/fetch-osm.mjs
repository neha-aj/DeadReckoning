// Downloads the raw OpenStreetMap extracts for our slice of Bengaluru.
// Run once while online:  node tools/fetch-osm.mjs
// Data © OpenStreetMap contributors (ODbL).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchQuery(name) {
  const query = readFileSync(join(here, `${name}.ql`), 'utf8');
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'dead-reckoning-hackathon/0.1' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(200000),
        });
        const text = await res.text();
        if (res.ok && text.trimStart().startsWith('{')) {
          writeFileSync(join(here, '..', 'data', `raw_${name}.json`), text);
          console.log(`${name}: ${text.length} bytes from ${ep}`);
          return;
        }
        console.log(`${name}: ${ep} -> HTTP ${res.status}`);
      } catch (e) {
        console.log(`${name}: ${ep} -> ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`could not fetch ${name}`);
}

for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['roads', 'pois', 'areas']) {
  await fetchQuery(name);
}
