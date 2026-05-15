import type { CellValue, Column, ColumnReference, QuestionModel } from "./questionModel";
import { inferSharedJoinColumns } from "./relationships";

const STATUS_VALUES = ["pending", "processing", "completed", "cancelled"] as const;
const NAME_VALUES = [
  "Ada Lovelace",
  "Grace Hopper",
  "Linus Torvalds",
  "Margaret Hamilton",
  "Katherine Johnson",
  "Alan Turing",
  "Radia Perlman",
  "Barbara Liskov",
  "Donald Knuth",
  "Edsger Dijkstra",
  "John McCarthy",
  "Frances Allen",
] as const;
const CITY_VALUES = [
  "Toronto",
  "Vancouver",
  "Montreal",
  "Calgary",
  "Ottawa",
  "New York",
  "Chicago",
  "Mexico City",
  "Seattle",
  "Austin",
  "Berlin",
  "Paris",
] as const;
const COUNTRY_VALUES = [
  "Canada",
  "United States",
  "Mexico",
  "Canada",
  "United Kingdom",
  "Germany",
  "France",
  "Japan",
  "India",
  "Brazil",
  "Australia",
  "Spain",
] as const;
const REGION_VALUES = [
  "Ontario",
  "British Columbia",
  "Quebec",
  "Alberta",
  "New York",
  "Washington",
  "Texas",
  "Bavaria",
  "Ile-de-France",
  "Maharashtra",
  "Sao Paulo",
  "New South Wales",
] as const;
const DEFAULT_TIMESTAMP = Date.parse("2024-01-01T09:00:00Z");
const DEFAULT_ROW_COUNT = 12;

function normalizeColumnName(columnName: string): string {
  return columnName.trim().toLowerCase();
}

function hasColumnToken(columnName: string, token: string): boolean {
  return new RegExp(`(?:^|_)${token}(?:_|$)`).test(columnName);
}

function stableHash(input: string): number {
  let hash = 0;
  for (const character of input) {
    hash = (hash * 31 + character.charCodeAt(0)) % 9000;
  }
  return hash;
}

function buildSharedIdPools(
  question: QuestionModel,
  rowCount: number,
): Map<string, number[]> {
  const sharedPools = new Map<string, number[]>();
  inferSharedJoinColumns(question).forEach((columnName) => {
    const base = 1000 + stableHash(columnName);
    sharedPools.set(
      columnName,
      Array.from({ length: rowCount }, (_, rowIndex) => base + rowIndex),
    );
  });
  return sharedPools;
}

function semanticStringValue(columnName: string, rowIndex: number): string | null {
  if (hasColumnToken(columnName, "email")) {
    const baseName = NAME_VALUES[rowIndex % NAME_VALUES.length]
      .split(" ")[0]
      .toLowerCase();
    return `${baseName}@example.com`;
  }

  if (hasColumnToken(columnName, "city")) {
    return CITY_VALUES[rowIndex % CITY_VALUES.length];
  }

  if (hasColumnToken(columnName, "country")) {
    return COUNTRY_VALUES[rowIndex % COUNTRY_VALUES.length];
  }

  if (hasColumnToken(columnName, "region")) {
    return REGION_VALUES[rowIndex % REGION_VALUES.length];
  }

  if (hasColumnToken(columnName, "status")) {
    return STATUS_VALUES[rowIndex % STATUS_VALUES.length];
  }

  if (hasColumnToken(columnName, "name")) {
    return NAME_VALUES[rowIndex % NAME_VALUES.length];
  }

  return null;
}

function generateCellValue(column: Column, rowIndex: number): CellValue {
  const columnName = normalizeColumnName(column.name);

  if (column.type === "integer") {
    return rowIndex + 1;
  }

  if (column.type === "float") {
    return 12.5 + rowIndex * 2.5;
  }

  if (column.type === "boolean") {
    return rowIndex % 2 === 0;
  }

  if (column.type === "timestamp") {
    return new Date(DEFAULT_TIMESTAMP + rowIndex * 24 * 60 * 60 * 1000);
  }

  const semanticValue = semanticStringValue(columnName, rowIndex);
  if (semanticValue !== null) {
    return semanticValue;
  }

  return `${column.name} ${rowIndex + 1}`;
}

