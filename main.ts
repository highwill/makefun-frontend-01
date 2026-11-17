// Hands this entry in: copies app/ and screenshots/ next to this file into the
// output directory and writes /output/dossier.json with the kit's buildDossier
// from vendor/makefun-frontend.ts. Node 22, standard library only; no network.
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// vendor/makefun-frontend.ts must stay the kit's byte-identical copy, and this
// file must stay at the repository root, beside app/ and screenshots/.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// The scorer's own caps, from the kit's reference/gate.json: text_max_bytes is
// the only one that shapes the dossier's bytes; the others refuse an entry the
// scorer would refuse anyway (over 3 screenshots or one over 256 KiB; app/
// over 993 files and directories or 16 MiB).
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(source, target) {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function handIn() {
  mkdirSync(outputDir, { recursive: true });
  const appOut = join(outputDir, 'app');
  const shotsOut = join(outputDir, 'screenshots');
  rmSync(appOut, { recursive: true, force: true });
  rmSync(shotsOut, { recursive: true, force: true });
  copyTree(join(repoRoot, 'app'), appOut);
  if (existsSync(join(repoRoot, 'screenshots'))) {
    copyTree(join(repoRoot, 'screenshots'), shotsOut);
  }
  const dossier = buildDossier(outputDir, DOSSIER_OPTIONS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  console.log(`wrote ${join(outputDir, 'dossier.json')} (${dossier.length} bytes)`);
}

handIn();
