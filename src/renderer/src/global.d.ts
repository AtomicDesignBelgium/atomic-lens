import type { AuditApi } from "../../shared/types";

declare global {
  interface Window {
    atomicLens?: AuditApi;
  }
}

export {};
