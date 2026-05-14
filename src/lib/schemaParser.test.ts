import { describe, expect, it } from "vitest";
import { parseSchemaText } from "./schemaParser";
import { doordashPrompt, doordashQuestion } from "../seed/doordash";
import { yelpPrompt, yelpQuestion } from "../seed/yelp";

describe("schemaParser", () => {
  it("parses a single DataLemur-style orders table block", () => {
    const input = `
orders Table:
Column Name\tType
order_id\tinteger
customer_id\tinteger
trip_id\tinteger
status\tstring ('completed successfully', 'completed incorrectly', 'never received')
order_timestamp\ttimestamp

orders Example Input:
order_id\tcustomer_id\ttrip_id\tstatus\torder_timestamp
727424\t8472\t100463\tcompleted successfully\t06/05/2022 09:12:00
242513\t2341\t100482\tcompleted incorrectly\t06/05/2022 14:40:00
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].name).toBe("orders");
    expect(parsed.tables[0].columns).toEqual([
      { name: "order_id", type: "integer" },
      { name: "customer_id", type: "integer" },
      { name: "trip_id", type: "integer" },
      { name: "status", type: "string" },
      { name: "order_timestamp", type: "timestamp" },
    ]);
    expect(parsed.tables[0].rows[0][4]).toBeInstanceOf(Date);
    expect(parsed.tables[0].rows[1][4]).toBeInstanceOf(Date);
    expect(parsed.tables[0].rows).toEqual([
      [
        727424,
        8472,
        100463,
        "completed successfully",
        new Date("2022-06-05T09:12:00Z"),
      ],
      [
        242513,
        2341,
        100482,
        "completed incorrectly",
        new Date("2022-06-05T14:40:00Z"),
      ],
    ]);
  });

  it("parses a schema-only table block without requiring example input rows", () => {
    const input = `
orders Table:
Column Name\tType
order_id\tinteger
customer_id\tinteger
order_timestamp\ttimestamp
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toEqual([
      {
        name: "orders",
        columns: [
          { name: "order_id", type: "integer" },
          { name: "customer_id", type: "integer" },
          { name: "order_timestamp", type: "timestamp" },
        ],
        rows: [],
      },
    ]);
    expect(parsed.warnings ?? []).toEqual([]);
  });

  it("parses multiple tables, timestamps, and dash nulls from a DoorDash-style prompt", () => {
    const input = `
orders Table:
Column Name\tType
order_id\tinteger
customer_id\tinteger
trip_id\tinteger
status\tstring ('completed successfully', 'completed incorrectly', 'never received')
order_timestamp\ttimestamp

orders Example Input:
order_id\tcustomer_id\ttrip_id\tstatus\torder_timestamp
727424\t8472\t100463\tcompleted successfully\t06/05/2022 09:12:00
242513\t2341\t100482\tcompleted incorrectly\t06/05/2022 14:40:00

trips Table:
Column Name\tType
dasher_id\tinteger
trip_id\tinteger
estimated_delivery_timestamp\ttimestamp
actual_delivery_timestamp\ttimestamp

trips Example Input:
dasher_id\ttrip_id\testimated_delivery_timestamp\tactual_delivery_timestamp
101\t100463\t06/05/2022 09:42:00\t06/05/2022 09:38:00
102\t100657\t07/07/2022 15:52:00\t-
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toHaveLength(2);
    expect(parsed.tables[0].name).toBe("orders");
    expect(parsed.tables[1].name).toBe("trips");
    expect(parsed.tables[0].rows[0][4]).toBeInstanceOf(Date);
    expect(parsed.tables[1].rows[0][2]).toBeInstanceOf(Date);
    expect(parsed.tables[1].rows[0][3]).toBeInstanceOf(Date);
    expect(parsed.tables[1].rows[1][3]).toBeNull();
    expect(parsed.tables[1].rows[1]).toEqual([
      102,
      100657,
      new Date("2022-07-07T15:52:00Z"),
      null,
    ]);
  });

  it("pads missing cells and ignores extra cells while warning on row width mismatch", () => {
    const input = `
orders Table:
Column Name\tType
order_id\tinteger
customer_id\tinteger

orders Example Input:
order_id\tcustomer_id
727424
242513\t2341\textra
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].rows).toEqual([
      [727424, null],
      [242513, 2341],
    ]);
    expect(parsed.warnings).toEqual([
      {
        kind: "row_width_mismatch",
        message: 'Row width mismatch in table "orders": expected 2 cells but got 1.',
      },
      {
        kind: "row_width_mismatch",
        message: 'Row width mismatch in table "orders": expected 2 cells but got 3.',
      },
    ]);
  });

  it("parses a float-heavy restaurant delivery prompt with whitespace-aligned columns and rows", () => {
    const input = `
deliveries Table:
Column Name  Type
order_id  integer
order_time  timestamp
delivery_time  timestamp
restaurant_id  integer
customer_id  integer

deliveries Example Input:
order_id  order_time  delivery_time  restaurant_id  customer_id
0001  08/25/2021 18:00:00  08/25/2021 18:40:00  100  123
0002  08/25/2021 19:00:00  08/25/2021 19:30:00  200  265
0003  08/25/2021 20:00:00  08/25/2021 20:40:00  200  362
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].name).toBe("deliveries");
    expect(parsed.tables[0].columns).toEqual([
      { name: "order_id", type: "integer" },
      { name: "order_time", type: "timestamp" },
      { name: "delivery_time", type: "timestamp" },
      { name: "restaurant_id", type: "integer" },
      { name: "customer_id", type: "integer" },
    ]);
    expect(parsed.tables[0].rows).toEqual([
      [
        1,
        new Date("2021-08-25T18:00:00Z"),
        new Date("2021-08-25T18:40:00Z"),
        100,
        123,
      ],
      [
        2,
        new Date("2021-08-25T19:00:00Z"),
        new Date("2021-08-25T19:30:00Z"),
        200,
        265,
      ],
      [
        3,
        new Date("2021-08-25T20:00:00Z"),
        new Date("2021-08-25T20:40:00Z"),
        200,
        362,
      ],
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it("parses the full DoorDash prompt into the Phase 1 hardcoded model", () => {
    const parsed = parseSchemaText(doordashPrompt);
    expect(parsed.tables).toEqual(doordashQuestion.tables);
    expect(parsed.warnings ?? []).toEqual([]);
  });

  it("parses markdown-style pipe-delimited column and example tables", () => {
    const input = `
orders Table:
| Column Name | Type |
| --- | --- |
| order_id | integer |
| status | string |
| order_timestamp | timestamp |

orders Example Input:
| order_id | status | order_timestamp |
| --- | --- | --- |
| 727424 | completed successfully | 06/05/2022 09:12:00 |
| 242513 | completed incorrectly | - |
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toEqual([
      {
        name: "orders",
        columns: [
          { name: "order_id", type: "integer" },
          { name: "status", type: "string" },
          { name: "order_timestamp", type: "timestamp" },
        ],
        rows: [
          [727424, "completed successfully", new Date("2022-06-05T09:12:00Z")],
          [242513, "completed incorrectly", null],
        ],
      },
    ]);
    expect(parsed.warnings ?? []).toEqual([]);
  });

  it("parses a prompt with one markdown-style table and one tab-delimited table", () => {
    const input = `
subscriptions Table:
| Column Name | Type |
| --- | --- |
| subscription_id | integer |
| status | string ('active', 'inactive') |
| started_at | timestamp |

subscriptions Example Input:
| subscription_id | status | started_at |
| --- | --- | --- |
| 1 | active | 01/10/2024 08:00:00 |
| 2 | inactive | - |

customers Table:
Column Name\tType
customer_id\tinteger
subscription_id\tinteger
region\tstring

customers Example Input:
customer_id\tsubscription_id\tregion
101\t1\tCanada
102\t2\tUSA
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toEqual([
      {
        name: "subscriptions",
        columns: [
          { name: "subscription_id", type: "integer" },
          { name: "status", type: "string" },
          { name: "started_at", type: "timestamp" },
        ],
        rows: [
          [1, "active", new Date("2024-01-10T08:00:00Z")],
          [2, "inactive", null],
        ],
      },
      {
        name: "customers",
        columns: [
          { name: "customer_id", type: "integer" },
          { name: "subscription_id", type: "integer" },
          { name: "region", type: "string" },
        ],
        rows: [
          [101, 1, "Canada"],
          [102, 2, "USA"],
        ],
      },
    ]);
    expect(parsed.warnings ?? []).toEqual([]);
  });

  it("parses a single-column markdown-style table", () => {
    const input = `
regions Table:
| Column Name |
| --- |
| region |

regions Example Input:
| region |
| --- |
| Canada |
| USA |
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toEqual([
      {
        name: "regions",
        columns: [{ name: "region", type: "string" }],
        rows: [["Canada"], ["USA"]],
      },
    ]);
    expect(parsed.warnings ?? []).toEqual([]);
  });

  it("parses a float-heavy Yelp-style prompt with mixed floats, booleans, and a null rating", () => {
    const parsed = parseSchemaText(yelpPrompt);
    expect(parsed.tables).toEqual(yelpQuestion.tables);
    expect(parsed.warnings ?? []).toEqual([]);
  });

  it("parses a collapsed DoorDash trips prompt with single-space rows and a stuck dash null", () => {
    const input = `
trips Table:
Column Name Type
dasher_id integer
trip_id integer
estimated_delivery_timestamp timestamp
actual_delivery_timestamp timestamp

trips Example Input:
dasher_id trip_id estimated_delivery_timestamp actual_delivery_timestamp
101 100463 06/05/2022 09:42:00 06/05/2022 09:38:00
102 100657 07/07/2022 15:52:00-
103 100213 06/12/2022 14:13:00 06/12/2022 14:10:00
`.trim();

    const parsed = parseSchemaText(input);

    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].columns).toEqual([
      { name: "dasher_id", type: "integer" },
      { name: "trip_id", type: "integer" },
      { name: "estimated_delivery_timestamp", type: "timestamp" },
      { name: "actual_delivery_timestamp", type: "timestamp" },
    ]);
    expect(parsed.tables[0].rows).toEqual([
      [
        101,
        100463,
        new Date("2022-06-05T09:42:00Z"),
        new Date("2022-06-05T09:38:00Z"),
      ],
      [102, 100657, new Date("2022-07-07T15:52:00Z"), null],
      [
        103,
        100213,
        new Date("2022-06-12T14:13:00Z"),
        new Date("2022-06-12T14:10:00Z"),
      ],
    ]);
    expect(parsed.warnings).toEqual([]);
  });
});
