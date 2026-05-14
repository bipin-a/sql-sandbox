import type { QuestionModel } from "../lib/questionModel";
import { parseSchemaText } from "../lib/schemaParser";

export const linkedinDirectReportsPrompt = `
employees Table:
Column Name\tType
employee_id\tinteger
name\tstring
manager_id\tinteger

employees Example Input:
employee_id\tname\tmanager_id
1\tSundar\t-
2\tRuth\t1
3\tSanjay\t1
4\tHiroshi\t2
5\tPrabha\t2
6\tAnand\t3
`.trim();

export const linkedinDirectReportsQuestion: QuestionModel = parseSchemaText(
  linkedinDirectReportsPrompt,
);

// For every employee who manages at least one other employee, show their name
// and direct-report count, sorted by count then name.
// Expected:
//   Ruth     2
//   Sundar   2
//   Sanjay   1
export const linkedinDirectReportsQuery = `
SELECT
  m.name AS manager_name,
  COUNT(e.employee_id) AS direct_reports
FROM employees m
JOIN employees e ON e.manager_id = m.employee_id
GROUP BY m.name
ORDER BY direct_reports DESC, manager_name;
`.trim();
