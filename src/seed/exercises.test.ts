import { describe, expect, it } from "vitest";
import { defaultExercises } from "./exercises";
import { ensureQuestionSampleRows } from "../lib/mockDataGenerator";

const seededExercises = defaultExercises.filter(
  (exercise) => exercise.mode !== "custom",
);

const allThemes = new Set(seededExercises.flatMap((exercise) => exercise.themes));

describe("defaultExercises", () => {
  it("ships at least the expected seeded library plus a custom import slot", () => {
    const customImport = defaultExercises.find(
      (exercise) => exercise.mode === "custom",
    );

    expect(defaultExercises.length).toBeGreaterThanOrEqual(10);
    expect(seededExercises.length).toBeGreaterThanOrEqual(8);
    expect(customImport?.title).toBe("Custom Import");
  });

  it("requires complete metadata for every seeded exercise", () => {
    seededExercises.forEach((exercise) => {
      expect(exercise.id.length).toBeGreaterThan(0);
      expect(exercise.title.length).toBeGreaterThan(0);
      expect(exercise.company.length).toBeGreaterThan(0);
      expect(exercise.summary.length).toBeGreaterThan(0);
      expect(exercise.prompt.length).toBeGreaterThan(0);
      expect(exercise.initialQuery.length).toBeGreaterThan(0);
      expect(exercise.themes.length).toBeGreaterThan(0);
      expect(exercise.sourceLabel?.length ?? 0).toBeGreaterThan(0);
      expect(exercise.initialQuestion?.tables.length ?? 0).toBeGreaterThan(0);
    });
  });

  it("uses unique ids and titles across the library", () => {
    const ids = defaultExercises.map((exercise) => exercise.id);
    const titles = defaultExercises.map((exercise) => exercise.title);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("covers a diverse mix of SQL practice shapes", () => {
    expect(allThemes.has("self-join")).toBe(true);
    expect(allThemes.has("window functions")).toBe(true);
    expect(allThemes.has("having")).toBe(true);

    const distinctCompanies = new Set(
      seededExercises.map((exercise) => exercise.company),
    );
    expect(distinctCompanies.size).toBeGreaterThanOrEqual(4);
  });

  it("keeps curated rows for every seeded exercise instead of falling back to generated data", () => {
    seededExercises.forEach((exercise) => {
      const initialQuestion = exercise.initialQuestion;
      expect(initialQuestion).not.toBeNull();
      if (!initialQuestion) return;

      const ensured = ensureQuestionSampleRows(initialQuestion);
      ensured.tables.forEach((table, tableIndex) => {
        const originalTable = initialQuestion.tables[tableIndex];
        expect(table.rows).toEqual(originalTable.rows);
        expect(table.sampleRowsMode).not.toBe("generated");
      });
    });
  });
});
