import type { QuestionModel } from "../lib/questionModel";
import { doordashPrompt, doordashQuestion, doordashQuery } from "./doordash";
import {
  hellofreshCuisinePrompt,
  hellofreshCuisineQuery,
  hellofreshCuisineQuestion,
  hellofreshDeliveriesPrompt,
  hellofreshDeliveriesQuery,
  hellofreshDeliveriesQuestion,
  hellofreshInventoryPrompt,
  hellofreshInventoryQuery,
  hellofreshInventoryQuestion,
  hellofreshMonthlyMealsPrompt,
  hellofreshMonthlyMealsQuery,
  hellofreshMonthlyMealsQuestion,
  hellofreshTopUsersPrompt,
  hellofreshTopUsersQuery,
  hellofreshTopUsersQuestion,
} from "./hellofresh";
import {
  airbnbNeighborhoodPricingPrompt,
  airbnbNeighborhoodPricingQuery,
  airbnbNeighborhoodPricingQuestion,
} from "./airbnb";
import {
  stripeDailyRevenuePrompt,
  stripeDailyRevenueQuery,
  stripeDailyRevenueQuestion,
} from "./stripe";
import {
  linkedinDirectReportsPrompt,
  linkedinDirectReportsQuery,
  linkedinDirectReportsQuestion,
} from "./linkedin";

export interface SeedExerciseDefinition {
  id: string;
  title: string;
  company: string;
  difficulty: string;
  themes: string[];
  summary: string;
  prompt: string;
  initialQuery: string;
  initialQuestion?: QuestionModel | null;
  mode?: "seeded" | "custom";
  sourceLabel?: string;
}

const hellofreshSource = "DataLemur • HelloFresh (adapted)";

export const defaultExercises: SeedExerciseDefinition[] = [
  {
    id: "doordash-bad-experience",
    title: "First-Order Bad Experience",
    company: "DoorDash",
    difficulty: "Medium",
    themes: ["joins", "timestamps", "case logic"],
    summary:
      "Measure the percentage of customers whose first order ended in a bad experience.",
    prompt: doordashPrompt,
    initialQuestion: doordashQuestion,
    initialQuery: doordashQuery,
    sourceLabel: "DataLemur • DoorDash (adapted)",
  },
  {
    id: "hellofresh-top-users",
    title: "Top Users by Meal Orders",
    company: "HelloFresh",
    difficulty: "Warm-up",
    themes: ["filtering", "group by", "top n"],
    summary:
      "Find the users who placed the highest number of meal-kit orders in August 2022.",
    prompt: hellofreshTopUsersPrompt,
    initialQuestion: hellofreshTopUsersQuestion,
    initialQuery: hellofreshTopUsersQuery,
    sourceLabel: hellofreshSource,
  },
  {
    id: "hellofresh-delivery-times",
    title: "Average Delivery Time Per Recipe",
    company: "HelloFresh",
    difficulty: "Warm-up",
    themes: ["intervals", "averages", "timestamps"],
    summary:
      "Calculate the average time from preparation to delivery for each recipe.",
    prompt: hellofreshDeliveriesPrompt,
    initialQuestion: hellofreshDeliveriesQuestion,
    initialQuery: hellofreshDeliveriesQuery,
    sourceLabel: hellofreshSource,
  },
  {
    id: "hellofresh-inventory",
    title: "Warehouse Kit Capacity",
    company: "HelloFresh",
    difficulty: "Hard",
    themes: ["joins", "inventory math", "group by"],
    summary:
      "Determine how many full meal kits each warehouse can assemble from ingredient stock.",
    prompt: hellofreshInventoryPrompt,
    initialQuestion: hellofreshInventoryQuestion,
    initialQuery: hellofreshInventoryQuery,
    sourceLabel: hellofreshSource,
  },
  {
    id: "hellofresh-cuisine-pricing",
    title: "Average Cost by Cuisine",
    company: "HelloFresh",
    difficulty: "Warm-up",
    themes: ["joins", "averages", "floats"],
    summary:
      "Compare the average meal price across different cuisines.",
    prompt: hellofreshCuisinePrompt,
    initialQuestion: hellofreshCuisineQuestion,
    initialQuery: hellofreshCuisineQuery,
    sourceLabel: hellofreshSource,
  },
  {
    id: "hellofresh-monthly-meals",
    title: "Top Meal Per Month",
    company: "HelloFresh",
    difficulty: "Medium",
    themes: ["window functions", "ranking", "time bucketing"],
    summary:
      "Find the most popular meal sold in each month across all customers.",
    prompt: hellofreshMonthlyMealsPrompt,
    initialQuestion: hellofreshMonthlyMealsQuestion,
    initialQuery: hellofreshMonthlyMealsQuery,
    sourceLabel: hellofreshSource,
  },
  {
    id: "airbnb-neighborhood-pricing",
    title: "Average Price by Neighborhood",
    company: "Airbnb",
    difficulty: "Warm-up",
    themes: ["joins", "group by", "having"],
    summary:
      "Average nightly price per neighborhood, limited to neighborhoods with at least two listings.",
    prompt: airbnbNeighborhoodPricingPrompt,
    initialQuestion: airbnbNeighborhoodPricingQuestion,
    initialQuery: airbnbNeighborhoodPricingQuery,
    sourceLabel: "Original practice • Airbnb",
  },
  {
    id: "stripe-daily-revenue",
    title: "Daily Revenue With Running Total",
    company: "Stripe",
    difficulty: "Medium",
    themes: ["window functions", "running totals", "date bucketing"],
    summary:
      "Roll payments up to daily revenue and compute a running total across days.",
    prompt: stripeDailyRevenuePrompt,
    initialQuestion: stripeDailyRevenueQuestion,
    initialQuery: stripeDailyRevenueQuery,
    sourceLabel: "Original practice • Stripe",
  },
  {
    id: "linkedin-direct-reports",
    title: "Direct Reports Per Manager",
    company: "LinkedIn",
    difficulty: "Medium",
    themes: ["self-join", "hierarchy", "null handling"],
    summary:
      "List every employee who manages others and how many direct reports they have.",
    prompt: linkedinDirectReportsPrompt,
    initialQuestion: linkedinDirectReportsQuestion,
    initialQuery: linkedinDirectReportsQuery,
    sourceLabel: "Original practice • LinkedIn",
  },
  {
    id: "custom-import",
    title: "Custom Import",
    company: "Your Prompt",
    difficulty: "Freeform",
    themes: ["paste", "parse", "edit"],
    summary:
      "Paste a DataLemur-style prompt, inspect the parsed tables, then start querying.",
    prompt: "",
    initialQuestion: null,
    initialQuery: "-- Paste a prompt and import it to start querying.",
    mode: "custom",
    sourceLabel: "Manual import",
  },
];

export const defaultInitialExerciseId = "doordash-bad-experience";
