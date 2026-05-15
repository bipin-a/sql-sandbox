import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CellValue,
  ColumnReference,
  ColumnType,
  ParseWarning,
  QuestionModel,
} from "../lib/questionModel";
import { generateDropTablesSql, generateSchemaSql } from "../lib/sqlGenerator";
import { createRunner } from "../lib/duckdbRunner";
import { compareQueryResults } from "../lib/duckdbRunner";
import type { QueryResult, Runner } from "../lib/duckdbRunner";
import { ensureQuestionSampleRows } from "../lib/mockDataGenerator";
import {
  formatReferenceTarget,
  inferExplicitReferenceLabelsByTable,
  inferJoinHintsByTable,
} from "../lib/relationships";
import { parseSchemaText } from "../lib/schemaParser";
import { isSupportedTimestampText, parseTimestampText } from "../lib/timestamps";
import {
  defaultExercises,
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

interface WorkspaceSessionSnapshot {
  importText: string;
  draftQuestion: QuestionModel | null;
  appliedQuestion: QuestionModel | null;
  workspaceMode: WorkspaceMode;
  isSchemaEditing: boolean;
  isQuerySchemaVisible: boolean;
  validationErrors: ValidationErrorMap;
  pendingDraftKeys: PendingDraftMap;
}

export function SqlPracticeStudio({
  exercises,
  initialExerciseId,
  createRunner,
}: SqlPracticeStudioProps) {
  const practiceExercises = exercises.filter(
    (exercise) => exercise.mode !== "custom" && exercise.mode !== "new-schema",
  );
  const customImportExercise = exercises.find((exercise) => exercise.mode === "custom") ?? null;
  const newSchemaExercise: ExerciseDefinition = {
    id: "new-schema",
    title: "New Schema",
    company: "From Scratch",
    difficulty: "Authoring",
    themes: ["tables", "columns", "relationships"],
    summary: "Start from a blank schema and build the dataset you want to query.",
    prompt: "",
    initialQuestion: null,
    initialQuery: "",
    mode: "new-schema",
    sourceLabel: "Structured authoring",
  };

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(initialExerciseId ?? null);
  const [sessionVersionBySource, setSessionVersionBySource] = useState<Record<string, number>>({});
  const [savedSourceSessions, setSavedSourceSessions] = useState<
    Record<string, WorkspaceSessionSnapshot | undefined>
  >({});
  const [isResetConfirming, setIsResetConfirming] = useState(false);

  const selectedExercise =
    selectedExerciseId === null
      ? null
      : selectedExerciseId === newSchemaExercise.id
      ? newSchemaExercise
      : exercises.find((exercise) => exercise.id === selectedExerciseId) ??
        practiceExercises[0] ??
        customImportExercise ??
        newSchemaExercise;

  function chooseSource(nextExerciseId: string) {
    setSelectedExerciseId(nextExerciseId);
    setIsResetConfirming(false);
  }

  function resetCurrentSource() {
    if (!selectedExerciseId) return;

    setSavedSourceSessions((currentSessions) => ({
      ...currentSessions,
      [selectedExerciseId]: undefined,
    }));
    setSessionVersionBySource((currentVersions) => ({
      ...currentVersions,
      [selectedExerciseId]: (currentVersions[selectedExerciseId] ?? 0) + 1,
    }));
    setIsResetConfirming(false);
  }

  function handleGoHome() {
    setSelectedExerciseId(null);
    setIsResetConfirming(false);
  }

  const handleSessionChange = useCallback(
    (nextSession: WorkspaceSessionSnapshot) => {
      if (!selectedExerciseId) return;
      setSavedSourceSessions((currentSessions) => ({
        ...currentSessions,
        [selectedExerciseId]: nextSession,
      }));
    },
    [selectedExerciseId],
  );

  if (!selectedExercise) {
    return (
      <div className="studio-shell">
        <main className="studio-main">
          <HomeChooser
            practiceExercises={practiceExercises}
            customImportExercise={customImportExercise}
            newSchemaExercise={newSchemaExercise}
            onChooseSource={chooseSource}
          />
        </main>
      </div>
    );
  }

  const isPracticeSource =
    selectedExercise.mode !== "custom" && selectedExercise.mode !== "new-schema";
  const showInlineResetConfirm = isResetConfirming && !isPracticeSource;
  const currentSessionVersion = sessionVersionBySource[selectedExercise.id] ?? 0;

  return (
    <div className="studio-shell">
      <main className="studio-main">
        <div className="studio-brandbar">
          <div>
            <h1>SQL Playground</h1>
          </div>
          <p>Practice SQL fast, or bring your own schema and start querying.</p>
        </div>
        <header className="studio-toolbar">
          <div>
            <div className="studio-title-row">
              <h2>{selectedExercise.title}</h2>
              {isPracticeSource && (
                <span className="studio-status-chip">{selectedExercise.difficulty}</span>
              )}
            </div>
            <p className="studio-source-summary">
              {isPracticeSource ? selectedExercise.summary : selectedExercise.title}
            </p>
          </div>
          <div className="studio-toolbar-actions">
            <button className="ghost-action" onClick={handleGoHome}>
              Home
            </button>
            {showInlineResetConfirm ? (
              <div className="inline-confirm-row">
                <span className="inline-confirm-copy">Reset this work?</span>
                <button className="ghost-action" onClick={resetCurrentSource}>
                  Yes, reset
                </button>
                <button className="ghost-action" onClick={() => setIsResetConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="ghost-action"
                onClick={() => {
                  if (isPracticeSource) {
                    resetCurrentSource();
                    return;
                  }
                  setIsResetConfirming(true);
                }}
              >
                Reset
              </button>
            )}
          </div>
        </header>

        <SqlPlaygroundImportApp
          key={`${selectedExercise.id}:${currentSessionVersion}`}
          initialImportText={selectedExercise.prompt}
          initialQuestion={selectedExercise.initialQuestion ?? null}
          initialQuery={selectedExercise.initialQuery}
          createRunner={createRunner}
          exercise={selectedExercise}
          readOnlyImport={selectedExercise.mode !== "custom"}
          savedSession={savedSourceSessions[selectedExercise.id]}
          onSessionChange={handleSessionChange}
        />
      </main>
    </div>
  );
}

function HomeChooser({
  practiceExercises,
  customImportExercise,
  newSchemaExercise,
  onChooseSource,
}: {
  practiceExercises: ExerciseDefinition[];
  customImportExercise: ExerciseDefinition | null;
  newSchemaExercise: ExerciseDefinition;
  onChooseSource: (exerciseId: string) => void;
}) {
  const defaultPracticeExercise = practiceExercises[0] ?? null;
  const [activeIntent, setActiveIntent] = useState<"practice" | null>(null);

  return (
    <section className="home-chooser" aria-label="Home chooser">
      <div className="home-chooser-header">
        <h1>SQL Playground</h1>
        <p>
          Choose one path. Practice on a ready-made dataset, or bring tables you want to
          query.
        </p>
      </div>
      <div className="home-choice-grid">
        <button
          className="home-choice-card"
          onClick={() => setActiveIntent("practice")}
          disabled={!defaultPracticeExercise}
        >
          <span className="home-choice-kicker">I need data</span>
          <span className="home-choice-title">Practice with sample data</span>
          <span className="home-choice-copy">
            Pick a curated SQL prompt and work against a ready-to-query dataset.
          </span>
          {defaultPracticeExercise && (
            <span className="home-choice-footnote">
              {practiceExercises.length} sample prompts available
            </span>
          )}
        </button>

        <section className="home-choice-card home-choice-card-panel" aria-label="Use my own tables">
          <span className="home-choice-kicker">I have tables</span>
          <span className="home-choice-title">Use my own tables</span>
          <span className="home-choice-copy">
            Import a schema from a prompt, or create tables from scratch.
          </span>
          <div className="home-choice-actions">
            {customImportExercise && (
              <button
                className="home-choice-action"
                onClick={() => onChooseSource(customImportExercise.id)}
              >
                Import prompt/schema
              </button>
            )}
            <button
              className="home-choice-action"
              onClick={() => onChooseSource(newSchemaExercise.id)}
            >
              Create schema
            </button>
          </div>
        </section>
      </div>
      {activeIntent === "practice" && (
        <section className="home-secondary-panel" aria-label="Choose sample prompt">
          <div>
            <h2>Choose a sample prompt</h2>
            <p>Start with one curated dataset. You can return Home whenever you want.</p>
          </div>
          <div className="home-practice-list">
            {practiceExercises.map((exercise) => (
              <button
                key={exercise.id}
                className="home-practice-row"
                onClick={() => onChooseSource(exercise.id)}
                aria-label={`Open ${exercise.title}`}
              >
                <span>
                  <strong>{exercise.title}</strong>
                  <span>{exercise.summary}</span>
                </span>
                <span className="home-practice-meta">{exercise.difficulty}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
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
  savedSession?: WorkspaceSessionSnapshot;
  onSessionChange?: (session: WorkspaceSessionSnapshot) => void;
}

export function SqlPlaygroundImportApp({
  initialImportText,
  initialQuery,
  createRunner,
  initialQuestion = null,
  parseImportText = parseSchemaText,
  exercise,
  readOnlyImport = false,
  savedSession,
  onSessionChange,
}: SqlPlaygroundImportAppProps) {
  const isNewSchema = exercise?.mode === "new-schema";
  const isSeededPractice = !!exercise && exercise.mode !== "custom" && exercise.mode !== "new-schema";
  const requiresExplicitApply = isNewSchema;
  const initialDraftQuestion =
    initialQuestion ?? (isNewSchema ? { tables: [] satisfies QuestionModel["tables"] } : null);
  const initialWorkspaceMode: WorkspaceMode =
    exercise?.mode === "custom" || isNewSchema || !readOnlyImport
      ? "setup"
      : "query";
  const [importText, setImportText] = useState(savedSession?.importText ?? initialImportText);
  const [draftQuestion, setDraftQuestion] = useState<QuestionModel | null>(
    savedSession?.draftQuestion ?? initialDraftQuestion,
  );
  const [appliedQuestion, setAppliedQuestion] = useState<QuestionModel | null>(
    savedSession?.appliedQuestion ?? initialQuestion,
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    savedSession?.workspaceMode ?? initialWorkspaceMode,
  );
  const [isSchemaEditing, setIsSchemaEditing] = useState(savedSession?.isSchemaEditing ?? false);
  const [isQuerySchemaVisible, setIsQuerySchemaVisible] = useState(
    savedSession?.isQuerySchemaVisible ?? true,
  );
  const [validationErrors, setValidationErrors] = useState<ValidationErrorMap>(
    savedSession?.validationErrors ?? {},
  );
  const [pendingDraftKeys, setPendingDraftKeys] = useState<PendingDraftMap>(
    savedSession?.pendingDraftKeys ?? {},
  );

  useEffect(() => {
    onSessionChange?.({
      importText,
      draftQuestion,
      appliedQuestion,
      workspaceMode,
      isSchemaEditing,
      isQuerySchemaVisible,
      validationErrors,
      pendingDraftKeys,
    });
  }, [
    appliedQuestion,
    draftQuestion,
    importText,
    isQuerySchemaVisible,
    isSchemaEditing,
    onSessionChange,
    pendingDraftKeys,
    validationErrors,
    workspaceMode,
  ]);

  function syncDraft(update: (current: QuestionModel) => QuestionModel) {
    setDraftQuestion((currentDraft) => {
      if (!currentDraft) return currentDraft;
      const nextDraft = update(currentDraft);
      const evaluation = evaluateDraftQuestion(nextDraft);
      setValidationErrors(evaluation.validationErrors);
      setPendingDraftKeys(evaluation.pendingDraftKeys);
      if (evaluation.appliedQuestion && !requiresExplicitApply) {
        setAppliedQuestion(evaluation.appliedQuestion);
      }
      return nextDraft;
    });
  }

  function handleAddTable() {
    syncDraft((current) => ({
      ...current,
      tables: [
        ...current.tables,
        {
          name: `table_${current.tables.length + 1}`,
          columns: [{ name: "column_1", type: "integer" }],
          rows: [],
        },
      ],
    }));
  }

  function handleRemoveTable(tableIndex: number) {
    syncDraft((current) => {
      const removedTableName = current.tables[tableIndex]?.name;

      return {
        ...current,
        tables: current.tables
          .filter((_, currentTableIndex) => currentTableIndex !== tableIndex)
          .map((table) => ({
            ...table,
            columns: table.columns.map((column) =>
              column.references?.table === removedTableName
                ? { ...column, references: undefined }
                : column,
            ),
          })),
      };
    });
  }

  function handleAddColumn(tableIndex: number) {
    syncDraft((current) => ({
      ...current,
      tables: current.tables.map((table, currentTableIndex) =>
        currentTableIndex === tableIndex
          ? {
              ...table,
              columns: [
                ...table.columns,
                {
                  name: `column_${table.columns.length + 1}`,
                  type: "string",
                  references: undefined,
                },
              ],
            }
          : table,
      ),
    }));
  }

  function handleRemoveColumn(tableIndex: number, columnIndex: number) {
    syncDraft((current) => {
      const currentTable = current.tables[tableIndex];
      const removedColumnName = currentTable?.columns[columnIndex]?.name;

      return {
        ...current,
        tables: current.tables.map((table, currentTableIndex) => {
          const nextColumns =
            currentTableIndex === tableIndex
              ? table.columns.filter((_, currentColumnIndex) => currentColumnIndex !== columnIndex)
              : table.columns;

          return {
            ...table,
            columns: nextColumns.map((column) =>
              column.references?.table === currentTable?.name &&
              column.references.column === removedColumnName
                ? { ...column, references: undefined }
                : column,
            ),
          };
        }),
      };
    });
  }

  function handleApplySchema() {
    if (!draftQuestion) return;
    const evaluation = evaluateDraftQuestion(draftQuestion);
    setValidationErrors(evaluation.validationErrors);
    setPendingDraftKeys(evaluation.pendingDraftKeys);
    if (!evaluation.appliedQuestion) return;
    setAppliedQuestion(ensureQuestionSampleRows(evaluation.appliedQuestion));
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
    syncDraft((current) => {
      const previousName = current.tables[tableIndex]?.name;

      return {
        ...current,
        tables: current.tables.map((table, currentTableIndex) => ({
          ...(currentTableIndex === tableIndex
            ? {
                ...table,
                name: nextValue,
              }
            : table),
          columns: table.columns.map((column) =>
            column.references?.table === previousName
              ? {
                  ...column,
                  references: {
                    ...column.references,
                    table: nextValue,
                  },
                }
              : column,
          ),
        })),
      };
    });
  }

  function handleColumnNameChange(
    tableIndex: number,
    columnIndex: number,
    nextValue: string,
  ) {
    syncDraft((current) => {
      const sourceTable = current.tables[tableIndex];
      const previousName = sourceTable?.columns[columnIndex]?.name;

      return {
        ...current,
        tables: current.tables.map((table, currentTableIndex) => ({
          ...table,
          columns: table.columns.map((column, currentColumnIndex) => {
            if (currentTableIndex === tableIndex && currentColumnIndex === columnIndex) {
              return {
                ...column,
                name: nextValue,
              };
            }

            if (
              column.references?.table === sourceTable?.name &&
              column.references.column === previousName
            ) {
              return {
                ...column,
                references: {
                  ...column.references,
                  column: nextValue,
                },
              };
            }

            return column;
          }),
        })),
      };
    });
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

  function handleColumnReferenceChange(
    tableIndex: number,
    columnIndex: number,
    nextReference: ColumnReference | undefined,
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
                  references: nextReference,
                }
              : column,
          ),
        };
      }),
    }));
  }

  const hasBlockingDraftState =
    Object.keys(validationErrors).length > 0 || Object.keys(pendingDraftKeys).length > 0;
  const canApplyAuthoringSchema =
    requiresExplicitApply &&
    !!draftQuestion &&
    draftQuestion.tables.length > 0 &&
    !hasBlockingDraftState;
  const hasGeneratedSampleRows =
    appliedQuestion?.tables.some((table) => table.sampleRowsMode === "generated") ?? false;
  const showWorkspaceModeSwitch = !isSeededPractice;
  const showDatasetStatusCard =
    !isSeededPractice || hasGeneratedSampleRows || hasBlockingDraftState || !appliedQuestion;
  const blockingIssueCount =
    Object.keys(validationErrors).length + Object.keys(pendingDraftKeys).length;
  const applySchemaHint =
    requiresExplicitApply && !canApplyAuthoringSchema && draftQuestion
      ? draftQuestion.tables.length === 0
        ? "Add a table to begin."
        : blockingIssueCount > 0
          ? `${blockingIssueCount} issue${blockingIssueCount === 1 ? "" : "s"} to fix`
          : null
      : null;

  return (
    <>
      {showWorkspaceModeSwitch && (
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
      )}

      <div
        className={`workspace-layout workspace-layout-${workspaceMode}`}
        data-workspace-mode={workspaceMode}
      >
        <section
          className="workspace-brief-column"
          hidden={workspaceMode !== "setup"}
          aria-hidden={workspaceMode !== "setup"}
        >
          {exercise?.mode === "new-schema" ? (
            <NewSchemaPlaceholderCard />
          ) : readOnlyImport && exercise ? (
            <PromptCard exercise={exercise} />
          ) : (
            <ImportPanel value={importText} onChange={setImportText} onImport={handleImport} />
          )}

          {draftQuestion?.warnings && draftQuestion.warnings.length > 0 && (
            <WarningList warnings={draftQuestion.warnings} />
          )}

          {!readOnlyImport && draftQuestion && !isNewSchema && (
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
            <>
              <QuestionPreview
                heading={isNewSchema ? "Your schema" : "Tables"}
                question={draftQuestion}
                editable={isNewSchema ? true : readOnlyImport ? false : isSchemaEditing}
                canManageStructure={isNewSchema}
                validationErrors={validationErrors}
                onTableNameChange={handleTableNameChange}
                onColumnNameChange={handleColumnNameChange}
                onColumnTypeChange={handleColumnTypeChange}
                onAddTable={handleAddTable}
                onRemoveTable={handleRemoveTable}
                onAddColumn={handleAddColumn}
                onRemoveColumn={handleRemoveColumn}
                onColumnReferenceChange={handleColumnReferenceChange}
              />
              {isNewSchema && (
                <div className="schema-edit-row">
                  <button
                    className="run-button"
                    disabled={!canApplyAuthoringSchema}
                    onClick={handleApplySchema}
                  >
                    Apply schema
                  </button>
                  {applySchemaHint && <span className="hint-text">{applySchemaHint}</span>}
                </div>
              )}
            </>
          )}
        </section>

        <section
          className="workspace-query-column"
          hidden={workspaceMode !== "query"}
          aria-hidden={workspaceMode !== "query"}
        >
          {exercise && exercise.mode !== "new-schema" && <PracticePromptCard exercise={exercise} />}

          {showDatasetStatusCard && (
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
          )}

          {hasBlockingDraftState && (
            <p className="error-text" style={{ margin: "0 0 12px" }}>
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
                    Show
                  </button>
                </div>
              )}
              <SqlPlaygroundApp
                question={appliedQuestion}
                initialQuery={readOnlyImport ? "" : initialQuery}
                solutionQuery={readOnlyImport ? initialQuery : undefined}
                createRunner={createRunner}
                title="SQL"
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

function NewSchemaPlaceholderCard() {
  return (
    <section className="prompt-card">
      <div className="prompt-card-header">
        <div>
          <div className="prompt-kicker">Use your own schema</div>
          <h3>Start from a blank schema</h3>
        </div>
      </div>
      <p className="prompt-summary">
        Add tables and columns here, then apply the schema to generate sample rows and start querying.
      </p>
    </section>
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
  prompt?: string;
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
      {prompt ? (
        <div className="prompt-text-block">
          <pre>{prompt}</pre>
        </div>
      ) : null}
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
  const explicitReferenceLabelsByTable = inferExplicitReferenceLabelsByTable(question);

  return (
    <aside className="query-schema-rail" aria-label="Schema reference">
      <div className="query-schema-rail-header">
        <div>
          <div className="dataset-status-kicker">While you query</div>
          <h3>Schema reference</h3>
        </div>
        <button className="ghost-action" onClick={onCollapse}>
          Hide
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
            {explicitReferenceLabelsByTable[tableIndex]?.length > 0 && (
              <ul className="table-reference-list" aria-label={`${table.name} references`}>
                {explicitReferenceLabelsByTable[tableIndex].map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            )}
            <ul className="query-schema-column-list">
              {table.columns.map((column) => (
                <li key={`${table.name}-${column.name}`}>
                  <div className="query-schema-column-copy">
                    <span>{column.name}</span>
                    {column.references && (
                      <span className="query-schema-column-reference">
                        references {formatReferenceTarget(column.references)}
                      </span>
                    )}
                  </div>
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
  title = "SQL",
  runDisabled = false,
}: SqlPlaygroundAppProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [runner, setRunner] = useState<Runner | null>(null);
  const [isRevealConfirming, setIsRevealConfirming] = useState(false);
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

  const hasUnsavedQuery = query.trim().length > 0 && query !== solutionQuery;

  async function handleRun() {
    if (!runner) return;
    const next = await runner.runQuery(query);
    setAnswerFeedback(null);
    setIsRevealConfirming(false);
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

  function handleRevealSolution() {
    if (!solutionQuery) return;
    if (hasUnsavedQuery) {
      setIsRevealConfirming(true);
      return;
    }

    setIsRevealConfirming(false);
    setQuery(solutionQuery);
  }

  function confirmRevealSolution() {
    if (!solutionQuery) return;
    setQuery(solutionQuery);
    setIsRevealConfirming(false);
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
          {isRevealConfirming ? (
            <div className="inline-confirm-row">
              <span className="inline-confirm-copy">Replace your current query?</span>
              <button
                className="ghost-action"
                disabled={status !== "ready" || runDisabled}
                onClick={confirmRevealSolution}
              >
                Yes, reveal
              </button>
              <button
                className="ghost-action"
                disabled={status !== "ready" || runDisabled}
                onClick={() => setIsRevealConfirming(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="ghost-action"
              disabled={status !== "ready" || runDisabled}
              onClick={handleRevealSolution}
            >
              Reveal solution
            </button>
          )}
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
      {status === "error" && <pre className="error-text error-block">{bootError}</pre>}
      {status === "ready" && result && <ResultView result={result} />}
    </div>
  );
}

interface ImportPanelProps {
  value: string;
  onChange: (value: string) => void;
  onImport: () => void;
}

const EXAMPLE_IMPORT_PROMPT = [
  "users Table:",
  "Column Name\tType",
  "user_id\tinteger",
  "email\tstring",
  "signup_date\ttimestamp",
  "",
  "users Example Input:",
  "user_id\temail\tsignup_date",
  "1\talice@example.com\t01/15/2026 09:00:00",
  "2\tbob@example.com\t02/03/2026 14:30:00",
  "",
  "orders Table:",
  "Column Name\tType",
  "order_id\tinteger",
  "user_id\tinteger",
  "amount\tfloat",
  "created_at\ttimestamp",
  "",
  "orders Example Input:",
  "order_id\tuser_id\tamount\tcreated_at",
  "1001\t1\t29.99\t03/01/2026 10:15:00",
  "1002\t2\t49.50\t03/02/2026 11:45:00",
  "1003\t1\t19.95\t03/05/2026 16:20:00",
].join("\n");

const LLM_PROMPT_TEMPLATE = `Generate a schema for [describe your domain, e.g. "a blog with posts, comments, and users"] in this exact format. Use tab characters between column name and type. Supported types: integer, string, float, boolean, timestamp. Timestamps use MM/DD/YYYY HH:MM:SS. Use "-" for nulls. Return only the schema, no prose or markdown fences.

<tablename> Table:
Column Name\tType
<col>\t<type>
...

<tablename> Example Input:
<col>\t<col>\t...
<val>\t<val>\t...
...

Include 2-5 tables with foreign-key relationships and 3-5 example rows per table.`;

function ImportPanel({ value, onChange, onImport }: ImportPanelProps) {
  return (
    <section className="import-card">
      <div className="prompt-kicker">Custom Import</div>
      <h3>Paste your schema</h3>
      <p className="prompt-summary">
        Paste a DataLemur-style schema block (<code>tablename Table:</code> followed by tab-separated columns, optionally with an <code>Example Input:</code> block), inspect the parsed tables, then query it.
      </p>
      <details className="import-help">
        <summary>How to use this</summary>
        <div className="import-help-body">
          <p><strong>Format:</strong> Each table starts with a line ending in <code>Table:</code>, followed by columns as <code>name&lt;TAB&gt;type</code>. Optionally add an <code>Example Input:</code> block with a header row and data rows. Pipes (<code>|</code>) or two-or-more spaces also work as separators.</p>
          <p><strong>Supported types:</strong> <code>integer</code>, <code>string</code>, <code>float</code>, <code>boolean</code>, <code>timestamp</code> (<code>MM/DD/YYYY HH:MM:SS</code>). Use <code>-</code> for nulls.</p>
          <p><strong>Sample schema:</strong></p>
          <pre className="import-help-pre">{EXAMPLE_IMPORT_PROMPT}</pre>
          <p><strong>Prompt template for an LLM:</strong> Paste this into ChatGPT/Claude and replace the bracketed bit.</p>
          <pre className="import-help-pre">{LLM_PROMPT_TEMPLATE}</pre>
        </div>
      </details>
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
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button className="run-button" onClick={onImport}>Import</button>
        <button
          className="ghost-action"
          type="button"
          onClick={() => onChange(EXAMPLE_IMPORT_PROMPT)}
        >
          Load example
        </button>
      </div>
    </section>
  );
}

interface QuestionPreviewProps {
  heading?: string;
  question: QuestionModel;
  editable?: boolean;
  canManageStructure?: boolean;
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
  onAddTable?: () => void;
  onRemoveTable?: (tableIndex: number) => void;
  onAddColumn?: (tableIndex: number) => void;
  onRemoveColumn?: (tableIndex: number, columnIndex: number) => void;
  onColumnReferenceChange?: (
    tableIndex: number,
    columnIndex: number,
    value: ColumnReference | undefined,
  ) => void;
}

function QuestionPreview({
  heading = "Tables",
  question,
  editable = false,
  canManageStructure = false,
  validationErrors = {},
  onTableNameChange,
  onColumnNameChange,
  onColumnTypeChange,
  onAddTable,
  onRemoveTable,
  onAddColumn,
  onRemoveColumn,
  onColumnReferenceChange,
}: QuestionPreviewProps) {
  const joinHintsByTable = inferJoinHintsByTable(question);
  const explicitReferenceLabelsByTable = inferExplicitReferenceLabelsByTable(question);

  return (
    <section className="evidence-panel">
      <h2>{heading}</h2>
      {canManageStructure && (
        <div className="schema-edit-row">
          <button className="ghost-action" onClick={onAddTable}>
            Add table
          </button>
        </div>
      )}
      {canManageStructure && question.tables.length === 0 && (
        <p className="prompt-summary">No tables yet. Add one to start shaping the schema.</p>
      )}
      {question.tables.map((table, tableIndex) => (
        <article key={tableIndex} style={{ marginBottom: 16 }}>
          <div className="table-heading-row">
            <label style={{ display: "block", fontSize: 12, color: "#666", flex: 1 }}>
              Table name
            </label>
            {canManageStructure && (
              <button
                className="ghost-action"
                type="button"
                onClick={() => onRemoveTable?.(tableIndex)}
              >
                Remove table
              </button>
            )}
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
            {explicitReferenceLabelsByTable[tableIndex]?.length > 0 && (
              <ul className="table-reference-list" aria-label={`${table.name} references`}>
                {explicitReferenceLabelsByTable[tableIndex].map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
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
                        {canManageStructure && (
                          <div style={{ marginTop: 4 }}>
                            <select
                              aria-label={`${table.name} column ${columnIndex + 1} reference`}
                              value={
                                column.references
                                  ? JSON.stringify([
                                      column.references.table,
                                      column.references.column,
                                    ])
                                  : ""
                              }
                              onChange={(event) =>
                                onColumnReferenceChange?.(
                                  tableIndex,
                                  columnIndex,
                                  event.target.value
                                    ? (() => {
                                        const [referenceTable, referenceColumn] = JSON.parse(
                                          event.target.value,
                                        ) as [string, string];
                                        return {
                                          table: referenceTable,
                                          column: referenceColumn,
                                        };
                                      })()
                                    : undefined,
                                )
                              }
                            >
                              <option value="">No reference</option>
                              {listReferenceTargets(question, tableIndex, columnIndex).map((target) => (
                                <option key={target.value} value={target.value}>
                                  {target.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {canManageStructure && (
                          <div style={{ marginTop: 6 }}>
                            <button
                              className="ghost-action"
                              type="button"
                              onClick={() => onRemoveColumn?.(tableIndex, columnIndex)}
                            >
                              Remove column
                            </button>
                          </div>
                        )}
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
                    {validationErrors[makeColumnReferenceKey(tableIndex, columnIndex)] && (
                      <div style={{ color: "#b00020", fontSize: 12 }}>
                        {validationErrors[makeColumnReferenceKey(tableIndex, columnIndex)]}
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
          {canManageStructure && (
            <div className="schema-edit-row">
              <button
                className="ghost-action"
                type="button"
                onClick={() => onAddColumn?.(tableIndex)}
              >
                Add column to {table.name}
              </button>
            </div>
          )}
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

    if (table.columns.length === 0) {
      validationErrors[makeTableColumnsKey(tableIndex)] = "Add at least one column";
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

      if (column.references) {
        const referencedLocation = findReferencedColumn(draftQuestion, column.references);
        if (!referencedLocation) {
          validationErrors[makeColumnReferenceKey(tableIndex, columnIndex)] =
            "Reference target is missing";
        } else {
          const referencedColumn =
            draftQuestion.tables[referencedLocation.tableIndex].columns[referencedLocation.columnIndex];

          if (referencedColumn.type !== column.type) {
            validationErrors[makeColumnReferenceKey(tableIndex, columnIndex)] =
              "Reference type must match target column type";
          }
        }
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
          references: column.references
            ? {
                table: column.references.table.trim(),
                column: column.references.column.trim(),
              }
            : undefined,
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

function listReferenceTargets(
  question: QuestionModel,
  sourceTableIndex: number,
  _sourceColumnIndex: number,
): Array<{ label: string; value: string }> {
  return question.tables.flatMap((table, tableIndex) =>
    tableIndex === sourceTableIndex
      ? []
      : table.columns
          .filter((column) => table.name.trim() !== "" && column.name.trim() !== "")
          .map((column) => ({
            label: `${table.name}.${column.name}`,
            value: JSON.stringify([table.name, column.name]),
          })),
  );
}

function findReferencedColumn(
  question: QuestionModel,
  reference: ColumnReference,
): { tableIndex: number; columnIndex: number } | null {
  for (let tableIndex = 0; tableIndex < question.tables.length; tableIndex += 1) {
    const table = question.tables[tableIndex];
    if (table.name.trim() !== reference.table.trim()) continue;

    for (let columnIndex = 0; columnIndex < table.columns.length; columnIndex += 1) {
      if (table.columns[columnIndex].name.trim() === reference.column.trim()) {
        return { tableIndex, columnIndex };
      }
    }
  }

  return null;
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

function makeColumnReferenceKey(tableIndex: number, columnIndex: number): string {
  return `column:${tableIndex}:${columnIndex}:reference`;
}

function makeTableColumnsKey(tableIndex: number): string {
  return `table:${tableIndex}:columns`;
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
