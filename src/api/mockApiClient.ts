import { MOCKAPI_BASE_URL, SYNC_CONFIG } from '@/config/appConfig';

export type RemoteRecord = Record<string, unknown> & { id: string };

export class ApiError extends Error {
  constructor(
    message: string,
    /** 0 = lỗi mạng / timeout (không có phản hồi HTTP). */
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetworkError() {
    return this.status === 0;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_CONFIG.requestTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${MOCKAPI_BASE_URL.replace(/\/+$/, '')}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    throw new ApiError(aborted ? 'Request timed out' : 'Network request failed', 0);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`, res.status);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('Invalid JSON from server', res.status);
  }
}

/** Danh sách toàn bộ bản ghi của một resource. MockAPI trả 404 khi resource rỗng/không tồn tại. */
export async function listRecords(resource: string): Promise<RemoteRecord[]> {
  try {
    const data = await request<unknown>('GET', resource);
    if (!Array.isArray(data)) throw new ApiError('Unexpected list response', 200);
    return data.filter((r): r is RemoteRecord => !!r && typeof r === 'object' && 'id' in r).map((r) => ({
      ...r,
      id: String(r.id),
    }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

export async function createRecord(resource: string, body: Record<string, unknown>): Promise<RemoteRecord> {
  try {
    const r = await request<RemoteRecord>('POST', resource, body);
    return { ...r, id: String(r.id) };
  } catch (e) {
    // POST trả 404 gần như chắc chắn là sai tên resource hoặc sai MOCKAPI_BASE_URL
    if (e instanceof ApiError && e.status === 404) {
      throw new ApiError(`Resource "${resource}" not found on MockAPI — check MOCKAPI_BASE_URL / MOCKAPI_RESOURCES`, 404);
    }
    throw e;
  }
}

export async function updateRecord(
  resource: string,
  remoteId: string,
  body: Record<string, unknown>,
): Promise<RemoteRecord> {
  const r = await request<RemoteRecord>('PUT', `${resource}/${encodeURIComponent(remoteId)}`, body);
  return { ...r, id: String(r.id) };
}

/** Xoá; 404 coi như đã xoá (idempotent). */
export async function deleteRecord(resource: string, remoteId: string): Promise<void> {
  try {
    await request<unknown>('DELETE', `${resource}/${encodeURIComponent(remoteId)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return;
    throw e;
  }
}
