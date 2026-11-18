import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export function sanitizePostgresConnectionString(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  const match = /^(postgres(?:ql)?):\/\/([^:]+):(.+)@([^@/]+(?::\d+)?\/[^?#]*)(.*)$/i.exec(
    trimmed
  );

  let normalized = trimmed;
  if (match) {
    const [, proto, user, rawPass, hostAndDb] = match;
    let cleanPass = rawPass;
    if (cleanPass.startsWith('[') && cleanPass.endsWith(']')) {
      cleanPass = cleanPass.slice(1, -1);
    }
    try {
      cleanPass = decodeURIComponent(cleanPass);
    } catch {
      // Keep raw password if it contains unescaped % characters
    }
    const encodedPass = encodeURIComponent(cleanPass);
    normalized = `${proto}://${user}:${encodedPass}@${hostAndDb}`;
  }

  try {
    const parsed = new URL(normalized);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('pgbouncer');
    parsed.searchParams.delete('supa');
    parsed.searchParams.delete('uselibpqcompat');
    return parsed.toString();
  } catch {
    return normalized
      .replace(/([?&])sslmode=[^&]+(&|$)/i, '$1')
      .replace(/[?&]$/, '');
  }
}

export function getConnectionString(): string | undefined {
  const raw =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL;
  return raw ? sanitizePostgresConnectionString(raw.trim()) : undefined;
}

export function hasDatabaseConfig(): boolean {
  return Boolean(
    getConnectionString() ||
      process.env.SQL_HOST ||
      process.env.PGHOST
  );
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = getConnectionString();
    const poolMax = process.env.VERCEL ? 2 : 10;

    global._postgresPool = connectionString
      ? new Pool({
          connectionString,
          ssl:
            connectionString.includes('localhost') ||
            connectionString.includes('127.0.0.1')
              ? undefined
              : { rejectUnauthorized: false },
          max: poolMax,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 10000,
        })
      : new Pool({
          host: process.env.SQL_HOST || process.env.PGHOST,
          user: process.env.SQL_USER || process.env.PGUSER,
          password: process.env.SQL_PASSWORD || process.env.PGPASSWORD,
          database: process.env.SQL_DB_NAME || process.env.PGDATABASE,
          port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
          max: poolMax,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 10000,
        });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();

export const db = drizzle(pool, { schema });
