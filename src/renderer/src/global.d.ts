import type { AuditApi } from "../../shared/types";

declare global {
  interface Window {
    auditApi: AuditApi;
  }
}

export {};
