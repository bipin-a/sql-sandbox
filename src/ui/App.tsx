import { useEffect, useRef, useState } from "react";
import type {
  CellValue,
  ColumnType,
  ParseWarning,
  QuestionModel,
} from "../lib/questionModel";
import { generateDropTablesSql, generateSchemaSql } from "../lib/sqlGenerator";
import { createRunner } from "../lib/duckdbRunner";
import { compareQueryResults } from "../lib/duckdbRunner";
import type { QueryResult, Runner } from "../lib/duckdbRunner";
import { ensureQuestionSampleRows } from "../lib/mockDataGenerator";
import { inferJoinHintsByTable } from "../lib/relationships";
import { parseSchemaText } from "../lib/schemaParser";
import { isSupportedTimestampText, parseTimestampText } from "../lib/timestamps";
import {
  defaultExercises,
  defaultInitialExerciseId,
  type SeedExerciseDefinition,
} from "../seed/exercises";
import { QueryEditor } from "./QueryEditor";
import "./app.css";

type Status = "loading" | "ready" | "error";
type ValidationErrorMap = Record<string, string>;
type PendingDraftMap = Record<string, true>;
type WorkspaceMode = "setup" | "query";

const COLUMN_TYPES: ColumnType[] = [
  "integer",
  "string",
  "timestamp",
  "float",
  "boolean",
];

export function App() {
  return (
    <SqlPracticeStudio
      exercises={defaultExercises}
      initialExerciseId={defaultInitialExerciseId}
      createRunner={createRunner}
    />
  );
}

export type ExerciseDefinition = SeedExerciseDefinition;

interface SqlPracticeStudioProps {
  exercises: ExerciseDefinition[];
  initialExerciseId?: string;
  createRunner: () => Promise<Runner>;
}

