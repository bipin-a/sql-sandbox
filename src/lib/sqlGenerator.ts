import type { CellValue, ColumnType, QuestionModel, Table } from "./questionModel";

const DUCKDB_TYPES: Record<ColumnType, string> = {
  integer: "INTEGER",
  string: "VARCHAR",
  timestamp: "TIMESTAMP",
  float: "DOUBLE",
  boolean: "BOOLEAN",
};

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function literal(value: CellValue, type: ColumnType): string {
  if (value === null) return "NULL";
  switch (type) {
    case "integer":
    case "float":
      return String(value);
    case "boolean":
      return value ? "TRUE" : "FALSE";
    case "string":
      return `'${String(value).replace(/'/g, "''")}'`;
    case "timestamp": {
      const iso =
        value instanceof Date
          ? value.toISOString().replace("T", " ").replace("Z", "")
          : String(value);
      return `TIMESTAMP '${iso}'`;
    }
  }
}

function tableSql(table: Table): string {
  const cols = table.columns
    .map((c) => `${quoteIdent(c.name)} ${DUCKDB_TYPES[c.type]}`)
    .join(", ");
  const create = `CREATE OR REPLACE TABLE ${quoteIdent(table.name)} (${cols});`;

  if (table.rows.length === 0) return create;

  const colList = table.columns.map((c) => quoteIdent(c.name)).join(", ");
  const valuesSql = table.rows
    .map((row) => {
      const cells = row
        .map((cell, i) => literal(cell, table.columns[i].type))
        .join(", ");
      return `(${cells})`;
    })
    .join(", ");
  const insert = `INSERT INTO ${quoteIdent(table.name)} (${colList}) VALUES ${valuesSql};`;

  return `${create}\n${insert}`;
}

export function generateDropTablesSql(tableNames: string[]): string {
  return tableNames.map((tableName) => `DROP TABLE IF EXISTS ${quoteIdent(tableName)};`).join("\n");
}

export function generateSchemaSql(model: QuestionModel): string {
  return model.tables.map(tableSql).join("\n");
}
