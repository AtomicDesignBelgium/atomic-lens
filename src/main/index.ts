import { app, BrowserWindow, desktopCapturer, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  AuditNote,
  AuditPriority,
  AuditSession,
  CaptureScreenshotResult,
  ExportResult,
  NewNoteInput,
  NewSessionInput
} from "../shared/types";

const priorities: AuditPriority[] = ["P0", "P1", "P2", "P3"];

interface AuditIndex {
  currentSessionId?: string;
  sessionIds: string[];
}

let mainWindow: BrowserWindow | null = null;

const getAuditsRoot = (): string => path.join(app.getPath("userData"), "audits");
const getIndexPath = (): string => path.join(getAuditsRoot(), "index.json");
const getSessionDir = (sessionId: string): string => path.join(getAuditsRoot(), sessionId);
const getSessionPath = (sessionId: string): string => path.join(getSessionDir(sessionId), "session.json");
const getAssetsDir = (sessionId: string): string => path.join(getSessionDir(sessionId), "assets");

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;

async function ensureAuditRoot(): Promise<void> {
  await mkdir(getAuditsRoot(), { recursive: true });
}

async function readIndex(): Promise<AuditIndex> {
  await ensureAuditRoot();

  if (!existsSync(getIndexPath())) {
    return { sessionIds: [] };
  }

  try {
    return JSON.parse(await readFile(getIndexPath(), "utf8")) as AuditIndex;
  } catch {
    return { sessionIds: [] };
  }
}

async function writeIndex(index: AuditIndex): Promise<void> {
  await ensureAuditRoot();
  await writeFile(getIndexPath(), JSON.stringify(index, null, 2), "utf8");
}

async function readSession(sessionId: string): Promise<AuditSession> {
  return JSON.parse(await readFile(getSessionPath(sessionId), "utf8")) as AuditSession;
}

async function writeSession(session: AuditSession): Promise<void> {
  await mkdir(getAssetsDir(session.id), { recursive: true });
  await writeFile(getSessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
}

async function getCurrentSession(): Promise<AuditSession | null> {
  const index = await readIndex();

  if (!index.currentSessionId) {
    return null;
  }

  try {
    return await readSession(index.currentSessionId);
  } catch {
    return null;
  }
}

function validateText(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function markdownEscape(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function renderMarkdown(session: AuditSession): string {
  const counts = priorities
    .map((priority) => `- ${priority}: ${session.notes.filter((note) => note.priority === priority).length}`)
    .join("\n");

  const groupedNotes = priorities
    .map((priority) => {
      const notes = session.notes.filter((note) => note.priority === priority);
      const body = notes.length
        ? notes
            .map((note, index) => {
              const details = [
                `**Category:** ${note.category}`,
                note.contextLabel ? `**Context:** ${markdownEscape(note.contextLabel)}` : undefined,
                note.screenshotPath ? `**Screenshot:** ${markdownEscape(note.screenshotPath)}` : undefined
              ]
                .filter(Boolean)
                .join("\n\n");

              return `### ${index + 1}. ${markdownEscape(note.title)}\n\n${details}\n\n${markdownEscape(note.comment)}`;
            })
            .join("\n\n")
        : "_No notes._";

      return `## ${priority}\n\n${body}`;
    })
    .join("\n\n");

  return `# ${markdownEscape(session.sessionTitle)}

**Project:** ${markdownEscape(session.projectName)}

**Date:** ${formatDate(session.createdAt)}

## Summary by Priority

${counts}

${groupedNotes}
`;
}

async function requireSession(): Promise<AuditSession> {
  const session = await getCurrentSession();

  if (!session) {
    throw new Error("Create a session before adding notes, capturing screenshots, or exporting.");
  }

  return session;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 640,
    title: "Atomic Lens V1",
    backgroundColor: "#f7f6f2",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("audit:get-current-session", async (): Promise<AuditSession | null> => getCurrentSession());

  ipcMain.handle("audit:create-session", async (_event, input: NewSessionInput): Promise<AuditSession> => {
    const session: AuditSession = {
      id: createId("session"),
      projectName: validateText(input.projectName, "Project name"),
      sessionTitle: validateText(input.sessionTitle, "Session title"),
      createdAt: new Date().toISOString(),
      notes: []
    };

    await writeSession(session);

    const index = await readIndex();
    await writeIndex({
      currentSessionId: session.id,
      sessionIds: [session.id, ...index.sessionIds.filter((id) => id !== session.id)]
    });

    return session;
  });

  ipcMain.handle("audit:save-note", async (_event, input: NewNoteInput): Promise<AuditSession> => {
    const session = await requireSession();
    const note: AuditNote = {
      id: createId("note"),
      createdAt: new Date().toISOString(),
      title: validateText(input.title, "Note title"),
      comment: validateText(input.comment, "Comment"),
      category: input.category,
      priority: input.priority,
      contextLabel: input.contextLabel?.trim() || undefined,
      screenshotPath: input.screenshotPath
    };

    const updatedSession = { ...session, notes: [note, ...session.notes] };
    await writeSession(updatedSession);

    return updatedSession;
  });

  ipcMain.handle("audit:capture-screenshot", async (_event, noteId?: string): Promise<CaptureScreenshotResult> => {
    const session = await requireSession();
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    const source = sources.find((item) => item.name.toLowerCase().includes("screen")) ?? sources[0];

    if (!source || source.thumbnail.isEmpty()) {
      throw new Error("No capturable screen or window was available.");
    }

    await mkdir(getAssetsDir(session.id), { recursive: true });
    const fileName = `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    const filePath = path.join(getAssetsDir(session.id), fileName);
    await writeFile(filePath, source.thumbnail.toPNG());

    const updatedSession = noteId
      ? {
          ...session,
          notes: session.notes.map((note) => (note.id === noteId ? { ...note, screenshotPath: filePath } : note))
        }
      : session;

    if (noteId) {
      await writeSession(updatedSession);
    }

    return { session: updatedSession, screenshotPath: filePath, noteId };
  });

  ipcMain.handle("audit:export-markdown", async (): Promise<ExportResult> => {
    const session = await requireSession();
    const filePath = path.join(getSessionDir(session.id), "report.md");
    await writeFile(filePath, renderMarkdown(session), "utf8");
    return { filePath };
  });

  ipcMain.handle("audit:export-json", async (): Promise<ExportResult> => {
    const session = await requireSession();
    const filePath = path.join(getSessionDir(session.id), "session-export.json");
    await writeFile(filePath, JSON.stringify(session, null, 2), "utf8");
    return { filePath };
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
