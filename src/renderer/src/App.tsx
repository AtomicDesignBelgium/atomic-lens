import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AuditCategory, AuditNote, AuditPriority, AuditSession, NewNoteInput } from "../../shared/types";

const categories: AuditCategory[] = ["ux", "bug", "feature", "code", "content", "other"];
const priorities: AuditPriority[] = ["P0", "P1", "P2", "P3"];

const emptyNote: NewNoteInput = {
  title: "",
  comment: "",
  category: "ux",
  priority: "P2",
  contextLabel: "",
  screenshotPath: undefined
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function App(): JSX.Element {
  const [session, setSession] = useState<AuditSession | null>(null);
  const [projectName, setProjectName] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [noteDraft, setNoteDraft] = useState<NewNoteInput>(emptyNote);
  const [selectedNoteId, setSelectedNoteId] = useState<string | undefined>();
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const selectedNote = useMemo(
    () => session?.notes.find((note) => note.id === selectedNoteId),
    [selectedNoteId, session?.notes]
  );

  const counts = useMemo(
    () =>
      priorities.map((priority) => ({
        priority,
        count: session?.notes.filter((note) => note.priority === priority).length ?? 0
      })),
    [session]
  );

  useEffect(() => {
    void runAction("Loaded latest session", async () => {
      const latestSession = await window.auditApi.getCurrentSession();
      setSession(latestSession);
    });
  }, []);

  async function runAction(successMessage: string, action: () => Promise<void>): Promise<void> {
    setIsBusy(true);
    setError(null);

    try {
      await action();
      setStatus(successMessage);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Something went wrong.";
      setError(message);
      setStatus("Action failed");
    } finally {
      setIsBusy(false);
    }
  }

  function updateNote<K extends keyof NewNoteInput>(key: K, value: NewNoteInput[K]): void {
    setNoteDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleCreateSession(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await runAction("New session created", async () => {
      const createdSession = await window.auditApi.createSession({ projectName, sessionTitle });
      setSession(createdSession);
      setSelectedNoteId(undefined);
      setNoteDraft(emptyNote);
    });
  }

  async function handleSaveNote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await runAction("Note saved", async () => {
      const updatedSession = await window.auditApi.saveNote(noteDraft);
      setSession(updatedSession);
      setSelectedNoteId(updatedSession.notes[0]?.id);
      setNoteDraft(emptyNote);
    });
  }

  async function handleCaptureScreenshot(): Promise<void> {
    await runAction(selectedNoteId ? "Screenshot attached to selected note" : "Screenshot captured for next note", async () => {
      const result = await window.auditApi.captureScreenshot(selectedNoteId);
      setSession(result.session);

      if (!selectedNoteId) {
        setNoteDraft((current) => ({ ...current, screenshotPath: result.screenshotPath }));
      }
    });
  }

  async function handleExportMarkdown(): Promise<void> {
    await runAction("Markdown report exported", async () => {
      const result = await window.auditApi.exportMarkdown();
      setStatus(`Markdown exported to ${result.filePath}`);
    });
  }

  async function handleExportJson(): Promise<void> {
    await runAction("JSON data exported", async () => {
      const result = await window.auditApi.exportJson();
      setStatus(`JSON exported to ${result.filePath}`);
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local audit companion</p>
          <h1>Atomic Lens V1</h1>
        </div>
        <div className="status" role="status" aria-live="polite">
          {error ? <span className="error-text">{error}</span> : status}
        </div>
      </header>

      <section className="workspace">
        <aside className="side-panel" aria-label="Session controls">
          <form className="panel-block" onSubmit={handleCreateSession}>
            <h2>Session</h2>
            <label>
              Project name
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Example: Checkout redesign"
                required
              />
            </label>
            <label>
              Session title
              <input
                value={sessionTitle}
                onChange={(event) => setSessionTitle(event.target.value)}
                placeholder="Example: Heuristic review"
                required
              />
            </label>
            <button type="submit" disabled={isBusy}>
              New Session
            </button>
          </form>

          {session ? (
            <div className="panel-block session-card">
              <h2>{session.sessionTitle}</h2>
              <dl>
                <div>
                  <dt>Project</dt>
                  <dd>{session.projectName}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(session.createdAt)}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{session.notes.length}</dd>
                </div>
              </dl>
              <div className="priority-grid" aria-label="Summary count by priority">
                {counts.map(({ priority, count }) => (
                  <span key={priority}>
                    <strong>{priority}</strong>
                    {count}
                  </span>
                ))}
              </div>
              <div className="button-stack">
                <button type="button" onClick={handleExportMarkdown} disabled={isBusy || session.notes.length === 0}>
                  Export Markdown
                </button>
                <button type="button" onClick={handleExportJson} disabled={isBusy}>
                  Export JSON
                </button>
              </div>
            </div>
          ) : (
            <p className="empty-hint">Create a session to start collecting audit notes.</p>
          )}
        </aside>

        <section className="main-panel" aria-label="Audit notes">
          <form className="note-form" onSubmit={handleSaveNote}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Capture</p>
                <h2>New audit note</h2>
              </div>
              <button type="button" onClick={handleCaptureScreenshot} disabled={isBusy || !session}>
                Capture Screenshot
              </button>
            </div>

            <div className="form-grid">
              <label className="wide">
                Title
                <input
                  value={noteDraft.title}
                  onChange={(event) => updateNote("title", event.target.value)}
                  placeholder="Concise issue or observation"
                  required
                  disabled={!session}
                />
              </label>
              <label>
                Category
                <select
                  value={noteDraft.category}
                  onChange={(event) => updateNote("category", event.target.value as AuditCategory)}
                  disabled={!session}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={noteDraft.priority}
                  onChange={(event) => updateNote("priority", event.target.value as AuditPriority)}
                  disabled={!session}
                >
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Context label
                <input
                  value={noteDraft.contextLabel ?? ""}
                  onChange={(event) => updateNote("contextLabel", event.target.value)}
                  placeholder="Screen, URL, component, flow, or file"
                  disabled={!session}
                />
              </label>
              <label className="wide">
                Comment
                <textarea
                  value={noteDraft.comment}
                  onChange={(event) => updateNote("comment", event.target.value)}
                  placeholder="What happened, why it matters, and what to inspect next"
                  required
                  disabled={!session}
                />
              </label>
            </div>

            {noteDraft.screenshotPath ? <p className="path-chip">Screenshot ready: {noteDraft.screenshotPath}</p> : null}

            <button type="submit" disabled={isBusy || !session}>
              Save Note
            </button>
          </form>

          <div className="notes-header">
            <div>
              <p className="eyebrow">Review queue</p>
              <h2>Notes</h2>
            </div>
            {selectedNote ? <span className="selected-label">Selected: {selectedNote.title}</span> : null}
          </div>

          <div className="notes-list">
            {session?.notes.length ? (
              session.notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isSelected={note.id === selectedNoteId}
                  onSelect={() => setSelectedNoteId(note.id)}
                />
              ))
            ) : (
              <div className="empty-state">No notes yet.</div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

interface NoteCardProps {
  note: AuditNote;
  isSelected: boolean;
  onSelect: () => void;
}

function NoteCard({ note, isSelected, onSelect }: NoteCardProps): JSX.Element {
  return (
    <article className={isSelected ? "note-card selected" : "note-card"}>
      <button type="button" className="note-select" onClick={onSelect} aria-pressed={isSelected}>
        <span className={`priority-badge ${note.priority.toLowerCase()}`}>{note.priority}</span>
        <span className="note-title">{note.title}</span>
      </button>
      <div className="note-meta">
        <span>{note.category}</span>
        <span>{formatDate(note.createdAt)}</span>
        {note.contextLabel ? <span>{note.contextLabel}</span> : null}
      </div>
      <p>{note.comment}</p>
      {note.screenshotPath ? <p className="path-chip">Screenshot: {note.screenshotPath}</p> : null}
    </article>
  );
}

export default App;
