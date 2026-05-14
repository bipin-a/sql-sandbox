import * as duckdb from "@duckdb/duckdb-wasm";

export type QueryResult =
  | { columns: string[]; rows: unknown[][] }
  | { error: string };

export function decimalToString(words: ArrayLike<number>, scale: number): string {
  const len = words.length;
  const highWord = words[len - 1] ?? 0;
  const negative = (highWord & 0x80000000) !== 0;

  let magnitude = 0n;
  for (let i = len - 1; i >= 0; i -= 1) {
    let word = BigInt(words[i] >>> 0);
    if (negative) word = (~word & 0xffffffffn);
    magnitude = (magnitude << 32n) | word;
  }
  if (negative) magnitude += 1n;

  const digits = magnitude.toString();
  if (scale <= 0) return negative ? `-${digits}` : digits;

  const padded = digits.padStart(scale + 1, "0");
  const intPart = padded.slice(0, padded.length - scale);
  const fracPart = padded.slice(padded.length - scale);
  const body = `${intPart}.${fracPart}`;
  return negative ? `-${body}` : body;
}

function scaledBigIntToString(value: bigint, scale: number): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const digits = magnitude.toString();

  if (scale <= 0) return negative ? `-${digits}` : digits;

  const padded = digits.padStart(scale + 1, "0");
  const intPart = padded.slice(0, padded.length - scale);
  const fracPart = padded.slice(padded.length - scale);
  const body = `${intPart}.${fracPart}`;
  return negative ? `-${body}` : body;
}

export function normalizeQueryValue(value: unknown, scale: number | null): unknown {
  if (value === null || value === undefined) return value;
  if (scale !== null) {
    if (typeof value === "bigint") {
      return scaledBigIntToString(value, scale);
    }
    if (value instanceof Uint32Array || value instanceof Int32Array) {
      return decimalToString(value, scale);
    }
  }
  return value;
}

export function normalizeQueryRows(
  columns: string[],
  scales: Array<number | null>,
  rows: Array<Record<string, unknown>>,
): unknown[][] {
  return rows.map((row) =>
    columns.map((column, index) => normalizeQueryValue(row[column], scales[index] ?? null)),
  );
}

export function compareQueryResults(
  expected: QueryResult,
  actual: QueryResult,
): boolean {
  if ("error" in expected || "error" in actual) return false;
  if (expected.rows.length !== actual.rows.length) return false;

  return expected.rows.every((expectedRow, rowIndex) => {
    const actualRow = actual.rows[rowIndex];
    if (!actualRow || expectedRow.length !== actualRow.length) return false;

    return expectedRow.every((cell, cellIndex) => Object.is(cell, actualRow[cellIndex]));
  });
}

export interface Runner {
  loadSchema(sql: string): Promise<void>;
  runQuery(sql: string): Promise<QueryResult>;
  close(): Promise<void>;
}

async function makeWorker(workerUrl: string): Promise<Worker> {
  const blob = new Blob([`importScripts("${workerUrl}");`], {
    type: "application/javascript",
  });
  return new Worker(URL.createObjectURL(blob));
}

export async function createRunner(): Promise<Runner> {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker = await makeWorker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();

  return {
    async loadSchema(sql: string) {
      await conn.query(sql);
    },
    async runQuery(sql: string): Promise<QueryResult> {
      try {
        const table = await conn.query(sql);
        const fields = table.schema.fields;
        const columns = fields.map((f) => f.name);
        const scales = fields.map((f) => {
          const t = f.type as { typeId?: number; scale?: number };
          return typeof t.scale === "number" ? t.scale : null;
        });
        const rows = normalizeQueryRows(columns, scales, table.toArray());
        return { columns, rows };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
    async close() {
      await conn.close();
      await db.terminate();
      worker.terminate();
    },
  };
}
