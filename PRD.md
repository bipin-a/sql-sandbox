# SQL Playground — PRD

## Problem Statement

I want to practice SQL interview questions from sites like DataLemur and LeetCode against a real SQL engine without setting up Postgres locally, creating tables by hand, or fighting a heavyweight workflow. Most problems include at least table schemas, and many include sample rows and a target question. The missing piece is a fast environment where I can load that content and immediately start querying it.

I want a personal web app that makes the schema-to-query loop extremely short. I should be able to load a question's tables, inspect either curated or generated sample data, write SQL, run it, and iterate in seconds.

## Solution

Build a static, local-first web app that:

1. Lets me paste DataLemur-style table definitions, with or without sample rows, for one or more tables.
2. Parses that input into a structured draft model.
3. Generates deterministic read-only sample data when the prompt has schema but no rows.
4. Presents that draft as a schema editor plus read-only mock data preview.
5. Validates edits locally and keeps the last valid applied dataset separate from the current draft when needed.
6. Loads the last valid applied tables into an in-browser DuckDB instance.
7. Gives me a SQL editor and a Run action.
8. Shows the query result table or execution error immediately.
9. Ships with a small built-in exercise library so I can start practicing immediately and switch among multiple prompts without re-pasting everything.
10. Provides a Setup mode for schema/import work and a Query mode where the SQL workbench takes most of the screen.

No backend. No accounts. No answer checking in v1.

The goal of v1 is not to be a full SQL trainer. The goal is to be the fastest possible way to turn an interview prompt or schema block into a runnable SQL sandbox.

## User Stories

1. As a SQL interview candidate, I want to paste a question's table definitions and example rows into the app, so that I can start practicing without writing `CREATE TABLE` statements myself.
2. As a SQL interview candidate, I want to load multiple related tables in one session, so that I can practice joins and subqueries against realistic prompts.
3. As a SQL interview candidate, I want the app to understand common interview data types like integer, string, float, boolean, and timestamp, so that my queries behave as expected.
4. As a SQL interview candidate, I want dashes and blank values in example rows to be treated consistently as null when appropriate, so that pasted sample data loads correctly.
5. As a SQL interview candidate, I want to paste schema-only table definitions when a prompt does not include example rows, so that the app can still create a runnable practice dataset.
6. As a SQL interview candidate, I want generated sample data to be deterministic and visibly labeled, so that query results are stable and I understand when data is synthetic.
7. As a SQL interview candidate, I want built-in exercises to keep their curated rows, so that canonical examples like the DoorDash `75.00` result remain meaningful.
8. As a SQL interview candidate, I want to inspect a structured preview of the parsed tables before running queries, so that I can catch parser mistakes early.
9. As a SQL interview candidate, I want to edit table names, column names, and declared types after import, so that I can fix schema mistakes without going back to raw text.
10. As a SQL interview candidate, I want to inspect the loaded mock rows for each table, so that I can reason about the data while writing SQL without manually editing the example data.
11. As a SQL interview candidate, I want the pasted text to matter only at import time, so that once I am editing the structured preview I am not fighting a second source of truth.
12. As a SQL interview candidate, I want invalid schema edits to stay local to the draft and show inline validation, so that one bad change does not poison the runnable dataset.
13. As a SQL interview candidate, I want the app to preserve the last valid applied dataset until I fix invalid schema edits, so that I do not lose a working sandbox while correcting imported data.
14. As a SQL interview candidate, I want a Setup mode focused on prompt, schema, and sample data review, so that import and correction have enough room.
15. As a SQL interview candidate, I want a Query mode where the SQL editor and result panel take most of the screen, so that the app feels like a real workbench while practicing.
16. As a SQL interview candidate, I want a SQL editor with syntax highlighting, so that writing queries feels like a real development environment.
17. As a SQL interview candidate, I want to run my query with a button and a keyboard shortcut, so that I can iterate quickly.
18. As a SQL interview candidate, I want query results to render as a table, so that I can compare my output to the prompt visually.
19. As a SQL interview candidate, I want SQL errors to display clearly in the UI, so that I can fix broken queries without guessing what happened.
20. As a SQL interview candidate, I want to rerun edited queries against the same temporary dataset, so that I can iterate without reimporting the question.
21. As a SQL interview candidate, I want to reset the current session and start a new question easily, so that old tables do not leak into later practice.
22. As a SQL interview candidate, I want the app to work entirely in the browser, so that I can use it without deploying or maintaining a backend.
23. As a SQL interview candidate, I want several built-in exercises available on first load, so that I can practice different SQL patterns without collecting prompts myself.
24. As a SQL interview candidate, I want to switch between built-in exercises quickly, so that I can move between drills without rebuilding the sandbox from scratch.
25. As a future maintainer, I want parsing, mock data generation, model normalization, structured editing, seeded exercise metadata, and query execution to live in separate modules, so that the app stays testable and the UI stays thin.
26. As a future maintainer, I want the parser and SQL runtime wrappers to expose stable interfaces, so that the implementation can evolve without rewriting the whole app.

