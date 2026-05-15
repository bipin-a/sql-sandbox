// @vitest-environment jsdom

import { useEffect, useRef } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QuestionModel } from "../lib/questionModel";
import type { QueryResult, Runner } from "../lib/duckdbRunner";
import type { ExerciseDefinition } from "./App";
import { SqlPlaygroundApp, SqlPlaygroundImportApp, SqlPracticeStudio } from "./App";

vi.mock("@monaco-editor/react", () => {
  function MockEditor(props: {
    value?: string;
    onChange?: (value: string) => void;
    onMount?: (
      editor: { addCommand: (_keybinding: number, callback: () => void) => void },
      monaco: { KeyMod: { CtrlCmd: number }; KeyCode: { Enter: number } },
    ) => void;
  }) {
    const runCommandRef = useRef<null | (() => void)>(null);

    useEffect(() => {
      props.onMount?.(
        {
          addCommand: (_keybinding, callback) => {
            runCommandRef.current = callback;
          },
        },
        {
          KeyMod: { CtrlCmd: 1 },
          KeyCode: { Enter: 2 },
        },
      );
    }, [props]);

    return (
      <textarea
        aria-label="SQL query"
        value={props.value ?? ""}
        onChange={(e) => props.onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            runCommandRef.current?.();
          }
        }}
      />
    );
  }

  return { default: MockEditor };
});

const question: QuestionModel = {
  tables: [
    {
      name: "nums",
      columns: [{ name: "n", type: "integer" }],
      rows: [[1], [2], [3]],
    },
  ],
};

function makeRunner(
  resolveQuery: (sql: string) => Promise<QueryResult>,
): Runner {
  return {
    loadSchema: vi.fn(async () => {}),
    runQuery: vi.fn(resolveQuery),
    close: vi.fn(async () => {}),
  };
}

const importText = `
orders Table:
Column Name\tType
order_id\tinteger
customer_id\tinteger

orders Example Input:
order_id\tcustomer_id
727424\t8472

trips Table:
Column Name\tType
trip_id\tinteger
actual_delivery_timestamp\ttimestamp

trips Example Input:
trip_id\tactual_delivery_timestamp
100463\t06/05/2022 09:38:00
`.trim();

const malformedImportText = `
orders Table:
Column Name\tType
order_id\tinteger
customer_id\tinteger

orders Example Input:
order_id\tcustomer_id
727424
`.trim();

const schemaOnlyImportText = `
orders Table:
Column Name\tType
order_id\tinteger
status\tstring
created_at\ttimestamp
`.trim();

const joinableImportText = `
orders Table:
Column Name\tType
order_id\tinteger
customer_id\tinteger

orders Example Input:
order_id\tcustomer_id
727424\t8472

customers Table:
Column Name\tType
customer_id\tinteger
customer_name\tstring

customers Example Input:
customer_id\tcustomer_name
8472\tAda
`.trim();

const editableImportText = `
nums Table:
Column Name\tType
n\tinteger

nums Example Input:
n
1
2
`.trim();

const stringNumsImportText = `
nums Table:
Column Name\tType
n\tstring

nums Example Input:
n
1
two
`.trim();

const exerciseOne: ExerciseDefinition = {
  id: "warmup-one",
  title: "Warm-up One",
  company: "HelloFresh",
  difficulty: "Warm-up",
  themes: ["filtering"],
  summary: "Simple starter exercise.",
  prompt: editableImportText,
  initialQuestion: question,
  initialQuery: "SELECT COUNT(*) AS total FROM nums;",
};

const exerciseTwo: ExerciseDefinition = {
  id: "warmup-two",
  title: "Warm-up Two",
  company: "HelloFresh",
  difficulty: "Medium",
  themes: ["aggregation"],
  summary: "Second starter exercise.",
  prompt: stringNumsImportText,
  initialQuestion: {
    tables: [
      {
        name: "nums",
        columns: [{ name: "n", type: "string" }],
        rows: [["1"], ["two"]],
      },
    ],
  },
  initialQuery: "SELECT COUNT(*) AS total FROM nums;",
};

