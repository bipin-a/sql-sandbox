export type ColumnType =
  | "integer"
  | "string"
  | "timestamp"
  | "float"
  | "boolean";

export interface Column {
  name: string;
  type: ColumnType;
}

export type CellValue = string | number | boolean | Date | null;

export interface Table {
  name: string;
  columns: Column[];
  rows: CellValue[][];
  sampleRowsMode?: "generated";
}

export interface ParseWarning {
  kind: "row_width_mismatch";
  message: string;
}

export interface QuestionModel {
  tables: Table[];
  warnings?: ParseWarning[];
}