function generateTableRows(
  columns: Column[],
  rowCount: number,
  sharedIdPools: Map<string, number[]>,
): CellValue[][] {
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    columns.map((column) => {
      const columnName = normalizeColumnName(column.name);
      const sharedIdPool = sharedIdPools.get(columnName);
      if (sharedIdPool) {
        return sharedIdPool[rowIndex];
      }
      return generateCellValue(column, rowIndex);
    }),
  );
}

export function generateMockRows(
  columns: Column[],
  rowCount = DEFAULT_ROW_COUNT,
): CellValue[][] {
  return generateTableRows(columns, rowCount, new Map());
}

function findReferencedColumn(
  question: QuestionModel,
  reference: ColumnReference,
): { tableIndex: number; columnIndex: number } | null {
  for (let tableIndex = 0; tableIndex < question.tables.length; tableIndex += 1) {
    const table = question.tables[tableIndex];
    if (table.name.trim() !== reference.table.trim()) continue;

    for (let columnIndex = 0; columnIndex < table.columns.length; columnIndex += 1) {
      if (table.columns[columnIndex].name.trim() === reference.column.trim()) {
        return { tableIndex, columnIndex };
      }
    }
  }

  return null;
}

function fallbackColumnValues(
  column: Column,
  rowCount: number,
  sharedIdPools: Map<string, number[]>,
): CellValue[] {
  const sharedIdPool = sharedIdPools.get(normalizeColumnName(column.name));
  if (sharedIdPool) return sharedIdPool;

  return Array.from({ length: rowCount }, (_, rowIndex) => generateCellValue(column, rowIndex));
}

export function ensureQuestionSampleRows(
  question: QuestionModel,
  rowCount = DEFAULT_ROW_COUNT,
): QuestionModel {
  const sharedIdPools = buildSharedIdPools(question, rowCount);
  const resolvedColumnValues = new Map<string, CellValue[]>();
  const resolvingColumnKeys = new Set<string>();

  function resolveColumnValues(tableIndex: number, columnIndex: number): CellValue[] {
    const key = `${tableIndex}:${columnIndex}`;
    const existingValues = resolvedColumnValues.get(key);
    if (existingValues) return existingValues;

    const column = question.tables[tableIndex].columns[columnIndex];
    if (resolvingColumnKeys.has(key)) {
      return fallbackColumnValues(column, rowCount, sharedIdPools);
    }

    resolvingColumnKeys.add(key);

    let nextValues: CellValue[];
    if (column.references) {
      const referencedLocation = findReferencedColumn(question, column.references);
      if (referencedLocation) {
        const targetValues = resolveColumnValues(
          referencedLocation.tableIndex,
          referencedLocation.columnIndex,
        );
        nextValues = Array.from(
          { length: rowCount },
          (_, rowIndex) => targetValues[rowIndex % targetValues.length],
        );
      } else {
        nextValues = fallbackColumnValues(column, rowCount, sharedIdPools);
      }
    } else {
      nextValues = fallbackColumnValues(column, rowCount, sharedIdPools);
    }

    resolvingColumnKeys.delete(key);
    resolvedColumnValues.set(key, nextValues);
    return nextValues;
  }

  return {
    ...question,
    tables: question.tables.map((table, tableIndex) =>
      table.rows.length > 0
        ? table
        : {
            ...table,
            rows: Array.from({ length: rowCount }, (_, rowIndex) =>
              table.columns.map((_, columnIndex) => resolveColumnValues(tableIndex, columnIndex)[rowIndex]),
            ),
            sampleRowsMode: "generated",
          },
    ),
  };
}
