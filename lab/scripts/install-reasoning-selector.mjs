import fs from 'node:fs';
import path from 'node:path';

import { homeDir, repoRoot } from './prepare.mjs';

export const installReasoningSelector = () => {
  const name = 'reasoning-selector';
  const source = path.join(repoRoot, 'packages', 'extensions', 'extensions', name);
  const destination = path.join(homeDir, 'extensions', name);
  fs.mkdirSync(destination, { recursive: true });
  for (const file of ['index.ts', 'ReasoningSelector.jsx', 'icon.png']) {
    const target = path.join(destination, file);
    const bundled = path.join(source, file);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(bundled, target, fs.constants.COPYFILE_EXCL);
    } else if (!fs.readFileSync(target).equals(fs.readFileSync(bundled))) {
      fs.copyFileSync(bundled, target);
    }
  }
};
