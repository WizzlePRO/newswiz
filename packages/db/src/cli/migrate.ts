import { closePool, getPool } from '../pool.ts';
import { migrate } from '../migrate.ts';

const applied = await migrate(getPool(), (m) => console.log(m));
console.log(applied.length ? `migrations done (${applied.length} applied)` : 'database is up to date');
await closePool();
