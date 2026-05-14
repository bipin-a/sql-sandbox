import { describe, it, expect } from "vitest";
import { generateSchemaSql } from "./sqlGenerator";
import type { QuestionModel } from "./questionModel";

describe("sqlGenerator", () => {
  it("generates CREATE OR REPLACE TABLE and INSERT for a single integer column with one row", () => {
    const model: QuestionModel = {
      tables: [
        {
          name: "nums",
          columns: [{ name: "n", type: "integer" }],
          rows: [[42]],
        },
      ],
    };

    const sql = generateSchemaSql(model);

    expect(sql).toContain("CREATE OR REPLACE TABLE");
    expect(sql).toContain("nums");
    expect(sql).toContain("INTEGER");
    expect(sql).toContain("INSERT INTO");
    expect(sql).toContain("42");
  });

  it("emits NULL for null cells, not the string 'null'", () => {
    const model: QuestionModel = {
      tables: [
        {
          name: "t",
          columns: [
            { name: "a", type: "integer" },
            { name: "b", type: "string" },
          ],
          rows: [[null, null]],
        },
      ],
    };

    const sql = generateSchemaSql(model);

    // INSERT row should have bareword NULL, not 'null' or 'NULL'.
    const insertLine = sql.split("\n").find((l) => l.startsWith("INSERT"))!;
    expect(insertLine).toMatch(/VALUES \(NULL, NULL\)/);
    expect(insertLine).not.toMatch(/'null'/i);
  });

  it("doubles single quotes inside string cells", () => {
    const model: QuestionModel = {
      tables: [
        {
          name: "t",
          columns: [{ name: "s", type: "string" }],
          rows: [["it's"]],
        },
      ],
    };

    const sql = generateSchemaSql(model);
    const insertLine = sql.split("\n").find((l) => l.startsWith("INSERT"))!;

    expect(insertLine).toContain("'it''s'");
    expect(insertLine).not.toContain("\\'");
  });

  it("emits TIMESTAMP literals for timestamp columns from a Date", () => {
    const model: QuestionModel = {
      tables: [
        {
          name: "t",
          columns: [{ name: "ts", type: "timestamp" }],
          rows: [[new Date("2022-06-05T09:12:00Z")]],
        },
      ],
    };

    const sql = generateSchemaSql(model);
    const insertLine = sql.split("\n").find((l) => l.startsWith("INSERT"))!;

    // DuckDB-parseable timestamp literal: TIMESTAMP 'YYYY-MM-DD HH:MM:SS'
    expect(insertLine).toMatch(
      /TIMESTAMP '2022-06-05 09:12:00(\.\d+)?'/,
    );
  });

  it("emits CREATE + INSERT for multiple tables in declaration order", () => {
    const model: QuestionModel = {
      tables: [
        {
          name: "first",
          columns: [{ name: "x", type: "integer" }],
          rows: [[1]],
        },
        {
          name: "second",
          columns: [{ name: "y", type: "string" }],
          rows: [["hi"]],
        },
      ],
    };

    const sql = generateSchemaSql(model);

    expect(sql.match(/CREATE OR REPLACE TABLE/g)?.length).toBe(2);
    expect(sql.match(/INSERT INTO/g)?.length).toBe(2);
    // Declaration order preserved: "first" appears before "second".
    expect(sql.indexOf('"first"')).toBeLessThan(sql.indexOf('"second"'));
  });
});