const curatedSeedExercise: ExerciseDefinition = {
  id: "curated-seed",
  title: "Curated Seed",
  company: "DoorDash",
  difficulty: "Medium",
  themes: ["joins"],
  summary: "Seeded exercise with curated prompt rows.",
  prompt: importText,
  initialQuestion: {
    tables: [
      {
        name: "customers",
        columns: [{ name: "customer_name", type: "string" }],
        rows: [["Ada"], ["Linus"]],
      },
    ],
  },
  initialQuery: "SELECT COUNT(*) AS total FROM customers;",
};

const customImportExercise: ExerciseDefinition = {
  id: "custom-import",
  title: "Custom Import",
  company: "Your Prompt",
  difficulty: "Freeform",
  themes: ["paste", "parse"],
  summary: "Paste a schema or prompt to start querying your own dataset.",
  prompt: "",
  initialQuestion: null,
  initialQuery: "-- Paste a prompt and import it to start querying.",
  mode: "custom",
};

async function chooseSourceFromHome(name: string | RegExp) {
  await userEvent.click(await screen.findByRole("button", { name }));
}

async function chooseNewSchemaSource() {
  if (!screen.queryByLabelText("Home chooser")) {
    await userEvent.click(screen.getByRole("button", { name: "Home" }));
  }
  await chooseSourceFromHome(/Create schema/i);
}

