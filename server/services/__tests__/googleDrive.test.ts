import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoogleDriveService, GoogleDriveServiceError } from '../googleDrive';

const DUMMY_CREDENTIALS = {
  client_email: 'svc@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
  token_uri: 'https://oauth2.googleapis.com/token',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(payload: string, status = 200): Response {
  return new Response(status === 204 ? null : payload, { status, headers: { 'Content-Type': 'text/plain' } });
}

describe('googleDrive service', () => {
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

  const makeService = () => createGoogleDriveService({
    sharedDriveId: 'shared-drive-123',
    credentials: DUMMY_CREDENTIALS,
    fetchImpl: fetchMock as any,
    tokenProvider: async () => 'token-123',
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('reuses cached root folder id without API calls', async () => {
    const service = makeService();

    const result = await service.ensureRootFolder({
      brainliftId: 1,
      brainliftTitle: 'Brainlift',
      ownerName: 'Owner',
      existingFolderId: 'folder-existing',
    });

    expect(result).toEqual({ folderId: 'folder-existing', created: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates root folder in shared drive when no cached id exists', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'folder-new' }));
    const service = makeService();

    const result = await service.ensureRootFolder({
      brainliftId: 1,
      brainliftTitle: 'Alpha',
      ownerName: 'Jane Doe',
      existingFolderId: null,
    });

    expect(result).toEqual({ folderId: 'folder-new', created: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/drive/v3/files?supportsAllDrives=true&fields=id');
    expect(init?.method).toBe('POST');
    expect(String(init?.body)).toContain('Alpha Brainlift - Jane Doe - Deliverables');
    expect(String(init?.body)).toContain('"parents":["shared-drive-123"]');
  });

  it('creates plan folder under root folder when missing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'plan-folder-1' }));
    const service = makeService();

    const result = await service.ensurePlanFolder({
      planId: 10,
      startDate: '2026-04-21',
      existingFolderId: null,
      rootFolderId: 'root-folder-1',
    });

    expect(result).toEqual({ folderId: 'plan-folder-1', created: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(String(init?.body)).toContain('Plan - 2026-04-21');
    expect(String(init?.body)).toContain('"parents":["root-folder-1"]');
  });

  it('syncs root folder editors with deduped emails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const service = makeService();

    await service.syncRootFolderEditors('folder-1', [
      'Editor@One.com',
      'editor@one.com',
      'second@two.com',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = String(fetchMock.mock.calls[0][1]?.body);
    const secondBody = String(fetchMock.mock.calls[1][1]?.body);
    expect(firstBody).toContain('"emailAddress":"editor@one.com"');
    expect(secondBody).toContain('"emailAddress":"second@two.com"');
  });

  it('creates google doc from markdown and returns id + url', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'doc-123',
      webViewLink: 'https://docs.google.com/document/d/doc-123/edit',
    }));
    const service = makeService();

    const result = await service.createGoogleDocFromMarkdown({
      parentFolderId: 'plan-folder-1',
      title: 'Deliverable 1',
      markdown: '# Hello',
    });

    expect(result).toEqual({
      fileId: 'doc-123',
      docUrl: 'https://docs.google.com/document/d/doc-123/edit',
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/upload/drive/v3/files?uploadType=multipart');
  });

  it('exports a google doc as markdown', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: 'doc-123',
        name: 'Deliverable 1',
        webViewLink: 'https://docs.google.com/document/d/doc-123/edit',
      }))
      .mockResolvedValueOnce(textResponse('# Updated markdown'));

    const service = makeService();
    const result = await service.exportGoogleDocAsMarkdown('doc-123');

    expect(result).toEqual({
      title: 'Deliverable 1',
      markdown: '# Updated markdown',
      docUrl: 'https://docs.google.com/document/d/doc-123/edit',
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/drive/v3/files/doc-123/export');
  });

  it('replaces google doc content in place', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('', 200));
    const service = makeService();

    await service.replaceGoogleDocFromMarkdown('doc-123', '# Replacement');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/upload/drive/v3/files/doc-123?uploadType=media');
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'text/markdown; charset=UTF-8',
    });
  });

  it('returns false when delete hits 404 and true for successful delete', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse('missing', 404))
      .mockResolvedValueOnce(textResponse('', 204));
    const service = makeService();

    await expect(service.deleteGoogleDoc('doc-missing')).resolves.toBe(false);
    await expect(service.deleteGoogleDoc('doc-existing')).resolves.toBe(true);
  });

  it('bubbles typed API errors for failed doc create', async () => {
    fetchMock.mockResolvedValueOnce(textResponse('boom', 500));
    const service = makeService();

    await expect(
      service.createGoogleDocFromMarkdown({
        parentFolderId: 'plan-folder-1',
        title: 'Broken',
        markdown: 'text',
      }),
    ).rejects.toMatchObject({
      name: 'GoogleDriveServiceError',
      code: 'api_error',
      status: 500,
    } satisfies Partial<GoogleDriveServiceError>);
  });
});
