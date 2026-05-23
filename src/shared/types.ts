export type AuditCategory = "ux" | "bug" | "feature" | "code" | "content" | "other";

export type AuditPriority = "P0" | "P1" | "P2" | "P3";

export interface AuditNote {
  id: string;
  createdAt: string;
  title: string;
  comment: string;
  category: AuditCategory;
  priority: AuditPriority;
  contextLabel?: string;
  screenshotPath?: string;
}

export interface AuditSession {
  id: string;
  projectName: string;
  sessionTitle: string;
  createdAt: string;
  notes: AuditNote[];
}

export interface NewSessionInput {
  projectName: string;
  sessionTitle: string;
}

export interface NewNoteInput {
  title: string;
  comment: string;
  category: AuditCategory;
  priority: AuditPriority;
  contextLabel?: string;
  screenshotPath?: string;
}

export interface CaptureScreenshotResult {
  session: AuditSession;
  screenshotPath: string;
  noteId?: string;
}

export interface ExportResult {
  filePath: string;
}

export interface AuditApi {
  getCurrentSession: () => Promise<AuditSession | null>;
  createSession: (input: NewSessionInput) => Promise<AuditSession>;
  saveNote: (input: NewNoteInput) => Promise<AuditSession>;
  captureScreenshot: (noteId?: string) => Promise<CaptureScreenshotResult>;
  exportMarkdown: () => Promise<ExportResult>;
  exportJson: () => Promise<ExportResult>;
}
