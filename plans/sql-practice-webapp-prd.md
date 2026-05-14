# SQL Practice Web App PRD

## Problem Statement

A user practicing SQL interview questions needs a fast way to turn a written prompt into a runnable environment without manually setting up a database, creating tables by hand, or switching between multiple tools. Typical interview practice content includes table schemas, sample rows, and an expected metric or output, but most practice sites either lock the user into predefined questions or require more setup friction than the exercise justifies.

The user wants a simple web app where they can paste the schema and sample data from a question, load it into a temporary SQL environment, and run queries against it immediately. The app should optimize for low friction, fast iteration, and short-lived practice sessions rather than collaboration, persistence, or production data management.

## Solution

Build a local-first web app for SQL interview practice that accepts question input in a lightweight authoring format, converts that input into temporary relational tables, and executes the user's SQL against those tables in the browser.

For v1, the app should:

- Let the user define one or more tables with column names, column types, and example rows.
- Support quick entry from pasted interview content rather than requiring a normalized import workflow.
- Turn pasted interview content into a structured, editable preview that the user can correct before execution.
- Materialize those tables into an in-memory DuckDB runtime running in the browser via DuckDB-Wasm.
- Provide a single-screen workspace with question context, schema/data preview, SQL editor, run action, and query results.
- Keep sessions ephemeral by default, with no login, no saved history, and no backend dependency.

This solution keeps the first version small, avoids operational overhead, and matches the user's goal of practicing SQL questions quickly.

## User Stories

1. As a SQL interview candidate, I want to paste a question's table definitions and example rows into the app, so that I can start practicing without creating tables manually.
2. As a SQL interview candidate, I want to define multiple related tables in one session, so that I can practice joins, aggregations, and subqueries.
3. As a SQL interview candidate, I want to see the inferred schema before running queries, so that I can confirm the app understood my input correctly.
4. As a SQL interview candidate, I want to edit column names and types after import, so that I can fix parsing mistakes without starting over.
5. As a SQL interview candidate, I want to view the sample rows loaded for each table, so that I can reason about the expected output.
6. As a SQL interview candidate, I want to run arbitrary SQL against the loaded dataset, so that I can test different approaches quickly.
7. As a SQL interview candidate, I want query results to render in a table, so that I can inspect my output easily.
8. As a SQL interview candidate, I want execution errors to be shown clearly, so that I can debug syntax and logic problems quickly.
9. As a SQL interview candidate, I want the app to work without server setup, so that I can use it immediately on my machine or in a simple deployment.
10. As a SQL interview candidate, I want the app to reset the temporary database for a new question, so that old tables do not interfere with my next practice session.
11. As a SQL interview candidate, I want the app to load small interview-style datasets quickly, so that the practice loop feels instantaneous.
12. As a SQL interview candidate, I want timestamp, integer, string, and null-like values to be handled predictably, so that common interview data shapes work without custom cleanup.
13. As a SQL interview candidate, I want blank or placeholder values such as `-` to be translated consistently, so that incomplete sample data does not break the session.
14. As a SQL interview candidate, I want to keep the full question prompt visible while writing SQL, so that I do not have to switch tabs.
15. As a SQL interview candidate, I want a seeded sample question to appear when the app opens, so that I can understand the input format immediately.
16. As a SQL interview candidate, I want the app to require minimal clicks between paste and query execution, so that it feels faster than setting up a local database manually.
17. As a SQL interview candidate, I want the SQL editor to preserve formatting and multiline queries, so that I can practice realistic interview answers.
18. As a SQL interview candidate, I want to rerun modified queries repeatedly against the same temporary dataset, so that I can iterate toward a correct answer.
19. As a SQL interview candidate, I want the app to surface parser warnings when the pasted input is ambiguous, so that I understand what needs manual correction.
20. As a SQL interview candidate, I want the app to remain usable on a laptop screen without complex navigation, so that it works well during focused practice sessions.
21. As a future maintainer, I want parsing, table construction, and query execution to be separated into deep modules, so that the app can evolve without entangling UI and SQL logic.
22. As a future maintainer, I want the input-to-dataset pipeline to be testable in isolation, so that edge cases in parsing and type coercion can be validated without browser-level tests.
23. As a future maintainer, I want the SQL runtime to be wrapped behind a stable interface, so that the implementation could later swap engines or execution modes with limited UI changes.

## Implementation Decisions

