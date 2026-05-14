import type { QuestionModel } from "../lib/questionModel";
import { parseSchemaText } from "../lib/schemaParser";

function parseSeedPrompt(prompt: string): QuestionModel {
  return parseSchemaText(prompt);
}

export const hellofreshTopUsersPrompt = `
orders Table:
Column Name\tType
order_id\tinteger
user_id\tinteger
order_date\ttimestamp
meal_id\tinteger
quantity\tinteger

orders Example Input:
order_id\tuser_id\torder_date\tmeal_id\tquantity
15432\t789\t08/17/2022 00:00:00\t60009\t3
17386\t654\t08/25/2022 00:00:00\t70123\t2
14952\t761\t08/02/2022 00:00:00\t60009\t4
16752\t876\t08/15/2022 00:00:00\t70123\t3
14471\t654\t08/18/2022 00:00:00\t70123\t1
`.trim();

export const hellofreshTopUsersQuestion = parseSeedPrompt(hellofreshTopUsersPrompt);

export const hellofreshTopUsersQuery = `
SELECT user_id, COUNT(*) AS order_count
FROM orders
WHERE order_date >= TIMESTAMP '2022-08-01 00:00:00'
  AND order_date < TIMESTAMP '2022-09-01 00:00:00'
GROUP BY user_id
ORDER BY order_count DESC, user_id
LIMIT 5;
`.trim();

export const hellofreshDeliveriesPrompt = `
deliveries Table:
Column Name\tType
delivery_id\tinteger
recipe_id\tinteger
recipe_name\tstring
prepared_time\ttimestamp
delivered_time\ttimestamp

deliveries Example Input:
delivery_id\trecipe_id\trecipe_name\tprepared_time\tdelivered_time
1\t10\tChicken Curry\t06/07/2022 09:00:00\t06/07/2022 13:00:00
2\t20\tVegetable Stir Fry\t06/07/2022 09:30:00\t06/07/2022 13:30:00
3\t10\tChicken Curry\t06/08/2022 09:00:00\t06/08/2022 12:30:00
4\t30\tPasta Bolognese\t06/09/2022 09:00:00\t06/09/2022 12:00:00
5\t20\tVegetable Stir Fry\t06/09/2022 09:30:00\t06/09/2022 13:00:00
`.trim();

export const hellofreshDeliveriesQuestion = parseSeedPrompt(hellofreshDeliveriesPrompt);

export const hellofreshDeliveriesQuery = `
SELECT
  recipe_id,
  recipe_name,
  ROUND(AVG(EXTRACT(EPOCH FROM delivered_time - prepared_time) / 3600.0), 2)
    AS avg_delivery_time_hours
FROM deliveries
GROUP BY recipe_id, recipe_name
ORDER BY recipe_id;
`.trim();

export const hellofreshInventoryPrompt = `
products Table:
Column Name\tType
product_id\tinteger
name\tstring
description\tstring

products Example Input:
product_id\tname\tdescription
50001\tChicken Alfredo Pasta\tClassic chicken Alfredo served over pasta.
69852\tThai Basil Tofu\tSpicy Thai tofu dish served with Jasmine rice.

ingredients Table:
Column Name\tType
ingredient_id\tinteger
name\tstring
unit\tstring

ingredients Example Input:
ingredient_id\tname\tunit
25\tChicken Breast\tpiece
36\tPasta\tg
42\tAlfredo Sauce\tml
30\tTofu\tg
37\tThai Basil\tleaf
40\tJasmine Rice\tg

product_ingredients Table:
Column Name\tType
product_id\tinteger
ingredient_id\tinteger
quantity\tinteger

product_ingredients Example Input:
product_id\tingredient_id\tquantity
50001\t25\t1
50001\t36\t200
50001\t42\t50
69852\t30\t150
69852\t37\t20
69852\t40\t75

warehouse_inventory Table:
Column Name\tType
warehouse_id\tinteger
ingredient_id\tinteger
quantity_on_hand\tinteger

warehouse_inventory Example Input:
warehouse_id\tingredient_id\tquantity_on_hand
1\t25\t500
1\t36\t50000
1\t42\t2500
2\t30\t2000
2\t37\t1000
2\t40\t10000
`.trim();

