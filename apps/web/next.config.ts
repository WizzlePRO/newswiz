import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// One .env at the repo root configures every package, including this app.
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@newswiz/db', '@newswiz/net', '@newswiz/reader'],
  // Native-ish server dependencies stay out of the bundle.
  serverExternalPackages: ['pg', 'jsdom', '@mozilla/readability', 'sanitize-html'],
  images: { unoptimized: true },
};

export default config;
