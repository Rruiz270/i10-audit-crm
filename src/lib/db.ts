import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// During `next build` we may not have DATABASE_URL yet (we still want to
// compile pages & collect metadata without a live connection). A well-formed
// placeholder URL makes neon() happy; it doesn't connect until a query runs.
const url =
  process.env.DATABASE_URL ??
  'postgresql://build:build@build.placeholder.neon.tech/build?sslmode=require';

const sql = neon(url);
export const db = drizzle(sql, { schema });
export { schema };
