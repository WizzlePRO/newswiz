import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Load the repo-root .env (if any) so every package shares one config file. */
export function loadRootEnv(start = process.cwd()): void {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      const envPath = join(dir, '.env');
      if (existsSync(envPath)) process.loadEnvFile(envPath);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