## Implementation Decisions

**Stack**

- Vite + React + TypeScript
- DuckDB-Wasm for in-browser SQL execution
- Monaco Editor for SQL editing

**Product constraints**

- The app is single-user and local-first.
- Sessions are ephemeral in v1. Reloading the page may reset the problem and query state.
- The app is optimized for small interview-style datasets, not large CSV imports or analytics workloads.
- The app only needs to support writing and running SQL. It does not need to determine correctness in v1.
- The built-in exercise library is intentionally small in v1: a handful of curated prompts plus one custom import entry point.

**Modules**

- **SchemaParser**
  - Pure module.
  - Input: pasted DataLemur-style text describing one or more tables, with or without example rows.
  - Output: structured draft model such as `{ tables: [{ name, columns, rows }] }`.
  - Responsibilities:
    - detect table names
    - parse column names and declared types
    - parse example rows
    - normalize blanks and placeholder values to null when appropriate
    - emit parse warnings or errors when input is ambiguous or malformed
  - The parser is a one-shot import step, not the primary editing surface.

- **MockDataGenerator**
  - Pure module.
  - Input: a normalized table schema with missing or empty rows.
  - Output: deterministic read-only sample rows for that schema.
  - Responsibilities:
    - generate a small fixed number of rows, defaulting to 5
    - produce type-correct values for integer, string, float, boolean, and timestamp columns
    - apply light per-column heuristics such as `*_id`, `status`, date/timestamp names, amounts, and names
    - label generated rows distinctly from curated or imported rows in the UI
    - avoid relationship-aware or cross-table key alignment in v1

- **QuestionModelNormalizer**
  - Pure module.
  - Input: raw parsed table structures from `SchemaParser`.
  - Output: normalized internal model with stable typing and row shapes.
  - Responsibilities:
    - preserve column order
    - validate row width against schema
    - normalize supported types to a small internal enum
    - prepare values for downstream SQL loading
    - refuse or isolate invalid values rather than silently coercing them into broken runtime state

- **QuestionEditor**
  - Structured UI module.
  - Input: parsed or normalized question model plus editable draft state.
  - Output: user edits expressed as draft updates and validation state.
  - Responsibilities:
    - render schema fields as editable controls while keeping sample rows read-only
    - support renaming tables and columns
    - support changing declared column types
    - keep mock sample rows visible for inspection, but not directly editable
    - keep the structured draft, not the raw pasted text, as the source of truth after import
    - surface schema-level validation errors without poisoning the last valid applied dataset

- **DuckDBRunner**
  - Thin async wrapper around DuckDB-Wasm.
  - Interface:
    - `init()`
    - `reset()`
    - `loadTables(questionModel)`
    - `runQuery(sql)`
  - Responsibilities:
    - database lifecycle
    - table creation
    - row loading
    - query execution
    - result shaping for UI display

- **SessionState**
  - Application-state module.
  - Responsibilities:
    - selected built-in exercise or custom import mode
    - current workspace mode: Setup or Query
    - current import text while the user is importing a prompt
    - current parsed draft model
    - current editable draft values and validation state
    - current last valid applied question model
    - current SQL text
    - last query result or error
    - reset behavior

- **UI components**
  - `ExerciseLibrary`: built-in exercise rail with seeded cases and custom import entry point
  - `ImportPanel`: paste raw question text once and trigger import
  - `QuestionEditor`: editable structured table/schema view
  - `QueryEditor`: Monaco-based SQL editor
  - `ResultPanel`: result table or error output
  - `Toolbar`: run and reset actions
  - `WorkspaceModeSwitch`: plain segmented control for switching between Setup and Query modes

**Architectural decisions**

