import { describe, expect, it } from "vitest";
import { ensureQuestionSampleRows, generateMockRows } from "./mockDataGenerator";
import type { QuestionModel } from "./questionModel";

describe("mockDataGenerator", () => {
  it("generates deterministic semantic sample rows for known column types and names", () => {
    const rows = generateMockRows(
      [
        { name: "order_id", type: "integer" },
        { name: "customer_name", type: "string" },
        { name: "email", type: "string" },
        { name: "city", type: "string" },
        { name: "country", type: "string" },
        { name: "status", type: "string" },
        { name: "subtotal", type: "float" },
        { name: "is_priority", type: "boolean" },
        { name: "created_at", type: "timestamp" },
      ],
      3,
    );

    expect(rows).toEqual([
      [
        1,
        "Ada Lovelace",
        "ada@example.com",
        "Toronto",
        "Canada",
        "pending",
        12.5,
        true,
        new Date("2024-01-01T09:00:00Z"),
      ],
      [
        2,
        "Grace Hopper",
        "grace@example.com",
        "Vancouver",
        "United States",
        "processing",
        15,
        false,
        new Date("2024-01-02T09:00:00Z"),
      ],
      [
        3,
        "Linus Torvalds",
        "linus@example.com",
        "Montreal",
        "Mexico",
        "completed",
        17.5,
        true,
        new Date("2024-01-03T09:00:00Z"),
      ],
    ]);
  });

  it("matches semantic string heuristics on token boundaries instead of raw substrings", () => {
    const rows = generateMockRows(
      [
        { name: "customer_name", type: "string" },
        { name: "surname", type: "string" },
        { name: "username", type: "string" },
      ],
      1,
    );

    expect(rows).toEqual([["Ada Lovelace", "surname 1", "username 1"]]);
  });

  it("fills only tables that are missing sample rows, defaults to twelve rows, and preserves curated rows", () => {
    const question: QuestionModel = {
      tables: [
        {
          name: "orders",
          columns: [{ name: "order_id", type: "integer" }],
          rows: [],
        },
        {
          name: "customers",
          columns: [{ name: "customer_name", type: "string" }],
          rows: [["Ada"]],
        },
      ],
    };

    expect(ensureQuestionSampleRows(question)).toEqual({
      tables: [
        {
          name: "orders",
          columns: [{ name: "order_id", type: "integer" }],
          sampleRowsMode: "generated",
          rows: [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10], [11], [12]],
        },
        {
          name: "customers",
          columns: [{ name: "customer_name", type: "string" }],
          rows: [["Ada"]],
        },
      ],
    });
  });

  it("aligns shared *_id columns across generated tables with a stable joinable pool", () => {
    const question: QuestionModel = {
      tables: [
        {
          name: "orders",
          columns: [
            { name: "order_id", type: "integer" },
            { name: "customer_id", type: "integer" },
          ],
          rows: [],
        },
        {
          name: "customers",
          columns: [
            { name: "customer_id", type: "integer" },
            { name: "customer_name", type: "string" },
          ],
          rows: [],
        },
      ],
    };

    const result = ensureQuestionSampleRows(question, 3);
    const [orders, customers] = result.tables;

    expect(orders.rows.map((row) => row[1])).toEqual(customers.rows.map((row) => row[0]));
    expect(orders.rows.map((row) => row[1])).not.toEqual([1, 2, 3]);
    expect(orders.rows.map((row) => row[0])).toEqual([1, 2, 3]);
  });

  it("maps explicitly referenced generated ids to existing target rows even when names differ", () => {
    const question: QuestionModel = {
      tables: [
        {
          name: "orders",
          columns: [
            { name: "order_id", type: "integer" },
            {
              name: "buyer_id",
              type: "integer",
              references: { table: "customers", column: "customer_id" },
            },
          ],
          rows: [],
        },
        {
          name: "customers",
          columns: [
            { name: "customer_id", type: "integer" },
            { name: "customer_name", type: "string" },
          ],
          rows: [],
        },
        {
          name: "invoices",
          columns: [{ name: "customer_id", type: "integer" }],
          rows: [],
        },
      ],
    };

    const result = ensureQuestionSampleRows(question, 3);
    const [orders, customers] = result.tables;

    expect(orders.rows.map((row) => row[1])).toEqual(customers.rows.map((row) => row[0]));
    expect(orders.rows.map((row) => row[1])).not.toEqual([1, 2, 3]);
  });
});