- The app will be greenfield and optimized for a narrow v1 use case rather than a broad data-workbench feature set.
- The product will be local-first and ephemeral for v1. No user accounts, cloud saves, multi-user features, or backend persistence will be included.
- SQL execution will use DuckDB-Wasm in the browser. This is the default decision because it supports SQL semantics suitable for interview practice while avoiding a backend service.
- The app will target small interview-style datasets rather than large-file analytics workloads.
- The primary interaction model will be a single-screen workspace with four regions: question/input, table preview, SQL editor, and results/error output.
- The initial authoring workflow will accept pasted question text as an import step, then move the user into a structured editable preview. The parser should be designed so that support for richer freeform import can improve over time without changing the rest of the app.
- The import pipeline should normalize source input into an internal question model before any SQL runtime work begins.
- The internal question model should represent:
  - Question prompt text
  - A list of tables
  - For each table: name, ordered columns, declared types, and sample rows
- Placeholder values such as `-` and blank cells should map to null when appropriate, with explicit normalization rules rather than ad hoc UI logic.
- The app should expose parse warnings and validation errors at import time, then let the user repair issues in the structured editor before SQL execution.
- SQL execution should occur only against materialized in-memory tables derived from the internal question model. UI components should not generate SQL directly except through a dedicated database adapter layer.
- The SQL runtime should be wrapped in a deep module that owns:
  - Database lifecycle
  - Table creation
  - Row insertion/loading
  - Query execution
  - Result shaping for UI consumption
- The input parser should be a separate deep module that owns:
  - Converting pasted or structured input into the internal question model
  - Type inference or type normalization
  - Null coercion
  - Parse diagnostics
- A structured question editor should be a separate module that owns:
  - Rendering tables, columns, declared types, and sample rows as editable UI
  - Updating the internal question model directly after import
  - Preserving the edited model as the source of truth instead of round-tripping back to raw text
- A separate application-state module should coordinate:
  - Current question/session state
  - Parse status
  - Active SQL text
  - Last query result
  - Reset behavior
- The UI should remain thin and declarative, consuming stable module interfaces instead of embedding parsing or SQL logic inside components.
- The editor only needs to support writing and running SQL in v1. Answer checking against an expected output is explicitly excluded from the first release.
- A sample starter exercise should ship with the app so the user can understand the expected workflow on first load.
- The likely frontend stack should be React-based for ergonomics and ecosystem support. If no stronger preference emerges, a lightweight Next.js or Vite React setup is acceptable, but this PRD does not depend on one specific framework choice.

## Testing Decisions

- Good tests should validate externally visible behavior through stable module interfaces rather than asserting internal implementation details.
- The highest-value automated tests are in the non-UI modules, because correctness risk is concentrated in parsing, normalization, table construction, and query execution.
- The parsing module should be tested with representative interview inputs, malformed inputs, partial inputs, mixed types, and placeholder/null edge cases.
- The question-model normalization module should be tested to ensure consistent treatment of column order, type mapping, row shape validation, and null coercion.
- The database adapter module should be tested to ensure it creates tables correctly, loads rows predictably, executes SQL, returns column metadata with results, and surfaces execution failures in a stable format.
- The session/state orchestration module should be tested for reset behavior, parse-to-load flow, and rerun behavior when SQL changes but the dataset does not.
- UI tests should focus on critical workflows only:
  - Load sample question
  - Edit question data
  - Run SQL
  - See results
  - See parse or execution errors
- Because the repo is currently empty, there is no existing prior art in the codebase. Test structure should therefore be chosen to reinforce module boundaries from the start rather than mirroring legacy patterns.
- Manual verification should include realistic practice flows using copied interview prompts, especially ones with multiple tables, timestamps, and null placeholders.

## Out of Scope

- User authentication
- Saved practice sessions
- Cloud sync
- Shareable links
- Collaborative editing
- Expected-answer checking or auto-grading
- Query history across sessions
- Multi-tab SQL workspaces
- Large dataset upload optimization
- Advanced schema design features such as indexes, constraints, or ER diagram generation
- Non-SQL interview modes
- AI hints, explanations, or answer generation
- Production-grade dataset management

## Further Notes

- The most important product constraint for v1 is reducing setup friction. Any design choice that adds operational complexity without materially improving the paste-to-query loop should be rejected.
- The parser is the riskiest import-time usability area. The structured editable preview reduces that risk by letting the user correct imported tables without going back to raw text, but the system should still be designed so parser capability can improve independently of the UI and SQL runtime.
- DuckDB-Wasm should be treated as an implementation detail behind a stable execution interface. That preserves flexibility if a future version needs a server-backed runtime or a different embedded SQL engine.
- If the app proves useful, the next likely product expansions are saved exercises, expected-answer validation, and a library of seeded interview questions. Those should remain outside the initial build to keep the first release small and testable.