- Parsing and SQL execution logic must not live inside React components.
- DuckDB-Wasm should be wrapped behind a stable interface so it remains an implementation detail.
- The parser should target the common DataLemur-style format first rather than trying to support arbitrary pasted text on day one.
- After import, the structured draft becomes the editing surface, but the runnable dataset should remain the last valid applied model until draft validation passes again.
- Sample rows should be treated as read-only mock data in v1. Users can inspect them, and schema changes may revalidate those rows, but users should not manually edit cell values or add/remove rows.
- When a prompt has schema but no sample rows, the app should generate deterministic sample rows rather than forcing the user to enter table data manually.
- Built-in exercises should keep curated rows when available; generated sample data is a fallback for schema-only imports, not a replacement for known good example data.
- Generated sample data should be intentionally simple and per-column in v1. Cross-table foreign-key alignment, composite-key inference, and relationship-aware generation are out of scope until real usage proves the need.
- Parse warnings should be surfaced at import time so the user can repair bad input early, and then be complemented by structured editor validations once the model is editable.
- Query execution should remain explicit through `Run`. Dataset edits may update the last valid applied model, but they should not silently rerun the query on every keystroke.
- Built-in exercises should live in source as static metadata and load instantly without reparsing external content.
- The first version should use a single-screen layout with a lightweight exercise rail and a plain Setup/Query mode switch rather than routing-heavy workflows.
- Built-in exercises should default to Query mode because their schema and rows are already loaded. Custom import should default to Setup mode because the user is still preparing the dataset.

## Testing Decisions

A good test for this project validates observable behavior through stable module interfaces rather than testing implementation details.

The highest-value automated tests are:

- **SchemaParser**
  - parses a realistic multi-table interview prompt
  - parses schema-only table definitions without requiring example rows
  - handles blank values and dashes as null
  - rejects malformed row counts with useful diagnostics
  - preserves table and column ordering

- **MockDataGenerator**
  - generates deterministic row values from a schema-only model
  - emits type-correct values for all supported scalar types
  - keeps output stable between test runs
  - does not attempt cross-table key alignment in v1

- **QuestionModelNormalizer**
  - validates row width against schema
  - normalizes supported scalar types consistently
  - produces stable value representations for the SQL loader

- **QuestionEditor**
  - applies table, column, and type edits to the structured model
  - preserves invariants through draft validation rather than by reparsing raw text
  - isolates invalid draft edits from the last valid applied dataset
  - rebuilds the executed dataset from the applied model, not from stale import text or invalid draft state

- **DuckDBRunner**
  - is validated in the browser in Phase 1 rather than through a Node-only harness
  - should gain automated integration coverage later only if browser validation exposes runner-specific defects

- **Critical UI flow**
  - load a built-in exercise
  - switch to a second built-in exercise
  - run a query
  - see results
  - see an error for invalid SQL

There is no prior art in the repo, so test boundaries should reinforce the intended module split from the start.

## Out of Scope

- Expected-output parsing or result diffing
- Pass/fail answer checking
- User-authored saved problem libraries
- Draft query persistence
- Round-tripping edited structured data back into raw import text
- Manual row/cell data editing
- Relationship-aware generated data or foreign-key inference
- User accounts or sync
- Sharing or importing problems by URL
- Large file ingestion
- Mobile-first UX
- Multiple SQL dialects
- AI hints, solution generation, or grading

## Further Notes

- The built-in exercise library should include the DoorDash bad-experience example plus a few additional curated prompts that cover filtering, aggregation, joins, and ranking.
- Schema-only imports should still become runnable by generating clearly labeled deterministic sample data.
- Parser reliability is still the biggest import-time risk, but the editable structured preview deliberately reduces the cost of imperfect parsing by letting the user correct the imported model directly.
- Invalid draft edits must never crash the app or generate invalid schema SQL. Recovery UX matters more than broad edit surface area.
- The table editor should feel like schema correction, not spreadsheet authoring. Mock rows are reference material, not a manual data-entry surface.
- The Query workspace should visually dominate when the user is practicing. Setup can remain one click away through a mode switch, but the SQL editor should not be trapped in a cramped split once the dataset is ready.
- DuckDB-Wasm bundle size is acceptable for a personal tool, especially if loaded lazily.
- Phase 1 integration truth lives in the shipped browser runtime, not in a separate Node-specific DuckDB-Wasm test harness.
- Once the core paste-to-query loop is stable, the next most defensible additions are expected-output checking and lightweight persistence. They should not be built before the base workflow feels solid.
