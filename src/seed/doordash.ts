import type { QuestionModel } from "../lib/questionModel";

export const doordashPrompt = `
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
141367\t1314\t100362\tcompleted incorrectly\t06/07/2022 15:03:00
582193\t5421\t100657\tnever received\t07/07/2022 15:22:00
253613\t1314\t100213\tcompleted successfully\t06/12/2022 13:43:00

trips Table:
Column Name\tType
dasher_id\tinteger
trip_id\tinteger
estimated_delivery_timestamp\ttimestamp
actual_delivery_timestamp\ttimestamp

trips Example Input:
dasher_id\ttrip_id\testimated_delivery_timestamp\tactual_delivery_timestamp
101\t100463\t06/05/2022 09:42:00\t06/05/2022 09:38:00
102\t100482\t06/05/2022 15:10:00\t06/05/2022 15:46:00
101\t100362\t06/07/2022 15:33:00\t06/07/2022 16:45:00
102\t100657\t07/07/2022 15:52:00\t-
103\t100213\t06/12/2022 14:13:00\t06/12/2022 14:10:00
`.trim();

export const doordashQuestion: QuestionModel = {
  tables: [
    {
      name: "orders",
      columns: [
        { name: "order_id", type: "integer" },
        { name: "customer_id", type: "integer" },
        { name: "trip_id", type: "integer" },
        { name: "status", type: "string" },
        { name: "order_timestamp", type: "timestamp" },
      ],
      rows: [
        [727424, 8472, 100463, "completed successfully", new Date("2022-06-05T09:12:00Z")],
        [242513, 2341, 100482, "completed incorrectly", new Date("2022-06-05T14:40:00Z")],
        [141367, 1314, 100362, "completed incorrectly", new Date("2022-06-07T15:03:00Z")],
        [582193, 5421, 100657, "never received", new Date("2022-07-07T15:22:00Z")],
        [253613, 1314, 100213, "completed successfully", new Date("2022-06-12T13:43:00Z")],
      ],
    },
    {
      name: "trips",
      columns: [
        { name: "dasher_id", type: "integer" },
        { name: "trip_id", type: "integer" },
        { name: "estimated_delivery_timestamp", type: "timestamp" },
        { name: "actual_delivery_timestamp", type: "timestamp" },
      ],
      rows: [
        [101, 100463, new Date("2022-06-05T09:42:00Z"), new Date("2022-06-05T09:38:00Z")],
        [102, 100482, new Date("2022-06-05T15:10:00Z"), new Date("2022-06-05T15:46:00Z")],
        [101, 100362, new Date("2022-06-07T15:33:00Z"), new Date("2022-06-07T16:45:00Z")],
        [102, 100657, new Date("2022-07-07T15:52:00Z"), null],
        [103, 100213, new Date("2022-06-12T14:13:00Z"), new Date("2022-06-12T14:10:00Z")],
      ],
    },
  ],
};

// Canonical answer: of each customer's first order, what % were a "bad experience"?
// Bad = status in ('completed incorrectly', 'never received'),
//       OR no actual delivery,
//       OR actual delivery > estimated + 30 minutes.
// Expected: 75.00
export const doordashQuery = `
WITH first_orders AS (
  SELECT
    o.customer_id,
    o.status,
    t.estimated_delivery_timestamp,
    t.actual_delivery_timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY o.customer_id
      ORDER BY o.order_timestamp
    ) AS rn
  FROM orders o
  JOIN trips t ON o.trip_id = t.trip_id
)
SELECT printf('%.2f',
  100.0 * AVG(
    CASE
      WHEN status IN ('completed incorrectly', 'never received') THEN 1
      WHEN actual_delivery_timestamp IS NULL THEN 1
      WHEN actual_delivery_timestamp >
           estimated_delivery_timestamp + INTERVAL 30 MINUTE THEN 1
      ELSE 0
    END
  )
) AS bad_experience_pct
FROM first_orders
WHERE rn = 1;
`.trim();
