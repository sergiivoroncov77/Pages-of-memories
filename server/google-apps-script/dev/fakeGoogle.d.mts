export interface FakeHttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** Origin the fake puts into resumable upload session URLs. */
  uploadBase?: string;
}

export interface FakeHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface FakeDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
  trashed: boolean;
  content: Uint8Array;
}

export interface FakeDrive {
  files: Map<string, FakeDriveFile>;
  handle(request: FakeHttpRequest): FakeHttpResponse;
  issueToken(): string;
  revokeTokens(): void;
  /** Answers like Google while the Drive API is off in the script's Cloud project. */
  turnApiOff(project?: string): void;
  liveFilesUnder(folderId: string): FakeDriveFile[];
}

export interface FakeAppsScript {
  drive: FakeDrive;
  properties: Map<string, string>;
  logs: string[];
  globals: Record<string, unknown>;
  rotateToken(): void;
}

export interface FamilyServer {
  fake: FakeAppsScript;
  context: Record<string, unknown>;
  post(request: Record<string, unknown>): Record<string, unknown> & { ok: boolean; error?: string; message?: string };
  get(): Record<string, unknown>;
  run(name: string): unknown;
}

export const SCRIPT_PATH: URL;
export const MANIFEST_PATH: URL;
export const FAKE_SCRIPT_ID: string;
export function createFakeDrive(): FakeDrive;
export function createFakeAppsScript(drive?: FakeDrive): FakeAppsScript;
export function loadFamilyServer(fake?: FakeAppsScript, source?: string): FamilyServer;
