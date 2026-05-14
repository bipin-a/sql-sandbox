import type { QuestionModel } from "../lib/questionModel";
import { parseSchemaText } from "../lib/schemaParser";

export const airbnbNeighborhoodPricingPrompt = `
neighborhoods Table:
Column Name\tType
neighborhood_id\tinteger
name\tstring
city\tstring

neighborhoods Example Input:
neighborhood_id\tname\tcity
1\tMission\tSan Francisco
2\tSoMa\tSan Francisco
3\tWilliamsburg\tNew York
4\tCapitol Hill\tSeattle

listings Table:
Column Name\tType
listing_id\tinteger
neighborhood_id\tinteger
nightly_price\tfloat

listings Example Input:
listing_id\tneighborhood_id\tnightly_price
100\t1\t220.00
101\t1\t180.00
102\t1\t260.00
103\t2\t310.00
104\t3\t240.00
105\t3\t200.00
106\t4\t150.00
`.trim();

export const airbnbNeighborhoodPricingQuestion: QuestionModel = parseSchemaText(
  airbnbNeighborhoodPricingPrompt,
);

// Show neighborhoods with at least 2 listings, their average nightly price,
// and the listing count, sorted by price descending.
// Expected:
//   Mission        220.00  3
//   Williamsburg   220.00  2
export const airbnbNeighborhoodPricingQuery = `
SELECT
  n.name AS neighborhood,
  ROUND(AVG(l.nightly_price), 2) AS avg_nightly_price,
  COUNT(*) AS listing_count
FROM neighborhoods n
JOIN listings l ON l.neighborhood_id = n.neighborhood_id
GROUP BY n.name
HAVING COUNT(*) >= 2
ORDER BY avg_nightly_price DESC, neighborhood;
`.trim();
