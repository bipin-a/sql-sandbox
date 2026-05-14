import type { QuestionModel } from "../lib/questionModel";
import { parseSchemaText } from "../lib/schemaParser";

export const stripeDailyRevenuePrompt = `
payments Table:
Column Name\tType
payment_id\tinteger
customer_id\tinteger
amount\tfloat
paid_at\ttimestamp

payments Example Input:
payment_id\tcustomer_id\tamount\tpaid_at
1\t10\t50.00\t03/01/2024 09:15:00
2\t11\t75.00\t03/01/2024 14:30:00
3\t10\t30.00\t03/02/2024 10:05:00
4\t12\t120.00\t03/02/2024 16:45:00
5\t13\t90.00\t03/03/2024 08:20:00
6\t11\t40.00\t03/04/2024 11:00:00
`.trim();

export const stripeDailyRevenueQuestion: QuestionModel = parseSchemaText(
  stripeDailyRevenuePrompt,
);

// Show daily revenue alongside a running total across days.
// Expected:
//   2024-03-01   125.00   125.00
//   2024-03-02   150.00   275.00
//   2024-03-03    90.00   365.00
//   2024-03-04    40.00   405.00
export const stripeDailyRevenueQuery = `
WITH daily AS (
  SELECT
    CAST(paid_at AS DATE) AS day,
    SUM(amount) AS daily_revenue
  FROM payments
  GROUP BY 1
)
SELECT
  day,
  ROUND(daily_revenue, 2) AS daily_revenue,
  ROUND(SUM(daily_revenue) OVER (ORDER BY day), 2) AS running_total
FROM daily
ORDER BY day;
`.trim();
