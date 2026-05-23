import { contextBridge, ipcRenderer } from "electron";
import type { AuditApi, NewNoteInput, NewSessionInput } from "../shared/types";

const auditApi: AuditApi = {
  getCurrentSession: () => ipcRenderer.invoke("audit:get-current-session"),
  createSession: (input: NewSessionInput) => ipcRenderer.invoke("audit:create-session", input),
  saveNote: (input: NewNoteInput) => ipcRenderer.invoke("audit:save-note", input),
  captureScreenshot: (noteId?: string) => ipcRenderer.invoke("audit:capture-screenshot", noteId),
  exportMarkdown: () => ipcRenderer.invoke("audit:export-markdown"),
  exportJson: () => ipcRenderer.invoke("audit:export-json")
};

contextBridge.exposeInMainWorld("auditApi", auditApi);
