import type {
  CellValue,
  ColumnType,
  ParseWarning,
  QuestionModel,
  Table,
} from "./questionModel";
import { parseTimestampText } from "./timestamps";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitPipeFields(line: string): string[] | null {
  if (!line.includes("|")) return null;

  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const fields = trimmed.split("|").map((field) => field.trim());
  return fields.length >= 1 ? fields : null;
}

function isMarkdownSeparatorLine(line: string): boolean {
  const fields = splitPipeFields(line);
  return (
    fields !== null && fields.every((field) => /^:?-{3,}:?$/.test(field))
  );
}

function parseDeclaredType(raw: string): ColumnType {
  const normalized = raw.trim().toLowerCase();
  if (normalized.startsWith("integer")) return "integer";
  if (normalized.startsWith("timestamp")) return "timestamp";
  if (normalized.startsWith("float")) return "float";
  if (normalized.startsWith("boolean")) return "boolean";
  return "string";
}

function coerceCell(type: ColumnType, raw: string): CellValue {
  const value = raw.trim();
  if (value === "-" || value === "") return null;
  if (type === "integer") return Number.parseInt(value, 10);
  if (type === "float") return Number.parseFloat(value);
  if (type === "boolean") return value.toLowerCase() === "true";
  if (type === "timestamp") return parseTimestampText(value);
  return value;
}

function splitColumnDefinition(line: string): [string, string] {
  const pipeFields = splitPipeFields(line);
  if (pipeFields) {
    const [name, type = ""] = pipeFields;
    return [name, type];
  }

  if (line.includes("\t")) {
    const [name, type] = line.split("\t");
    return [name, type];
  }

  const spacedFields = line.trim().split(/\s{2,}/);
  if (spacedFields.length >= 2) {
    return [spacedFields[0], spacedFields.slice(1).join(" ")];
  }

  const [name, ...typeParts] = line.trim().split(/\s+/);
  return [name, typeParts.join(" ")];
}

function minTokenCountForType(type: ColumnType): number {
  return type === "timestamp" ? 2 : 1;
}

function splitRowFields(
  columns: Table["columns"],
  line: string,
): { cells: string[]; fieldCount: number } {
  const pipeFields = splitPipeFields(line);
  if (pipeFields) {
    return { cells: pipeFields, fieldCount: pipeFields.length };
  }

  if (line.includes("\t")) {
    const cells = line.split("\t");
    return { cells, fieldCount: cells.length };
  }

  if (/\s{2,}/.test(line)) {
    const cells = line.trim().split(/\s{2,}/);
    return { cells, fieldCount: cells.length };
  }

  const tokens = line.trim().split(/\s+/);
  const cells: string[] = [];
  let fieldCount = 0;
  let tokenIndex = 0;
  let pendingToken: string | null = null;

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const currentColumn = columns[columnIndex];
    const usedPendingToken = pendingToken !== null;
    const currentToken = pendingToken ?? tokens[tokenIndex];
    pendingToken = null;

    if (currentToken === undefined) {
      cells.push("");
      continue;
    }

    fieldCount += 1;

    if (currentColumn.type === "timestamp") {
      if (currentToken === "-") {
        cells.push("-");
        if (!usedPendingToken) tokenIndex += 1;
        continue;
      }

      const nextToken = tokens[tokenIndex + 1];
      if (nextToken === undefined) {
        cells.push(currentToken);
        tokenIndex += 1;
        continue;
      }

      if (nextToken.endsWith("-")) {
        cells.push(`${currentToken} ${nextToken.slice(0, -1)}`);
        pendingToken = "-";
        tokenIndex += 2;
        continue;
      }

      cells.push(`${currentToken} ${nextToken}`);
      tokenIndex += 2;
      continue;
    }

    if (currentColumn.type === "string") {
      const remainingColumns = columns.slice(columnIndex + 1);
      const minRemainingTokens = remainingColumns.reduce(
        (sum, column) => sum + minTokenCountForType(column.type),
        0,
      );
      const availableTokens = tokens.length - tokenIndex;
      const stringTokenCount = Math.max(1, availableTokens - minRemainingTokens);
      cells.push(tokens.slice(tokenIndex, tokenIndex + stringTokenCount).join(" "));
      tokenIndex += stringTokenCount;
      continue;
    }

    cells.push(currentToken);
    tokenIndex += 1;
  }

  return { cells, fieldCount };
}

export function parseSchemaText(input: string): QuestionModel {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const tables: Table[] = [];
  const warnings: ParseWarning[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/ table:$/i.test(lines[index])) continue;

    const tableName = lines[index].replace(/\s+table:$/i, "");
    const nextTableIndex = lines.findIndex(
      (line, lineIndex) => lineIndex > index && / table:$/i.test(line),
    );
    const blockEnd = nextTableIndex === -1 ? lines.length : nextTableIndex;
    const exampleHeaderIndex = lines.findIndex(
      (line, lineIndex) =>
        lineIndex > index &&
        lineIndex < blockEnd &&
        new RegExp(`^${escapeRegExp(tableName)}\\s+Example Input:$`, "i").test(line),
    );

    const columnBlockEnd = exampleHeaderIndex === -1 ? blockEnd : exampleHeaderIndex;
    const columnLines = lines
      .slice(index + 2, columnBlockEnd)
      .filter((line) => !isMarkdownSeparatorLine(line));
    const columns = columnLines.map((line) => {
      const [name, type] = splitColumnDefinition(line);
      return {
        name,
        type: parseDeclaredType(type),
      };
    });

    const rowLines =
      exampleHeaderIndex === -1
        ? []
        : lines
            .slice(exampleHeaderIndex + 2, blockEnd)
            .filter((line) => !isMarkdownSeparatorLine(line));
    const rows = rowLines.map((line) => {
      const { cells, fieldCount } = splitRowFields(columns, line);
      if (fieldCount !== columns.length) {
        warnings.push({
          kind: "row_width_mismatch",
          message: `Row width mismatch in table "${tableName}": expected ${columns.length} cells but got ${fieldCount}.`,
        });
      }
      return columns.map((column, cellIndex) =>
        coerceCell(column.type, cells[cellIndex] ?? ""),
      );
    });

    tables.push({
      name: tableName,
      columns,
      rows,
    });
  }

  return { tables, warnings };
}
