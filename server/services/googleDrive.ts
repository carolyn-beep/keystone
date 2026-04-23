import { createSign } from 'crypto';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type GoogleDriveErrorCode = 'config_error' | 'auth_error' | 'api_error' | 'invalid_response';

interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GoogleDriveServiceOptions {
  sharedDriveId?: string;
  rootFolderName?: string;
  credentials?: GoogleServiceAccountCredentials;
  fetchImpl?: FetchLike;
  tokenProvider?: () => Promise<string>;
}

export class GoogleDriveServiceError extends Error {
  readonly code: GoogleDriveErrorCode;
  readonly status: number | null;
  readonly details: string | null;

  constructor(code: GoogleDriveErrorCode, message: string, status?: number, details?: string | null) {
    super(message);
    this.name = 'GoogleDriveServiceError';
    this.code = code;
    this.status = status ?? null;
    this.details = details ?? null;
  }
}

export interface EnsureRootFolderInput {
  brainliftId: number;
  brainliftTitle: string;
  ownerName: string | null;
  existingFolderId: string | null;
}

export interface EnsurePlanFolderInput {
  planId: number;
  startDate: string;
  existingFolderId: string | null;
  rootFolderId: string;
}

export interface CreateGoogleDocInput {
  parentFolderId: string;
  title: string;
  markdown: string;
}

export interface ReadGoogleDocResult {
  title: string;
  markdown: string;
  docUrl: string;
}

export interface GoogleDriveService {
  ensureRootFolder(input: EnsureRootFolderInput): Promise<{ folderId: string; created: boolean }>;
  ensurePlanFolder(input: EnsurePlanFolderInput): Promise<{ folderId: string; created: boolean }>;
  syncRootFolderEditors(folderId: string, emails: string[]): Promise<void>;
  createGoogleDocFromMarkdown(input: CreateGoogleDocInput): Promise<{ fileId: string; docUrl: string }>;
  exportGoogleDocAsMarkdown(fileId: string): Promise<ReadGoogleDocResult>;
  replaceGoogleDocFromMarkdown(fileId: string, markdown: string): Promise<void>;
  deleteGoogleDoc(fileId: string): Promise<boolean>;
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DOCS_SCOPE = 'https://www.googleapis.com/auth/documents';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DEFAULT_ROOT_FOLDER_NAME = 'BrainLift Deliverables';

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizeEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return null;
  return normalized;
}