export const hellofreshInventoryQuestion = parseSeedPrompt(hellofreshInventoryPrompt);

export const hellofreshInventoryQuery = `
WITH per_product_capacity AS (
  SELECT
    w.warehouse_id,
    p.product_id,
    p.name,
    FLOOR(MIN(CAST(w.quantity_on_hand AS DOUBLE) / pi.quantity)) AS kits_available
  FROM products p
  JOIN product_ingredients pi
    ON p.product_id = pi.product_id
  JOIN warehouse_inventory w
    ON pi.ingredient_id = w.ingredient_id
  GROUP BY w.warehouse_id, p.product_id, p.name
)
SELECT warehouse_id, product_id, name, kits_available
FROM per_product_capacity
ORDER BY kits_available DESC, warehouse_id, product_id;
`.trim();

export const hellofreshCuisinePrompt = `
meals Table:
Column Name\tType
meal_id\tinteger
cuisine_id\tinteger
price\tfloat

meals Example Input:
meal_id\tcuisine_id\tprice
101\t1\t10.99
102\t1\t11.99
103\t2\t12.99
104\t3\t15.99
105\t2\t13.99

cuisines Table:
Column Name\tType
cuisine_id\tinteger
cuisine_name\tstring

cuisines Example Input:
cuisine_id\tcuisine_name
1\tItalian
2\tMexican
3\tIndian
`.trim();

export const hellofreshCuisineQuestion = parseSeedPrompt(hellofreshCuisinePrompt);

export const hellofreshCuisineQuery = `
SELECT
  c.cuisine_name AS cuisine,
  ROUND(AVG(m.price), 2) AS average_price
FROM meals m
JOIN cuisines c
  ON m.cuisine_id = c.cuisine_id
GROUP BY c.cuisine_name
ORDER BY c.cuisine_name;
`.trim();

export const hellofreshMonthlyMealsPrompt = `
customers Table:
Column Name\tType
customer_id\tinteger
join_date\ttimestamp
country\tstring

customers Example Input:
customer_id\tjoin_date\tcountry
4231\t05/10/2021 00:00:00\tUSA
9350\t03/25/2021 00:00:00\tUSA
2175\t07/02/2021 00:00:00\tGermany
9873\t04/15/2021 00:00:00\tFrance
3221\t08/30/2021 00:00:00\tUSA

meal_orders Table:
Column Name\tType
meal_id\tinteger
customer_id\tinteger
purchase_date\ttimestamp
meal\tstring

meal_orders Example Input:
meal_id\tcustomer_id\tpurchase_date\tmeal
1057\t4231\t05/12/2021 00:00:00\tChicken Alfredo
2049\t9350\t03/28/2021 00:00:00\tVegetable Lasagna
7396\t2175\t07/04/2021 00:00:00\tGerman Bratwurst
6284\t9873\t04/18/2021 00:00:00\tFrench Coq au Vin
4865\t3221\t09/01/2021 00:00:00\tChicken Caesar Salad
`.trim();

export const hellofreshMonthlyMealsQuestion = parseSeedPrompt(
  hellofreshMonthlyMealsPrompt,
);

export const hellofreshMonthlyMealsQuery = `
WITH monthly_meal_counts AS (
  SELECT
    strftime(purchase_date, '%Y-%m') AS year_month,
    meal,
    COUNT(*) AS meal_count
  FROM meal_orders
  GROUP BY 1, 2
),
ranked_meals AS (
  SELECT
    year_month,
    meal,
    meal_count,
    ROW_NUMBER() OVER (
      PARTITION BY year_month
      ORDER BY meal_count DESC, meal
    ) AS rn
  FROM monthly_meal_counts
)
SELECT year_month, meal AS top_meal, meal_count
FROM ranked_meals
WHERE rn = 1
ORDER BY year_month;
`.trim();
