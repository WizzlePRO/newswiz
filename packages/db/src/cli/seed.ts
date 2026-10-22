import { fileURLToPath } from 'node:url';
import { closePool, getPool } from '../pool.ts';
import { applyBiasRatings, applySeed, loadBiasFile, loadSeedFile } from '../seed.ts';

const dataDir = fileURLToPath(new URL('../../../../data/', import.meta.url));
const sourcesPath = process.argv[2] ?? `${dataDir}sources.json`;
const biasPath = process.argv[3] ?? `${dataDir}bias-ratings.json`;

const sources = await loadSeedFile(sourcesPath);
const { feeds } = await applySeed(getPool(), sources);
console.log(`seeded ${sources.length} sources and ${feeds} feeds from ${sourcesPath}`);
const rated = await applyBiasRatings(getPool(), await loadBiasFile(biasPath));
console.log(`applied bias ratings to ${rated} sources from ${biasPath}`);
await closePool();