function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const email of emails) {
    const normalized = normalizeEmail(email);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function buildFolderName(brainliftTitle: string, ownerName: string | null): string {
  const safeOwnerName = ownerName?.trim() || 'Unknown';
  return `${brainliftTitle} Brainlift - ${safeOwnerName} - Deliverables`;
}

function docUrlFromId(fileId: string): string {
  return `https://docs.google.com/document/d/${fileId}/edit`;
}

function parseCredentialsFromEnv(): GoogleServiceAccountCredentials {
  const rawBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  let parsed: any = null;
  try {
    if (rawBase64) {
      parsed = JSON.parse(Buffer.from(rawBase64, 'base64').toString('utf-8'));
    } else if (rawJson) {
      parsed = JSON.parse(rawJson);
    }
  } catch {
    throw new GoogleDriveServiceError('config_error', 'Invalid Google service account credentials JSON');
  }

  if (!parsed?.client_email || !parsed?.private_key) {
    throw new GoogleDriveServiceError('config_error', 'Google service account credentials are missing client_email/private_key');
  }

  return {
    client_email: parsed.client_email,
    private_key: normalizePrivateKey(parsed.private_key),
    token_uri: parsed.token_uri || DEFAULT_TOKEN_URI,
  };
}

function createServiceAccountJwt(credentials: GoogleServiceAccountCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: credentials.client_email,
      scope: `${DRIVE_SCOPE} ${DOCS_SCOPE}`,
      aud: credentials.token_uri || DEFAULT_TOKEN_URI,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(credentials.private_key), 'base64');
  return `${unsignedToken}.${base64UrlEncode(Buffer.from(signature, 'base64'))}`;
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export function createGoogleDriveService(options: GoogleDriveServiceOptions = {}): GoogleDriveService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sharedDriveId = options.sharedDriveId ?? process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID;
  const rootFolderName = options.rootFolderName ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_NAME ?? DEFAULT_ROOT_FOLDER_NAME;
  const credentials = options.credentials
    ? { ...options.credentials, private_key: normalizePrivateKey(options.credentials.private_key) }
    : parseCredentialsFromEnv();

  if (!sharedDriveId) {
    throw new GoogleDriveServiceError('config_error', 'GOOGLE_DRIVE_SHARED_DRIVE_ID is required');
  }

  let cachedAccessToken: string | null = null;
  let cachedAccessTokenExpiresAt = 0;

  const getAccessToken = async (): Promise<string> => {
    if (options.tokenProvider) {
      return options.tokenProvider();
    }

    const now = Date.now();
    if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60_000) {
      return cachedAccessToken;
    }

    const assertion = createServiceAccountJwt(credentials);
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });

    const tokenResponse = await fetchImpl(credentials.token_uri || DEFAULT_TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenResponse.ok) {
      const details = await safeReadBody(tokenResponse);
      throw new GoogleDriveServiceError(
        'auth_error',
        'Failed to obtain Google access token',
        tokenResponse.status,
        details,
      );
    }

    const json = await tokenResponse.json() as { access_token?: string; expires_in?: number };
    if (!json.access_token || !json.expires_in) {
      throw new GoogleDriveServiceError('invalid_response', 'Google token response missing access_token/expires_in');
    }

    cachedAccessToken = json.access_token;
    cachedAccessTokenExpiresAt = Date.now() + (json.expires_in * 1000);
    return cachedAccessToken;
  };

  const driveRequest = async <T = unknown>(url: string, init: RequestInit, parseAs: 'json' | 'text' | 'none' = 'json'): Promise<T> => {
    const accessToken = await getAccessToken();
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const details = await safeReadBody(response);
      throw new GoogleDriveServiceError('api_error', `Google Drive API request failed: ${init.method ?? 'GET'} ${url}`, response.status, details);
    }

    if (parseAs === 'none') {
      return undefined as T;
    }
    if (parseAs === 'text') {
      return await response.text() as T;
    }
    return await response.json() as T;
  };

  const createFolder = async (name: string, parentFolderId: string): Promise<string> => {
    const metadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    };

    const payload = await driveRequest<{ id?: string }>(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      },
      'json',
    );

    if (!payload.id) {
      throw new GoogleDriveServiceError('invalid_response', 'Drive folder creation did not return file id');
    }
    return payload.id;
  };

  return {
    async ensureRootFolder(input) {
      if (input.existingFolderId) {
        return { folderId: input.existingFolderId, created: false };
      }

      const folderName = buildFolderName(input.brainliftTitle, input.ownerName);
      const folderId = await createFolder(folderName || rootFolderName, sharedDriveId);
      return { folderId, created: true };
    },

    async ensurePlanFolder(input) {
      if (input.existingFolderId) {
        return { folderId: input.existingFolderId, created: false };
      }

      const folderId = await createFolder(`Plan - ${input.startDate}`, input.rootFolderId);
      return { folderId, created: true };
    },

    async syncRootFolderEditors(folderId, emails) {
      const uniqueEmails = dedupeEmails(emails);
      if (uniqueEmails.length === 0) return;

      for (const email of uniqueEmails) {
        try {
          await driveRequest(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role: 'writer',
                type: 'user',
                emailAddress: email,
              }),
            },
            'none',
          );
        } catch (error) {
          if (
            error instanceof GoogleDriveServiceError &&
            (
              error.status === 409 ||
              (error.status === 400 && typeof error.details === 'string' && error.details.toLowerCase().includes('already'))
            )
          ) {
            continue;
          }
          throw error;
        }
      }
    },

    async createGoogleDocFromMarkdown(input) {
      const boundary = `boundary_${Date.now().toString(36)}`;
      const metadata = {
        name: input.title,
        mimeType: 'application/vnd.google-apps.document',
        parents: [input.parentFolderId],
      };
      const multipartBody = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: text/markdown; charset=UTF-8',
        '',
        input.markdown,
        `--${boundary}--`,
        '',
      ].join('\r\n');

      const payload = await driveRequest<{ id?: string; webViewLink?: string }>(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipartBody,
        },
        'json',
      );

      if (!payload.id) {
        throw new GoogleDriveServiceError('invalid_response', 'Google Doc creation did not return file id');
      }

      return {
        fileId: payload.id,
        docUrl: payload.webViewLink || docUrlFromId(payload.id),
      };
    },

    async exportGoogleDocAsMarkdown(fileId) {
      const metadata = await driveRequest<{ id?: string; name?: string; webViewLink?: string }>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,webViewLink`,
        { method: 'GET' },
        'json',
      );

      const markdown = await driveRequest<string>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/markdown`,
        { method: 'GET' },
        'text',
      );

      return {
        title: metadata.name || 'Untitled',
        markdown,
        docUrl: metadata.webViewLink || docUrlFromId(fileId),
      };
    },

    async replaceGoogleDocFromMarkdown(fileId, markdown) {
      await driveRequest(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'text/markdown; charset=UTF-8' },
          body: markdown,
        },
        'none',
      );
    },

    async deleteGoogleDoc(fileId) {
      const accessToken = await getAccessToken();
      const response = await fetchImpl(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (response.status === 404) {
        return false;
      }

      if (!response.ok) {
        const details = await safeReadBody(response);
        throw new GoogleDriveServiceError(
          'api_error',
          `Google Drive API request failed: DELETE file ${fileId}`,
          response.status,
          details,
        );
      }

      return true;
    },
  };
}