export function SqlPracticeStudio({
  exercises,
  initialExerciseId,
  createRunner,
}: SqlPracticeStudioProps) {
  const [selectedExerciseId, setSelectedExerciseId] = useState(
    initialExerciseId ?? exercises[0]?.id ?? "",
  );
  const [sessionVersion, setSessionVersion] = useState(0);

  const selectedExercise =
    exercises.find((exercise) => exercise.id === selectedExerciseId) ?? exercises[0];

  if (!selectedExercise) return null;

  return (
    <div className="studio-shell">
      <aside className="exercise-rail">
        <div className="rail-brand">
          <div className="rail-kicker">Casefile Desk</div>
          <h1>SQL Playground</h1>
          <p>Curated drills, editable evidence, real DuckDB queries.</p>
        </div>

        <div className="exercise-list" aria-label="Exercise library">
          {exercises.map((exercise, index) => {
            const active = exercise.id === selectedExercise.id;
            return (
              <button
                key={exercise.id}
                className={`exercise-card${active ? " active" : ""}`}
                onClick={() => {
                  setSelectedExerciseId(exercise.id);
                  setSessionVersion(0);
                }}
                aria-pressed={active}
                aria-label={`Open ${exercise.title}`}
              >
                <div className="exercise-card-topline">
                  <span className="exercise-case-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="exercise-company">{exercise.company}</span>
                </div>
                <div className="exercise-card-title">{exercise.title}</div>
                <div className="exercise-card-summary">{exercise.summary}</div>
                <div className="exercise-meta">
                  <span>{exercise.difficulty}</span>
                  <span>{exercise.initialQuestion?.tables.length ?? 0} tables</span>
                </div>
                <div className="exercise-tags">
                  {exercise.themes.map((theme) => (
                    <span key={theme}>{theme}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="studio-main">
        <header className="studio-toolbar">
          <div>
            <div className="studio-kicker">{selectedExercise.company}</div>
            <h2>{selectedExercise.title}</h2>
          </div>
          <div className="studio-toolbar-actions">
            <span className="studio-status-chip">{selectedExercise.difficulty}</span>
            <button
              className="ghost-action"
              onClick={() => setSessionVersion((version) => version + 1)}
            >
              Reset case
            </button>
          </div>
        </header>

        <SqlPlaygroundImportApp
          key={`${selectedExercise.id}:${sessionVersion}`}
          initialImportText={selectedExercise.prompt}
          initialQuestion={selectedExercise.initialQuestion ?? null}
          initialQuery={selectedExercise.initialQuery}
          createRunner={createRunner}
          exercise={selectedExercise}
          readOnlyImport={selectedExercise.mode !== "custom"}
        />
      </main>
    </div>
  );
}

interface SqlPlaygroundImportAppProps {
  initialImportText: string;
  initialQuery: string;
  createRunner: () => Promise<Runner>;
  initialQuestion?: QuestionModel | null;
  parseImportText?: (input: string) => QuestionModel;
  exercise?: ExerciseDefinition;
  readOnlyImport?: boolean;
}

export function SqlPlaygroundImportApp({
  initialImportText,
  initialQuery,
  createRunner,
  initialQuestion = null,
  parseImportText = parseSchemaText,
  exercise,
  readOnlyImport = false,
}: SqlPlaygroundImportAppProps) {
  const [importText, setImportText] = useState(initialImportText);
  const [draftQuestion, setDraftQuestion] = useState<QuestionModel | null>(initialQuestion);
  const [appliedQuestion, setAppliedQuestion] = useState<QuestionModel | null>(
    initialQuestion,
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("setup");
  const [isSchemaEditing, setIsSchemaEditing] = useState(false);
  const [isQuerySchemaVisible, setIsQuerySchemaVisible] = useState(true);
  const [validationErrors, setValidationErrors] = useState<ValidationErrorMap>({});
  const [pendingDraftKeys, setPendingDraftKeys] = useState<PendingDraftMap>({});

  function syncDraft(update: (current: QuestionModel) => QuestionModel) {
    setDraftQuestion((currentDraft) => {
      if (!currentDraft) return currentDraft;
      const nextDraft = update(currentDraft);
      const evaluation = evaluateDraftQuestion(nextDraft);
      setValidationErrors(evaluation.validationErrors);
      setPendingDraftKeys(evaluation.pendingDraftKeys);
      if (evaluation.appliedQuestion) {
        setAppliedQuestion(evaluation.appliedQuestion);
      }
      return nextDraft;
    });
  }

  function handleImport() {
    const nextQuestion = ensureQuestionSampleRows(parseImportText(importText));
    if (nextQuestion.tables.length > 0) {
      setIsSchemaEditing(false);
      setDraftQuestion(nextQuestion);
      const evaluation = evaluateDraftQuestion(nextQuestion);
      setValidationErrors(evaluation.validationErrors);
      setPendingDraftKeys(evaluation.pendingDraftKeys);
      if (evaluation.appliedQuestion) {
        setAppliedQuestion(evaluation.appliedQuestion);
      } else {
        setAppliedQuestion(null);
      }
    }
  }

  function handleTableNameChange(tableIndex: number, nextValue: string) {
    syncDraft((current) => ({
      ...current,
      tables: current.tables.map((table, currentTableIndex) =>
        currentTableIndex === tableIndex
          ? {
              ...table,
              name: nextValue,
            }
          : table,
      ),
    }));
  }

  function handleColumnNameChange(
    tableIndex: number,
    columnIndex: number,
    nextValue: string,
  ) {
    syncDraft((current) => ({
      ...current,
      tables: current.tables.map((table, currentTableIndex) => {
        if (currentTableIndex !== tableIndex) return table;
        return {
          ...table,
          columns: table.columns.map((column, currentColumnIndex) =>
            currentColumnIndex === columnIndex
              ? {
                  ...column,
                  name: nextValue,
                }
              : column,
          ),
        };
      }),
    }));
  }

  function handleColumnTypeChange(
    tableIndex: number,
    columnIndex: number,
    nextValue: ColumnType,
  ) {
    syncDraft((current) => ({
      ...current,
      tables: current.tables.map((table, currentTableIndex) => {
        if (currentTableIndex !== tableIndex) return table;
        return {
          ...table,
          columns: table.columns.map((column, currentColumnIndex) =>
            currentColumnIndex === columnIndex
              ? {
                  ...column,
                  type: nextValue,
                }
              : column,
          ),
        };
      }),
    }));
  }

  const hasBlockingDraftState =
    Object.keys(validationErrors).length > 0 || Object.keys(pendingDraftKeys).length > 0;
  const hasGeneratedSampleRows =
    draftQuestion?.tables.some((table) => table.sampleRowsMode === "generated") ?? false;

  return (
    <>
      <div className="workspace-mode-bar" aria-label="Workspace mode">
        <button
          className={`workspace-mode-button${workspaceMode === "setup" ? " active" : ""}`}
          aria-pressed={workspaceMode === "setup"}
          onClick={() => setWorkspaceMode("setup")}
        >
          Setup
        </button>
        <button
          className={`workspace-mode-button${workspaceMode === "query" ? " active" : ""}`}
          aria-pressed={workspaceMode === "query"}
          onClick={() => setWorkspaceMode("query")}
        >
          Query
        </button>
      </div>

      <div
        className={`workspace-layout workspace-layout-${workspaceMode}`}
        data-workspace-mode={workspaceMode}
      >
        <section
          className="workspace-brief-column"
          hidden={workspaceMode !== "setup"}
          aria-hidden={workspaceMode !== "setup"}
        >
          {readOnlyImport && exercise ? (
            <PromptCard exercise={exercise} prompt={importText} />
          ) : (
            <ImportPanel value={importText} onChange={setImportText} onImport={handleImport} />
          )}

          {draftQuestion?.warnings && draftQuestion.warnings.length > 0 && (
            <WarningList warnings={draftQuestion.warnings} />
          )}

          {!readOnlyImport && draftQuestion && (
            <div className="schema-edit-row">
              <button
                className="ghost-action"
                onClick={() => setIsSchemaEditing((current) => !current)}
              >
                {isSchemaEditing ? "Done editing" : "Edit schema"}
              </button>
            </div>
          )}

          {draftQuestion && (
            <QuestionPreview
              question={draftQuestion}
              editable={readOnlyImport ? false : isSchemaEditing}
              validationErrors={validationErrors}
              onTableNameChange={handleTableNameChange}
              onColumnNameChange={handleColumnNameChange}
              onColumnTypeChange={handleColumnTypeChange}
            />
          )}
        </section>

        <section
          className="workspace-query-column"
          hidden={workspaceMode !== "query"}
          aria-hidden={workspaceMode !== "query"}
        >
          {exercise && <PracticePromptCard exercise={exercise} />}

          <div className="dataset-status-card">
            <div>
              <div className="dataset-status-kicker">Runnable snapshot</div>
              <strong>
                {hasBlockingDraftState
                  ? "Draft needs attention before you can run SQL."
                  : appliedQuestion
                    ? "Dataset is current and ready to query."
                    : "Load or import a dataset to start querying."}
              </strong>
            </div>
            <div className="dataset-source-row">
              {hasGeneratedSampleRows && (
                <span className="dataset-generated-chip">Generated sample data</span>
              )}
              {exercise?.sourceLabel && (
                <span className="dataset-source-chip">{exercise.sourceLabel}</span>
              )}
            </div>
          </div>

          {hasBlockingDraftState && (
            <p style={{ color: "#b00020", margin: "0 0 12px" }}>
              {Object.keys(validationErrors).length > 0
                ? "Draft has validation errors."
                : "Draft updates are not runnable yet."}
            </p>
          )}

          {appliedQuestion ? (
            <div
              className={`query-context-layout${isQuerySchemaVisible ? "" : " query-context-layout-collapsed"}`}
            >
              {isQuerySchemaVisible ? (
                <QuerySchemaReference
                  question={appliedQuestion}
                  onCollapse={() => setIsQuerySchemaVisible(false)}
                />
              ) : (
                <div className="query-schema-restore">
                  <button
                    className="ghost-action"
                    onClick={() => setIsQuerySchemaVisible(true)}
                  >
                    Show schema reference
                  </button>
                </div>
              )}
              <SqlPlaygroundApp
                question={appliedQuestion}
                initialQuery={readOnlyImport ? "" : initialQuery}
                solutionQuery={readOnlyImport ? initialQuery : undefined}
                createRunner={createRunner}
                title="Workbench"
                runDisabled={hasBlockingDraftState}
              />
            </div>
          ) : (
            <div className="empty-workbench">
              <p>Import a prompt or choose a seeded exercise to initialize DuckDB.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function WarningList({ warnings }: { warnings: ParseWarning[] }) {
  return (
    <section
      aria-label="Parser warnings"
      className="warning-panel"
    >
      <strong>Parser warnings</strong>
      <ul style={{ margin: "8px 0 0 20px" }}>
        {warnings.map((warning, index) => (
          <li key={`${warning.kind}-${index}`}>{warning.message}</li>
        ))}
      </ul>
    </section>
  );
}

function PromptCard({
  exercise,
  prompt,
}: {
  exercise: ExerciseDefinition;
  prompt: string;
}) {
  return (
    <section className="prompt-card">
      <div className="prompt-card-header">
        <div>
          <div className="prompt-kicker">{exercise.company}</div>
          <h3>{exercise.title}</h3>
        </div>
        <div className="prompt-pill-row">
          {exercise.themes.map((theme) => (
            <span key={theme} className="prompt-pill">
              {theme}
            </span>
          ))}
        </div>
      </div>
      <p className="prompt-summary">{exercise.summary}</p>
      <div className="prompt-text-block">
        <pre>{prompt}</pre>
      </div>
    </section>
  );
}

function PracticePromptCard({ exercise }: { exercise: ExerciseDefinition }) {
  return (
    <section className="practice-brief-card">
      <div className="prompt-kicker">{exercise.company}</div>
      <h3>{exercise.title}</h3>
      <p className="prompt-summary">{exercise.summary}</p>
    </section>
  );
}

function QuerySchemaReference({
  question,
  onCollapse,
}: {
  question: QuestionModel;
  onCollapse: () => void;
}) {
  const joinHintsByTable = inferJoinHintsByTable(question);

  return (
    <aside className="query-schema-rail" aria-label="Schema reference">
      <div className="query-schema-rail-header">
        <div>
          <div className="dataset-status-kicker">While you query</div>
          <h3>Schema reference</h3>
        </div>
        <button className="ghost-action" onClick={onCollapse}>
          Hide schema reference
        </button>
      </div>
      <div className="query-schema-table-list">
        {question.tables.map((table, tableIndex) => (
          <article key={`${table.name}-${tableIndex}`} className="query-schema-table-card">
            <div className="table-heading-row">
              <strong>{table.name}</strong>
              {table.sampleRowsMode === "generated" && (
                <span className="generated-row-chip">Generated sample data</span>
              )}
            </div>
            {joinHintsByTable[tableIndex]?.length > 0 && (
              <div className="table-join-hint">
                joins on: {joinHintsByTable[tableIndex].join(", ")}
              </div>
            )}
            <ul className="query-schema-column-list">
              {table.columns.map((column) => (
                <li key={`${table.name}-${column.name}`}>
                  <span>{column.name}</span>
                  <span className="query-schema-column-type">{column.type}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </aside>
  );
}

interface SqlPlaygroundAppProps {
  question: QuestionModel;
  initialQuery: string;
  solutionQuery?: string;
  createRunner: () => Promise<Runner>;
  title?: string;
  runDisabled?: boolean;
}

export function SqlPlaygroundApp({
  question,
  initialQuery,
  solutionQuery,
  createRunner,
  title = "Phase 2: editable DoorDash query",
  runDisabled = false,
}: SqlPlaygroundAppProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [runner, setRunner] = useState<Runner | null>(null);
  const loadedTableNamesRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    let activeRunner: Runner | null = null;

    (async () => {
      try {
        setStatus("loading");
        setBootError(null);
        const nextRunner = await createRunner();
        activeRunner = nextRunner;
        if (cancelled) return;
        setRunner(nextRunner);
        loadedTableNamesRef.current = [];
      } catch (e) {
        if (cancelled) return;
        setBootError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      void activeRunner?.close();
    };
  }, [createRunner]);

  useEffect(() => {
    if (!runner) return;
    let cancelled = false;

    (async () => {
      try {
        setStatus("loading");
        setResult(null);
        setAnswerFeedback(null);
        const schemaSql = [
          generateDropTablesSql(loadedTableNamesRef.current),
          generateSchemaSql(question),
        ]
          .filter((sqlChunk) => sqlChunk.length > 0)
          .join("\n");
        await runner.loadSchema(schemaSql);
        if (cancelled) return;
        loadedTableNamesRef.current = question.tables.map((table) => table.name.trim());
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setBootError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialQuery, question, runner]);

  async function handleRun() {
    if (!runner) return;
    const next = await runner.runQuery(query);
    setAnswerFeedback(null);
    setResult(next);
  }

  async function handleCheckAnswer() {
    if (!runner || !solutionQuery) return;
    const actual = await runner.runQuery(query);
    setResult(actual);

    if ("error" in actual) {
      setAnswerFeedback("Fix your query before checking it.");
      return;
    }

    const expected = await runner.runQuery(solutionQuery);
    if ("error" in expected) {
      setAnswerFeedback("Solution query could not be verified.");
      return;
    }

    setAnswerFeedback(
      compareQueryResults(expected, actual)
        ? "Answer matches the expected result."
        : "Answer does not match the expected result yet.",
    );
  }

  return (
    <div className="workbench-panel">
      <div className="workbench-panel-header">
        <p>{title}</p>
      </div>
      <QueryEditor value={query} onChange={setQuery} onRun={() => void handleRun()} />
      <button
        className="run-button"
        disabled={status !== "ready" || runDisabled}
        onClick={() => void handleRun()}
      >
        Run
      </button>
      {solutionQuery && (
        <div className="practice-action-row">
          <button
            className="ghost-action"
            disabled={status !== "ready" || runDisabled}
            onClick={() => setQuery(solutionQuery)}
          >
            Reveal solution
          </button>
          <button
            className="ghost-action"
            disabled={status !== "ready" || runDisabled}
            onClick={() => void handleCheckAnswer()}
          >
            Check my answer
          </button>
        </div>
      )}
      {answerFeedback && <p className="answer-feedback">{answerFeedback}</p>}
      {status === "loading" && <p>Booting DuckDB…</p>}
      {status === "error" && (
        <pre style={{ color: "#b00020", whiteSpace: "pre-wrap" }}>{bootError}</pre>
      )}
      {status === "ready" && result && <ResultView result={result} />}
    </div>
  );
}

interface ImportPanelProps {
  value: string;
  onChange: (value: string) => void;
  onImport: () => void;
}

function ImportPanel({ value, onChange, onImport }: ImportPanelProps) {
  return (
    <section className="import-card">
      <div className="prompt-kicker">Custom Import</div>
      <h3>Paste a prompt</h3>
      <p className="prompt-summary">
        Drop in a DataLemur-style schema block, inspect the parsed tables, then query it.
      </p>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }} htmlFor="import-prompt">
        Import prompt
      </label>
      <textarea
        id="import-prompt"
        aria-label="Import prompt"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={10}
        style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
      />
      <div style={{ marginTop: 8 }}>
        <button className="run-button" onClick={onImport}>Import</button>
      </div>
    </section>
  );
}

interface QuestionPreviewProps {
  question: QuestionModel;
  editable?: boolean;
  validationErrors?: ValidationErrorMap;
  onTableNameChange?: (tableIndex: number, value: string) => void;
  onColumnNameChange?: (
    tableIndex: number,
    columnIndex: number,
    value: string,
  ) => void;
  onColumnTypeChange?: (
    tableIndex: number,
    columnIndex: number,
    value: ColumnType,
  ) => void;
}

function QuestionPreview({
  question,
  editable = false,
  validationErrors = {},
  onTableNameChange,
  onColumnNameChange,
  onColumnTypeChange,
}: QuestionPreviewProps) {
  const joinHintsByTable = inferJoinHintsByTable(question);

  return (
    <section className="evidence-panel">
      <h2>Imported tables</h2>
      {question.tables.map((table, tableIndex) => (
        <article key={tableIndex} style={{ marginBottom: 16 }}>
          <div className="table-heading-row">
            <label style={{ display: "block", fontSize: 12, color: "#666", flex: 1 }}>
              Table name
            </label>
            {table.sampleRowsMode === "generated" && (
              <span className="generated-row-chip">Generated sample data</span>
            )}
          </div>
          <div style={{ marginBottom: 8 }}>
            {editable ? (
              <input
                aria-label={`Table ${tableIndex + 1} name`}
                value={table.name}
                onChange={(event) => onTableNameChange?.(tableIndex, event.target.value)}
              />
            ) : (
              <div>{table.name}</div>
            )}
            {joinHintsByTable[tableIndex]?.length > 0 && (
              <div className="table-join-hint">
                joins on: {joinHintsByTable[tableIndex].join(", ")}
              </div>
            )}
            {validationErrors[makeTableNameKey(tableIndex)] && (
              <div style={{ color: "#b00020", fontSize: 12 }}>
                {validationErrors[makeTableNameKey(tableIndex)]}
              </div>
            )}
          </div>
          <table style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {table.columns.map((column, columnIndex) => (
                  <th
                    key={columnIndex}
                    style={{ border: "1px solid #ccc", padding: "4px 8px", textAlign: "left" }}
                  >
                    {editable ? (
                      <>
                        <input
                          aria-label={`${table.name} column ${columnIndex + 1} name`}
                          value={column.name}
                          onChange={(event) =>
                            onColumnNameChange?.(tableIndex, columnIndex, event.target.value)
                          }
                        />
                        <div style={{ marginTop: 4 }}>
                          <select
                            aria-label={`${table.name} column ${column.name} type`}
                            value={column.type}
                            onChange={(event) =>
                              onColumnTypeChange?.(
                                tableIndex,
                                columnIndex,
                                event.target.value as ColumnType,
                              )
                            }
                          >
                            {COLUMN_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>{column.name}</div>
                        <div className="column-type-label">{column.type}</div>
                      </>
                    )}
                    {validationErrors[makeColumnNameKey(tableIndex, columnIndex)] && (
                      <div style={{ color: "#b00020", fontSize: 12 }}>
                        {validationErrors[makeColumnNameKey(tableIndex, columnIndex)]}
                      </div>
                    )}
                  </th>
                ))}
                <th style={{ border: "1px solid #ccc", padding: "4px 8px", textAlign: "left" }}>
                  Sample rows
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => {
                    const cellKey = makeCellKey(tableIndex, rowIndex, cellIndex);
                    const validationError = validationErrors[cellKey];

                    return (
                      <td
                        key={cellIndex}
                        style={{ border: "1px solid #ccc", padding: "4px 8px" }}
                      >
                        <span>{formatCell(cell)}</span>
                        {validationError && (
                          <div style={{ color: "#b00020", fontSize: 12 }}>
                            {validationError}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ border: "1px solid #ccc", padding: "4px 8px", color: "#6e6154" }}>
                    Row {rowIndex + 1}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </section>
  );
}

function evaluateDraftQuestion(draftQuestion: QuestionModel): {
  appliedQuestion: QuestionModel | null;
  validationErrors: ValidationErrorMap;
  pendingDraftKeys: PendingDraftMap;
} {
  const validationErrors: ValidationErrorMap = {};
  const pendingDraftKeys: PendingDraftMap = {};
  const duplicateTableNameCounts = countTrimmedNames(draftQuestion.tables.map((table) => table.name));

  draftQuestion.tables.forEach((table, tableIndex) => {
    if (table.name.trim() === "") {
      validationErrors[makeTableNameKey(tableIndex)] = "Table name is required";
    } else if ((duplicateTableNameCounts.get(table.name.trim()) ?? 0) > 1) {
      validationErrors[makeTableNameKey(tableIndex)] = "Table names must be unique";
    }

    const duplicateColumnNameCounts = countTrimmedNames(
      table.columns.map((column) => column.name),
    );

    table.columns.forEach((column, columnIndex) => {
      if (column.name.trim() === "") {
        validationErrors[makeColumnNameKey(tableIndex, columnIndex)] =
          "Column name is required";
      } else if ((duplicateColumnNameCounts.get(column.name.trim()) ?? 0) > 1) {
        validationErrors[makeColumnNameKey(tableIndex, columnIndex)] =
          "Column names must be unique";
      }
    });

    table.rows.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        const cellStatus = analyzeDraftCell(table.columns[cellIndex].type, cell);
        const cellKey = makeCellKey(tableIndex, rowIndex, cellIndex);
        if (cellStatus.kind === "error") {
          validationErrors[cellKey] = cellStatus.message;
        }
        if (cellStatus.kind === "pending") {
          pendingDraftKeys[cellKey] = true;
        }
      });
    });
  });

  if (
    Object.keys(validationErrors).length > 0 ||
    Object.keys(pendingDraftKeys).length > 0
  ) {
    return {
      appliedQuestion: null,
      validationErrors,
      pendingDraftKeys,
    };
  }

  return {
    appliedQuestion: {
      ...draftQuestion,
      tables: draftQuestion.tables.map((table) => ({
        ...table,
        name: table.name.trim(),
        columns: table.columns.map((column) => ({
          ...column,
          name: column.name.trim(),
        })),
        rows: table.rows.map((row, rowIndex) =>
          row.map((cell, cellIndex) => {
            const cellStatus = analyzeDraftCell(table.columns[cellIndex].type, cell);
            if (cellStatus.kind !== "valid") {
              throw new Error(
                `Draft cell unexpectedly not valid at ${table.name}:${rowIndex}:${cellIndex}`,
              );
            }
            return cellStatus.value;
          }),
        ),
      })),
    },
    validationErrors,
    pendingDraftKeys,
  };
}

function analyzeDraftCell(
  type: ColumnType,
  value: CellValue,
):
  | { kind: "valid"; value: CellValue }
  | { kind: "pending" }
  | { kind: "error"; message: string } {
  if (value === null) return { kind: "valid", value: null };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { kind: "error", message: "Invalid timestamp" }
      : { kind: "valid", value };
  }
  if (typeof value === "number" && (type === "integer" || type === "float")) {
    return Number.isNaN(value)
      ? {
          kind: "error",
          message: type === "integer" ? "Invalid integer" : "Invalid number",
        }
      : { kind: "valid", value };
  }
  if (typeof value === "boolean" && type === "boolean") {
    return { kind: "valid", value };
  }

  const textValue = String(value);
  const trimmed = textValue.trim();
  if (trimmed === "") return { kind: "pending" };
  if (trimmed === "-") return { kind: "valid", value: null };

  const validationMessage = validateEditedValue(type, textValue);
  if (validationMessage) {
    return { kind: "error", message: validationMessage };
  }

  return { kind: "valid", value: coerceEditedValue(type, textValue) };
}

function countTrimmedNames(names: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  names.forEach((name) => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  });
  return counts;
}

function coerceEditedValue(type: ColumnType, value: string): CellValue {
  const trimmed = value.trim();
  if (trimmed === "-") return null;
  if (type === "integer") return Number.parseInt(trimmed, 10);
  if (type === "float") return Number.parseFloat(trimmed);
  if (type === "boolean") return trimmed.toLowerCase() === "true";
  if (type === "timestamp") return parseTimestampText(trimmed);
  return value;
}

function validateEditedValue(type: ColumnType, value: string): string | null {
  if (type === "integer") {
    return /^-?\d+$/.test(value.trim()) ? null : "Invalid integer";
  }
  if (type === "float") {
    return Number.isNaN(Number.parseFloat(value.trim())) ? "Invalid number" : null;
  }
  if (type === "boolean") {
    return /^(true|false)$/i.test(value.trim()) ? null : "Invalid boolean";
  }
  if (type === "timestamp") {
    return isSupportedTimestampText(value.trim()) ? null : "Invalid timestamp";
  }
  return null;
}

function makeCellKey(tableIndex: number, rowIndex: number, columnIndex: number): string {
  return `cell:${tableIndex}:${rowIndex}:${columnIndex}`;
}

function makeTableNameKey(tableIndex: number): string {
  return `table:${tableIndex}:name`;
}

function makeColumnNameKey(tableIndex: number, columnIndex: number): string {
  return `column:${tableIndex}:${columnIndex}:name`;
}

function ResultView({ result }: { result: QueryResult }) {
  if ("error" in result) {
    return (
      <pre style={{ color: "#b00020", whiteSpace: "pre-wrap" }}>{result.error}</pre>
    );
  }
  return (
    <table style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {result.columns.map((c) => (
            <th
              key={c}
              style={{ border: "1px solid #ccc", padding: "4px 8px", textAlign: "left" }}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td
                key={j}
                style={{ border: "1px solid #ccc", padding: "4px 8px" }}
              >
                {formatCell(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "Invalid timestamp" : v.toISOString();
  }
  if (typeof v === "number" && Number.isNaN(v)) return "Invalid number";
  return String(v);
}
