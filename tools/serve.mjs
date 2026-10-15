// Zero-dependency server:  node tools/serve.mjs [port]
//   http://localhost:<port>        this computer
//   https://<wifi-ip>:<port+153>   phones on the same Wi-Fi (needs tools/cert/*.pem, see README)
// Phones need HTTPS: survivor keys, camera and microphone only work in a secure context.
import { createServer } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = +process.argv[2] || 5290, sport = port + 153;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const handler = async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(root) || /^[\\/](tools|data|\.git)[\\/]/.test(file.slice(root.length))) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
};
createServer(handler).listen(port, () => console.log(`Dead Reckoning on http://localhost:${port}`));
const cert = join(root, 'tools', 'cert');
if (existsSync(join(cert, 'key.pem'))) {
  createHttps({ key: readFileSync(join(cert, 'key.pem')), cert: readFileSync(join(cert, 'cert.pem')) }, handler).listen(sport, () => {
    const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    for (const ip of ips) console.log(`Phones on the same Wi-Fi: https://${ip}:${sport}  (tap "Advanced" → "Proceed" once)`);
  });
}
