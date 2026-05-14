import type { QuestionModel } from "./questionModel";

function normalizeColumnName(columnName: string): string {
  return columnName.trim().toLowerCase();
}

function isJoinableIdColumnName(columnName: string): boolean {
  return normalizeColumnName(columnName).endsWith("_id");
}

export function inferSharedJoinColumns(question: QuestionModel): string[] {
  const counts = new Map<string, number>();
  const orderedNames: string[] = [];

  question.tables.forEach((table) => {
    table.columns.forEach((column) => {
      if (!isJoinableIdColumnName(column.name)) return;
      const normalizedName = normalizeColumnName(column.name);
      if (!counts.has(normalizedName)) {
        orderedNames.push(normalizedName);
      }
      counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
    });
  });

  return orderedNames.filter((columnName) => (counts.get(columnName) ?? 0) > 1);
}

export function inferJoinHintsByTable(question: QuestionModel): string[][] {
  const sharedJoinColumns = new Set(inferSharedJoinColumns(question));

  return question.tables.map((table) =>
    table.columns
      .map((column) => normalizeColumnName(column.name))
      .filter((columnName, columnIndex, names) => {
        return sharedJoinColumns.has(columnName) && names.indexOf(columnName) === columnIndex;
      }),
  );
}
