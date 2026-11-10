import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";

import { classNames } from "../classNames";
import { TAKEN_FILES, megabytes, type InputMode } from "../running";
import { givenOf, readFile, type ChosenFile, type InputDraft } from "../runInput";
import styles from "./RunInput.module.css";

const MODES: readonly (readonly [InputMode, string])[] = [
  ["text", "Text"],
  ["json", "JSON"],
  ["file", "File"],
  ["none", "Nothing"],
];

const ACCEPT =
  ".json,.txt,.md,.csv,.html,.xml,.pdf,.png,.jpg,.jpeg,.webp,application/json,text/*,application/pdf,image/png,image/jpeg,image/webp";

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function FileIcon() {
  return (
    <svg
      className={styles.fileIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

/** Where a file is dropped or chosen, and the one chosen. */
function FileDrop({
  file,
  onFile,
}: {
  readonly file: ChosenFile | null;
  readonly onFile: (file: ChosenFile | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const take = (files: FileList | null): void => {
    const chosen = files?.[0];

    if (chosen === undefined) {
      return;
    }
    setReading(true);
    readFile(chosen).then(
      (read) => {
        setReading(false);
        setProblem(read.problem);

        if (read.chosen !== null) {
          onFile(read.chosen);
        }
      },
      () => {
        setReading(false);
        setProblem(`${chosen.name} couldn't be read.`);
      },
    );
  };

  return (
    <div className={styles.fileArea}>
      <input
        id={inputId}
        ref={input}
        className="visually-hidden"
        type="file"
        accept={ACCEPT}
        aria-label="Choose the run's file"
        tabIndex={-1}
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      {file === null ? (
        <button
          type="button"
          className={styles.drop}
          data-over={over ? "true" : undefined}
          disabled={reading}
          onClick={() => {
            input.current?.click();
          }}
          onDragEnter={(event) => {
            if (carriesFiles(event)) {
              event.preventDefault();
              setOver(true);
            }
          }}
          onDragOver={(event) => {
            if (carriesFiles(event)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDragLeave={() => {
            setOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            take(event.dataTransfer.files);
          }}
        >
          <FileIcon />
          <span className={styles.dropTitle}>
            {reading ? "Reading the file…" : "Drop a file here, or choose one"}
          </span>
          <span className={styles.dropHint}>{TAKEN_FILES}, up to 10 MB</span>
        </button>
      ) : (
        <div className={styles.chosen}>
          <FileIcon />
          <div className={styles.chosenText}>
            <span className={styles.chosenName}>{file.name}</span>
            <span className={styles.chosenFacts}>
              {file.sent.media_type} · {megabytes(file.size)}
            </span>
          </div>
          <button
            type="button"
            className={styles.remove}
            onClick={() => {
              setProblem(null);
              onFile(null);
            }}
          >
            Remove
          </button>
        </div>
      )}
      {problem !== null && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * How a person gives a run its input: as text, which most workflows take;
 * as JSON, any value; as a file, a PDF, an image or text; or as nothing.
 */
export function RunInput({
  draft,
  onChange,
  label = "Input",
}: {
  readonly draft: InputDraft;
  readonly onChange: (draft: InputDraft) => void;
  readonly label?: string;
}) {
  const textId = useId();
  const { problem } = givenOf(draft);
  let body: ReactNode = null;

  switch (draft.mode) {
    case "text":
      body = (
        <textarea
          id={textId}
          className={styles.text}
          rows={6}
          placeholder="What the workflow reads as its input"
          aria-label="The run's input, as text"
          value={draft.text}
          onChange={(event) => {
            onChange({ ...draft, text: event.target.value });
          }}
        />
      );
      break;
    case "json":
      body = (
        <>
          <textarea
            id={textId}
            className={classNames(styles.text, styles.mono)}
            rows={8}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            placeholder='{"text": "…"}'
            aria-label="The run's input, as JSON"
            aria-invalid={problem !== null && draft.json.trim() !== ""}
            value={draft.json}
            onChange={(event) => {
              onChange({ ...draft, json: event.target.value });
            }}
          />
          <p
            className={styles.state}
            data-ok={problem === null ? "true" : undefined}
            aria-live="polite"
          >
            {problem ?? "Reads as JSON."}
          </p>
        </>
      );
      break;
    case "file":
      body = (
        <FileDrop
          file={draft.file}
          onFile={(file) => {
            onChange({ ...draft, file });
          }}
        />
      );
      break;
    case "none":
      body = (
        <p className={styles.none}>
          The run is given no input. A step that reads the run’s input fails, as it would in any
          run.
        </p>
      );
      break;
  }

  return (
    <fieldset className={styles.panel}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.modes} role="radiogroup" aria-label="Give the run">
        {MODES.map(([mode, name]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            className={styles.mode}
            aria-checked={draft.mode === mode}
            onClick={() => {
              onChange({ ...draft, mode });
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {body}
    </fieldset>
  );
}
