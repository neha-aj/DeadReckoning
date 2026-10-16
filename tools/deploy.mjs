/* Puts the app live on Vercel, on both links. Run from the dead-reckoning folder:
 *   node tools/deploy.mjs            laptop and phone links
 *   node tools/deploy.mjs laptop     only https://dead-reckoning-mu.vercel.app
 *   node tools/deploy.mjs phone      only https://dead-reckoning-mobile.vercel.app
 *
 * Both links serve the same files: the app is responsive and switches to the phone layout
 * (full-screen map, draggable bottom sheet) on narrow screens by itself.
 * The first time on a computer, sign in once with `npx vercel login`. The project IDs below
 * are not secrets: they only say which Vercel project to deploy to, and your login still
 * decides whether you may.
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'team_9VkKRu8RLFp9eU5Evya5cZOS';
const TARGETS = {
  laptop: { project: 'prj_HSQ98ffVXHUkVn2eEXFPgxaR6tbi', url: 'https://dead-reckoning-mu.vercel.app' },
  phone: { project: 'prj_NQhCcGmdzRDPv1IghtzhfAemdE2O', url: 'https://dead-reckoning-mobile.vercel.app' },
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pick = process.argv[2];
const names = pick ? [pick] : Object.keys(TARGETS);
for (const name of names) {
  const t = TARGETS[name];
  if (!t) { console.error(`Unknown target "${name}". Use laptop or phone.`); process.exit(1); }
  // Static site: upload the folder as-is (minus .vercelignore) and make it the live site.
  execSync('npx --yes vercel@64 deploy --prod --yes', {
    cwd: root, stdio: 'inherit', env: { ...process.env, VERCEL_ORG_ID: ORG, VERCEL_PROJECT_ID: t.project },
  });
  console.log(`\n${name}: live at ${t.url}\n`);
}
