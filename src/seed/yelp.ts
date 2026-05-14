import type { QuestionModel } from "../lib/questionModel";

export const yelpPrompt = `
restaurants Table:
Column Name\tType
restaurant_id\tinteger
name\tstring
avg_rating\tfloat
review_count\tinteger
is_open\tboolean

restaurants Example Input:
restaurant_id\tname\tavg_rating\treview_count\tis_open
1\tBlue Bottle\t4.5\t1280\ttrue
2\tShake Shack\t4.2\t9320\ttrue
3\tClosed Diner\t3.1\t42\tfalse
4\tNo Reviews Yet\t-\t0\ttrue
5\tMystery Cafe\t4.85\t17\ttrue
`.trim();

export const yelpQuestion: QuestionModel = {
  tables: [
    {
      name: "restaurants",
      columns: [
        { name: "restaurant_id", type: "integer" },
        { name: "name", type: "string" },
        { name: "avg_rating", type: "float" },
        { name: "review_count", type: "integer" },
        { name: "is_open", type: "boolean" },
      ],
      rows: [
        [1, "Blue Bottle", 4.5, 1280, true],
        [2, "Shake Shack", 4.2, 9320, true],
        [3, "Closed Diner", 3.1, 42, false],
        [4, "No Reviews Yet", null, 0, true],
        [5, "Mystery Cafe", 4.85, 17, true],
      ],
    },
  ],
};

// Canonical answer: average rating across open restaurants with >= 100 reviews.
// Expected: (4.5 + 4.2) / 2 = 4.35
export const yelpQuery = `
SELECT printf('%.2f', AVG(avg_rating)) AS avg_open_rating
FROM restaurants
WHERE is_open = TRUE AND review_count >= 100;
`.trim();
