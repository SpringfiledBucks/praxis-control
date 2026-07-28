import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite, type Transaction as PGliteTransaction } from '@electric-sql/pglite';
import pg from 'pg';
import type { AppConfig } from '../config.js';

const { Pool } = pg;

export type QueryResult<T> = {
  rows: T[];
  rowCount: number;
};

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  readonly backend: 'pglite' | 'postgres';
  transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  backup?(targetDirectory: string): Promise<string>;
}

function wrapPGliteQueryable(client: PGlite | PGliteTransaction): Queryable {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
      const result = await client.query<T>(sql, [...params]);
      return {
        rows: result.rows,
        rowCount: result.rows.length > 0 ? result.rows.length : (result.affectedRows ?? 0),
      };
    },
    async exec(sql: string): Promise<void> {
      await client.exec(sql);
    },
  };
}

class PGliteDatabase implements Database {
  readonly backend = 'pglite' as const;

  private constructor(private readonly database: PGlite) {}

  static async create(dataDirectory: string): Promise<PGliteDatabase> {
    const resolved = path.resolve(dataDirectory);
    await mkdir(path.dirname(resolved), { recursive: true });
    const database = await PGlite.create(resolved);
    return new PGliteDatabase(database);
  }

  query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    return wrapPGliteQueryable(this.database).query<T>(sql, params);
  }

  exec(sql: string): Promise<void> {
    return wrapPGliteQueryable(this.database).exec(sql);
  }

  transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    return this.database.transaction((transaction) => work(wrapPGliteQueryable(transaction)));
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  async backup(targetDirectory: string): Promise<string> {
    await mkdir(targetDirectory, { recursive: true });
    const blob = await this.database.dumpDataDir('gzip');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(targetDirectory, `praxis-control-pglite-${timestamp}.tgz`);
    await writeFile(target, new Uint8Array(await blob.arrayBuffer()));
    return target;
  }
}

class PostgresDatabase implements Database {
  readonly backend = 'postgres' as const;
  private readonly pool: pg.Pool;

  constructor(config: AppConfig) {
    if (!config.databaseUrl) throw new Error('PostgreSQL 连接字符串缺失');
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
      max: 8,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30_000,
      application_name: 'praxis-control',
    });
  }

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, [...params]);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const queryable: Queryable = {
      async query<R>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<R>> {
        const result = await client.query(sql, [...params]);
        return { rows: result.rows as R[], rowCount: result.rowCount ?? result.rows.length };
      },
      async exec(sql: string): Promise<void> {
        await client.query(sql);
      },
    };
    try {
      await client.query('BEGIN');
      const result = await work(queryable);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createDatabase(config: AppConfig): Promise<Database> {
  return config.databaseMode === 'pglite'
    ? PGliteDatabase.create(config.pgliteDataDir)
    : new PostgresDatabase(config);
}

export function withTransaction<T>(database: Database, work: (client: Queryable) => Promise<T>): Promise<T> {
  return database.transaction(work);
}