describe("SqlPlaygroundApp", () => {
  it("imports pasted prompt text and shows a structured preview", async () => {
    const runner = makeRunner(async () => ({ columns: ["n"], rows: [[1]] }));

    render(
      <SqlPlaygroundImportApp
        initialImportText={importText}
        initialQuery="SELECT 1 AS n;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    const importBox = (await screen.findByLabelText("Import prompt")) as HTMLTextAreaElement;
    expect(importBox.value).toContain("orders Table:");

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    const importedTablesHeading = await screen.findByRole("heading", { name: "Tables" });
    const previewPanel = importedTablesHeading.closest("section");

    expect(previewPanel).toBeTruthy();
    expect(within(previewPanel as HTMLElement).getByText("orders")).toBeTruthy();
    expect(within(previewPanel as HTMLElement).getByText("trips")).toBeTruthy();
    expect(within(previewPanel as HTMLElement).getByText("order_id")).toBeTruthy();
    expect(within(previewPanel as HTMLElement).getByText("actual_delivery_timestamp")).toBeTruthy();
    expect(screen.queryByLabelText("Table 1 name")).toBeNull();
  });

  it("surfaces quiet join hints in Setup for obviously joinable tables", async () => {
    const runner = makeRunner(async () => ({ columns: ["n"], rows: [[1]] }));

    render(
      <SqlPlaygroundImportApp
        initialImportText={joinableImportText}
        initialQuery="SELECT 1 AS n;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    const importedTablesHeading = await screen.findByRole("heading", { name: "Tables" });
    const previewPanel = importedTablesHeading.closest("section");

    expect(previewPanel).toBeTruthy();
    expect(within(previewPanel as HTMLElement).getAllByText("joins on: customer_id")).toHaveLength(
      2,
    );
  });

  it("shows a parser warning for row width mismatch after import", async () => {
    const runner = makeRunner(async () => ({ columns: ["n"], rows: [[1]] }));

    render(
      <SqlPlaygroundImportApp
        initialImportText={malformedImportText}
        initialQuery="SELECT 1 AS n;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByRole("heading", { name: "Tables" });
    await screen.findByText(/Row width mismatch in table "orders"/);
  });

  it("defaults custom import to Setup mode", async () => {
    const runner = makeRunner(async () => ({ columns: ["n"], rows: [[1]] }));

    render(
      <SqlPlaygroundImportApp
        initialImportText={importText}
        initialQuery="SELECT 1 AS n;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    expect(screen.getByRole("button", { name: "Setup" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Query" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByLabelText("Import prompt")).toBeTruthy();
  });

  it("shows the seeded problem statement in Query mode and starts with an empty editor", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[2]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise]}
        initialExerciseId="curated-seed"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await screen.findByLabelText("SQL query");

    const editor = (await screen.findByLabelText("SQL query")) as HTMLTextAreaElement;
    expect(editor.value).toBe("");
    expect(screen.getAllByText("Seeded exercise with curated prompt rows.").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("SELECT COUNT(*) AS total FROM customers;")).toBeNull();
  });

  it("reveals the canonical seeded solution on demand", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[2]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise]}
        initialExerciseId="curated-seed"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await screen.findByLabelText("SQL query");

    const editor = (await screen.findByLabelText("SQL query")) as HTMLTextAreaElement;
    expect(editor.value).toBe("");

    await userEvent.click(screen.getByRole("button", { name: "Reveal solution" }));

    expect(editor.value).toBe("SELECT COUNT(*) AS total FROM customers;");
  });

  it("confirms before revealing a solution over a non-empty query", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[2]] }));

    render(
      <SqlPlaygroundApp
        question={curatedSeedExercise.initialQuestion!}
        initialQuery=""
        solutionQuery="SELECT COUNT(*) AS total FROM customers;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    const editor = (await screen.findByLabelText("SQL query")) as HTMLTextAreaElement;
    await userEvent.type(editor, "SELECT customer_name FROM customers;");
    await userEvent.click(screen.getByRole("button", { name: "Reveal solution" }));

    expect(screen.getByText("Replace your current query?")).toBeTruthy();
    expect(editor.value).toBe("SELECT customer_name FROM customers;");

    await userEvent.click(screen.getByRole("button", { name: "Yes, reveal" }));

    expect(editor.value).toBe("SELECT COUNT(*) AS total FROM customers;");
  });

  it("checks a seeded answer by comparing result rows instead of query text", async () => {
    const runner = makeRunner(async (sql) => {
      if (sql.includes("COUNT")) {
        if (sql.includes("customers")) {
          return { columns: ["total"], rows: [[2]] };
        }
        return { columns: ["count"], rows: [[2]] };
      }
      return { columns: ["customers"], rows: [["Ada"], ["Linus"]] };
    });

    render(
      <SqlPlaygroundApp
        question={curatedSeedExercise.initialQuestion!}
        initialQuery=""
        solutionQuery="SELECT COUNT(*) AS total FROM customers;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    const editor = (await screen.findByLabelText("SQL query")) as HTMLTextAreaElement;
    await userEvent.type(editor, "SELECT COUNT(*) AS count FROM customers;");
    await userEvent.click(screen.getByRole("button", { name: "Check my answer" }));

    await screen.findByText("Answer matches the expected result.");
  });

  it("keeps invalid parsed import data out of the applied dataset", async () => {
    const invalidParsedModel: QuestionModel = {
      tables: [
        {
          name: "events",
          columns: [
            { name: "id", type: "integer" },
            { name: "started_at", type: "timestamp" },
          ],
          rows: [[Number.NaN, new Date("not-a-date")]],
        },
      ],
    };

    const runner: Runner = {
      loadSchema: vi.fn(async () => {}),
      runQuery: vi.fn(async () => ({ columns: ["n"], rows: [[1]] })),
      close: vi.fn(async () => {}),
    };

    render(
      <SqlPlaygroundImportApp
        initialImportText="ignored"
        initialQuery="SELECT 1 AS n;"
        createRunner={vi.fn(async () => runner)}
        parseImportText={() => invalidParsedModel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByRole("heading", { name: "Tables" });
    await screen.findByText("Draft has validation errors.");
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(runner.loadSchema).not.toHaveBeenCalled();
    expect(screen.queryByText("1")).toBeNull();
  });

  it("generates sample rows for schema-only imports before loading DuckDB", async () => {
    let loadedSchemaSql = "";
    const runner: Runner = {
      loadSchema: vi.fn(async (sql: string) => {
        loadedSchemaSql = sql;
      }),
      runQuery: vi.fn(async () => ({ columns: ["total"], rows: [[12]] })),
      close: vi.fn(async () => {}),
    };

    render(
      <SqlPlaygroundImportApp
        initialImportText={schemaOnlyImportText}
        initialQuery="SELECT COUNT(*) AS total FROM orders;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByRole("heading", { name: "Tables" });
    expect(screen.getAllByText("Generated sample data").length).toBeGreaterThan(0);
    expect(screen.getAllByText("processing").length).toBeGreaterThan(0);
    await screen.findByText("2024-01-01T09:00:00.000Z");
    await waitFor(() => {
      expect(runner.loadSchema).toHaveBeenCalledWith(
        expect.stringContaining(
          `INSERT INTO "orders" ("order_id", "status", "created_at") VALUES`,
        ),
      );
    });
    expect(loadedSchemaSql).toContain("TIMESTAMP '2024-01-01 09:00:00.000'");
  });

  it("shows mock sample rows as read-only reference data", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[3]] }));

    render(
      <SqlPlaygroundImportApp
        initialImportText={editableImportText}
        initialQuery="SELECT SUM(n) AS total FROM nums;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByRole("heading", { name: "Tables" });
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.queryByLabelText("nums row 2 n")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add row to nums/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove nums row/i })).toBeNull();
  });

  it("keeps custom-import schema read-only until Edit schema is enabled", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[3]] }));

    render(
      <SqlPlaygroundImportApp
        initialImportText={editableImportText}
        initialQuery="SELECT SUM(n) AS total FROM nums;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    await screen.findByRole("heading", { name: "Tables" });
    expect(screen.queryByLabelText("Table 1 name")).toBeNull();
    expect(screen.queryByLabelText("nums column 1 name")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Edit schema" }));

    expect(await screen.findByLabelText("Table 1 name")).toBeTruthy();
    expect(await screen.findByLabelText("nums column 1 name")).toBeTruthy();
  });

  it("revalidates mock rows when a column type changes and reapplies once the schema is fixed", async () => {
    let loadedSchemaSql = "";
    const runner: Runner = {
      loadSchema: vi.fn(async (sql: string) => {
        loadedSchemaSql = sql;
      }),
      runQuery: vi.fn(async () => {
        if (
          loadedSchemaSql.includes('CREATE OR REPLACE TABLE "nums" ("n" INTEGER);') &&
          loadedSchemaSql.includes('VALUES (1), (2);')
        ) {
          return { columns: ["total"], rows: [[3]] };
        }
        return { columns: ["total"], rows: [[0]] };
      }),
      close: vi.fn(async () => {}),
    };

    render(
      <SqlPlaygroundImportApp
        initialImportText={stringNumsImportText}
        initialQuery="SELECT SUM(n) AS total FROM nums;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit schema" }));

    const typeSelect = (await screen.findByLabelText(
      "nums column n type",
    )) as HTMLSelectElement;

    await userEvent.selectOptions(typeSelect, "integer");

    await screen.findByText("Invalid integer");
    expect(runner.loadSchema).toHaveBeenCalledTimes(1);

    await userEvent.selectOptions(typeSelect, "string");

    await waitFor(() => {
      expect(screen.queryByText("Invalid integer")).toBeNull();
    });
    await waitFor(() => {
      expect(runner.loadSchema).toHaveBeenCalledTimes(2);
    });
    await userEvent.click(screen.getByRole("button", { name: "Query" }));
    const runButton = screen.getByRole("button", { name: "Run" });
    expect((runButton as HTMLButtonElement).disabled).toBe(false);

    await userEvent.click(runButton);
    await screen.findByText("0");
  });

  it("renames tables and columns against the applied dataset without exposing row editing", async () => {
    let loadedSchemaSql = "";
    let staleNumsTableExists = true;
    const runner: Runner = {
      loadSchema: vi.fn(async (sql: string) => {
        loadedSchemaSql = sql;
        if (sql.includes("DROP TABLE IF EXISTS \"nums\";")) {
          staleNumsTableExists = false;
        }
      }),
      runQuery: vi.fn(async (sql: string) => {
        if (!sql.includes("SUM(value)") || !sql.includes("FROM values")) {
          return { columns: ["total"], rows: [[0]] };
        }
        if (
          staleNumsTableExists &&
          loadedSchemaSql.includes('CREATE OR REPLACE TABLE "values"')
        ) {
          return { error: 'Catalog Error: Table with name nums still exists' };
        }
        if (loadedSchemaSql.includes('VALUES (1), (2);')) {
          return { columns: ["total"], rows: [[3]] };
        }
        return { columns: ["total"], rows: [[0]] };
      }),
      close: vi.fn(async () => {}),
    };

    render(
      <SqlPlaygroundImportApp
        initialImportText={editableImportText}
        initialQuery="SELECT SUM(value) AS total FROM values;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit schema" }));

    const tableNameInput = (await screen.findByLabelText(
      "Table 1 name",
    )) as HTMLInputElement;
    const columnNameInput = (await screen.findByLabelText(
      "nums column 1 name",
    )) as HTMLInputElement;

    await userEvent.clear(columnNameInput);
    await userEvent.type(columnNameInput, "value");
    await userEvent.clear(tableNameInput);
    await userEvent.type(tableNameInput, "values");

    await waitFor(() => {
      expect(runner.loadSchema).toHaveBeenLastCalledWith(
        expect.stringContaining('CREATE OR REPLACE TABLE "values" ("value" INTEGER);'),
      );
    });
    expect(runner.loadSchema).toHaveBeenCalledWith(
      expect.stringContaining('DROP TABLE IF EXISTS "nums";'),
    );
    expect(screen.queryByRole("button", { name: /Add row to values/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove values row/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Query" }));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    await screen.findByText("3");
  });

  it("shows the initial query and reruns edited SQL when Run is clicked", async () => {
    const runner = makeRunner(async (sql) => {
      if (sql.includes("COUNT")) {
        return { columns: ["count"], rows: [[3]] };
      }
      return { columns: ["n"], rows: [[1], [2], [3]] };
    });
    const createRunner = vi.fn(async () => runner);

    render(
      <SqlPlaygroundApp
        question={question}
        initialQuery="SELECT * FROM nums;"
        createRunner={createRunner}
      />,
    );

    const editor = (await screen.findByLabelText("SQL query")) as HTMLTextAreaElement;
    expect(editor.value).toBe("SELECT * FROM nums;");

    await userEvent.clear(editor);
    await userEvent.type(editor, "SELECT COUNT(*) AS count FROM nums;");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(runner.runQuery).toHaveBeenLastCalledWith(
        "SELECT COUNT(*) AS count FROM nums;",
      );
    });
    expect(runner.loadSchema).toHaveBeenCalledTimes(1);
    await screen.findByText("count");
    await screen.findByText("3");
  });

  it("reruns edited SQL on Cmd/Ctrl+Enter without reloading the schema", async () => {
    const runner = makeRunner(async (sql) => {
      if (sql.includes("SUM")) {
        return { columns: ["sum"], rows: [[6]] };
      }
      return { columns: ["n"], rows: [[1], [2], [3]] };
    });

    render(
      <SqlPlaygroundApp
        question={question}
        initialQuery="SELECT * FROM nums;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    const editor = (await screen.findByLabelText("SQL query")) as HTMLTextAreaElement;

    await userEvent.clear(editor);
    await userEvent.type(editor, "SELECT SUM(n) AS sum FROM nums;{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(runner.runQuery).toHaveBeenLastCalledWith(
        "SELECT SUM(n) AS sum FROM nums;",
      );
    });
    expect(runner.loadSchema).toHaveBeenCalledTimes(1);
    await screen.findByText("sum");
    await screen.findByText("6");
  });

  it("shows inline SQL errors after an invalid query run", async () => {
    const runner = makeRunner(async (sql) => {
      if (sql.includes("SELEKT")) {
        return { error: "Parser Error: syntax error at or near \"SELEKT\"" };
      }
      return { columns: ["n"], rows: [[1], [2], [3]] };
    });

    render(
      <SqlPlaygroundApp
        question={question}
        initialQuery="SELECT * FROM nums;"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    const editor = (await screen.findByLabelText("SQL query")) as HTMLTextAreaElement;

    await userEvent.clear(editor);
    await userEvent.type(editor, "SELEKT * FROM nums;");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    await screen.findByText(/Parser Error: syntax error at or near "SELEKT"/);
    expect(runner.loadSchema).toHaveBeenCalledTimes(1);
  });

  it("starts practice from a two-option home chooser without showing the full catalog", async () => {
    const runner: Runner = {
      loadSchema: vi.fn(async () => {}),
      runQuery: vi.fn(async () => ({ columns: ["total"], rows: [[3]] })),
      close: vi.fn(async () => {}),
    };

    render(
      <SqlPracticeStudio
        exercises={[exerciseOne, exerciseTwo]}
        createRunner={vi.fn(async () => runner)}
      />,
    );

    expect(screen.getByLabelText("Home chooser")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Practice with sample data/i })).toBeTruthy();
    expect(screen.getByLabelText("Use my own tables")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open Warm-up One/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Open Warm-up Two/i })).toBeNull();

    await chooseSourceFromHome(/Practice with sample data/i);
    expect(await screen.findByRole("button", { name: /Open Warm-up One/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Open Warm-up Two/i })).toBeTruthy();
    await chooseSourceFromHome(/Open Warm-up One/i);

    await waitFor(() => {
      expect(runner.loadSchema).toHaveBeenLastCalledWith(
        expect.stringContaining('CREATE OR REPLACE TABLE "nums" ("n" INTEGER);'),
      );
    });
    expect(((await screen.findByLabelText("SQL query")) as HTMLTextAreaElement).value).toBe("");
  });

  it("uses a home chooser instead of a permanent rail, while preserving source-specific defaults", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[2]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise, customImportExercise]}
        createRunner={vi.fn(async () => runner)}
      />,
    );

    expect(screen.queryByLabelText("Exercise library")).toBeNull();
    expect(screen.getByLabelText("Home chooser")).toBeTruthy();
    expect(screen.getByText("Practice with sample data")).toBeTruthy();
    expect(screen.getByText("Use my own tables")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open Curated Seed/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Import prompt\/schema/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create schema/i })).toBeTruthy();

    await chooseSourceFromHome(/Practice with sample data/i);
    await chooseSourceFromHome(/Open Curated Seed/i);
    await screen.findByLabelText("SQL query");
    expect(screen.queryByRole("button", { name: "Setup" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Query" })).toBeNull();
    expect(screen.queryByLabelText("Import prompt")).toBeNull();
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await chooseSourceFromHome(/Import prompt\/schema/i);
    expect(screen.getByRole("button", { name: "Setup" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Query" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(await screen.findByLabelText("Import prompt")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await chooseSourceFromHome(/Create schema/i);
    expect(screen.getByRole("button", { name: "Setup" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Query" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(await screen.findByText("Start from a blank schema")).toBeTruthy();
    expect(screen.queryByLabelText("Import prompt")).toBeNull();
  });

  it("lets New Schema start blank, add structure, and apply generated sample rows", async () => {
    const runner = makeRunner(async (sql) => {
      if (sql.includes("COUNT")) {
        return { columns: ["total"], rows: [[12]] };
      }
      return { columns: ["id"], rows: [[1]] };
    });

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise, customImportExercise]}
        initialExerciseId="curated-seed"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await chooseNewSchemaSource();

    expect(screen.getByText("Start from a blank schema")).toBeTruthy();
    expect(screen.queryByLabelText("Import prompt")).toBeNull();
    expect(screen.getByRole("button", { name: "Add table" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Add table" }));

    const tableNameInput = (await screen.findByLabelText("Table 1 name")) as HTMLInputElement;
    expect(tableNameInput.value).toBe("table_1");
    expect(screen.getByRole("button", { name: "Add column to table_1" })).toBeTruthy();

    const columnNameInput = (await screen.findByLabelText(
      "table_1 column 1 name",
    )) as HTMLInputElement;

    await userEvent.clear(tableNameInput);
    await userEvent.type(tableNameInput, "orders");
    await userEvent.clear(columnNameInput);
    await userEvent.type(columnNameInput, "order_id");

    expect(screen.getByRole("button", { name: "Add column to orders" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add column to orders" }));

    const secondColumnNameInput = (await screen.findByLabelText(
      "orders column 2 name",
    )) as HTMLInputElement;
    await userEvent.clear(secondColumnNameInput);
    await userEvent.type(secondColumnNameInput, "status");

    const secondTypeSelect = screen.getByLabelText(
      "orders column status type",
    ) as HTMLSelectElement;
    await userEvent.selectOptions(secondTypeSelect, "string");

    await userEvent.click(screen.getByRole("button", { name: "Apply schema" }));
    await userEvent.click(screen.getByRole("button", { name: "Query" }));

    expect((await screen.findAllByText("Generated sample data")).length).toBeGreaterThan(0);
    const editor = (await screen.findByLabelText("SQL query")) as HTMLTextAreaElement;
    await userEvent.clear(editor);
    await userEvent.type(editor, "SELECT COUNT(*) AS total FROM orders;");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    await screen.findByText("12");
  });

  it("keeps New Schema schema-focused while allowing structure removal", async () => {
    const runner = makeRunner(async () => ({ columns: ["id"], rows: [[1]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise, customImportExercise]}
        initialExerciseId="curated-seed"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await chooseNewSchemaSource();

    expect(screen.queryByRole("button", { name: /Add row/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove row/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Add table" }));
    await userEvent.click(screen.getByRole("button", { name: "Add column to table_1" }));

    expect(await screen.findByLabelText("table_1 column 2 name")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: "Remove column" })[1]);
    await waitFor(() => {
      expect(screen.queryByLabelText("table_1 column 2 name")).toBeNull();
    });

    await userEvent.click(screen.getByRole("button", { name: "Remove table" }));
    await screen.findByText("No tables yet. Add one to start shaping the schema.");
  });

  it("lets authored schemas declare explicit references and shows them in setup and query context", async () => {
    const runner = makeRunner(async () => ({ columns: ["id"], rows: [[1]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise, customImportExercise]}
        initialExerciseId="curated-seed"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await chooseNewSchemaSource();

    await userEvent.click(screen.getByRole("button", { name: "Add table" }));
    const firstTableName = (await screen.findByLabelText("Table 1 name")) as HTMLInputElement;
    await userEvent.clear(firstTableName);
    await userEvent.type(firstTableName, "orders");

    const firstColumnName = (await screen.findByLabelText(
      "orders column 1 name",
    )) as HTMLInputElement;
    await userEvent.clear(firstColumnName);
    await userEvent.type(firstColumnName, "order_id");

    await userEvent.click(screen.getByRole("button", { name: "Add column to orders" }));
    const secondColumnName = (await screen.findByLabelText(
      "orders column 2 name",
    )) as HTMLInputElement;
    await userEvent.clear(secondColumnName);
    await userEvent.type(secondColumnName, "customer_id");

    await userEvent.click(screen.getByRole("button", { name: "Add table" }));
    const secondTableName = (await screen.findByLabelText("Table 2 name")) as HTMLInputElement;
    await userEvent.clear(secondTableName);
    await userEvent.type(secondTableName, "customers");

    const customerIdInput = (await screen.findByLabelText(
      "customers column 1 name",
    )) as HTMLInputElement;
    await userEvent.clear(customerIdInput);
    await userEvent.type(customerIdInput, "customer_id");

    await userEvent.selectOptions(
      screen.getByLabelText("orders column 2 reference"),
      '["customers","customer_id"]',
    );

    await screen.findByText("orders.customer_id -> customers.customer_id");
    await userEvent.click(screen.getByRole("button", { name: "Apply schema" }));
    await userEvent.click(screen.getByRole("button", { name: "Query" }));

    expect((await screen.findAllByText("joins on: customer_id")).length).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText("orders.customer_id -> customers.customer_id")).length,
    ).toBeGreaterThan(0);
  });

  it("preserves custom-import and new-schema drafts when returning Home", async () => {
    const runner = makeRunner(async () => ({ columns: ["id"], rows: [[1]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise, customImportExercise]}
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await chooseSourceFromHome(/Import prompt\/schema/i);

    const importBox = (await screen.findByLabelText("Import prompt")) as HTMLTextAreaElement;
    await userEvent.clear(importBox);
    await userEvent.type(importBox, "orders Table:");

    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await chooseSourceFromHome(/Import prompt\/schema/i);
    expect(((await screen.findByLabelText("Import prompt")) as HTMLTextAreaElement).value).toBe(
      "orders Table:",
    );

    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await chooseSourceFromHome(/Create schema/i);
    await userEvent.click(screen.getByRole("button", { name: "Add table" }));

    const tableNameInput = (await screen.findByLabelText("Table 1 name")) as HTMLInputElement;
    await userEvent.clear(tableNameInput);
    await userEvent.type(tableNameInput, "orders");

    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await chooseSourceFromHome(/Create schema/i);
    expect(((await screen.findByLabelText("Table 1 name")) as HTMLInputElement).value).toBe(
      "orders",
    );
  });

  it("confirms inline before resetting imported sources, while seeded reset stays lightweight", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[1]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise, customImportExercise]}
        initialExerciseId="curated-seed"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    expect(screen.queryByText("Reset this work?")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Home" }));
    await chooseSourceFromHome(/Import prompt\/schema/i);

    const importBox = (await screen.findByLabelText("Import prompt")) as HTMLTextAreaElement;
    await userEvent.clear(importBox);
    await userEvent.type(importBox, "orders Table:");

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Reset this work?")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(importBox.value).toBe("orders Table:");

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, reset" }));
    expect(((await screen.findByLabelText("Import prompt")) as HTMLTextAreaElement).value).toBe("");
  });

  it("shows seeded schema context in Query mode without leaving the editor", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[2]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise]}
        initialExerciseId="curated-seed"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await screen.findByLabelText("SQL query");

    const schemaReference = screen.getByLabelText("Schema reference");

    expect(within(schemaReference).getByRole("heading", { name: "Schema reference" })).toBeTruthy();
    expect(within(schemaReference).getByText("customers")).toBeTruthy();
    expect(within(schemaReference).getByText("customer_name")).toBeTruthy();
  });

  it("lets query mode collapse schema reference without hiding the editor", async () => {
    const runner = makeRunner(async () => ({ columns: ["total"], rows: [[2]] }));

    render(
      <SqlPracticeStudio
        exercises={[curatedSeedExercise]}
        initialExerciseId="curated-seed"
        createRunner={vi.fn(async () => runner)}
      />,
    );

    await screen.findByLabelText("SQL query");

    await userEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(screen.queryByLabelText("Schema reference")).toBeNull();
    expect(screen.getByLabelText("SQL query")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show" })).toBeTruthy();
  });
});
