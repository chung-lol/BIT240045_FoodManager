/**
 * MockAPI giả lập trong bộ nhớ, thay cho global fetch khi chạy test.
 * Mô phỏng đúng hành vi REST của mockapi.io: GET list, GET/:id, POST (server sinh id),
 * PUT/:id, DELETE/:id, 404 khi resource/bản ghi không tồn tại.
 *
 * Các "sự cố" có thể bật để kiểm thử:
 *  - offline:                 mọi request ném lỗi mạng (như bật chế độ máy bay)
 *  - commitThenTimeoutOnce:   server ĐÃ ghi dữ liệu nhưng client nhận timeout
 *                             (kịch bản kinh điển gây bản ghi trùng)
 *  - failStatusOnce:          trả một mã lỗi HTTP (vd 500) cho request kế tiếp
 *  - beforeResponse:          hook chạy giữa lúc request "đang bay" (giả lập người
 *                             dùng sửa dữ liệu trong khi đồng bộ)
 */
type Rec = Record<string, unknown> & { id: string };

export class FakeMockApi {
  private store = new Map<string, Map<string, Rec>>();
  private nextId = 1;
  offline = false;
  commitThenTimeoutOnce: 'POST' | 'PUT' | null = null;
  failStatusOnce: number | null = null;
  beforeResponse: ((method: string, resource: string, body: Rec | null) => Promise<void>) | null = null;
  log: string[] = [];

  constructor(
    private base: string,
    resources: string[],
  ) {
    for (const r of resources) this.store.set(r, new Map());
  }

  all(resource: string): Rec[] {
    return [...(this.store.get(resource)?.values() ?? [])];
  }

  /** Sửa trực tiếp trên "dashboard MockAPI" (không qua app). */
  patchWhere(resource: string, field: string, value: unknown, patch: Record<string, unknown>) {
    for (const r of this.all(resource)) if (r[field] === value) Object.assign(r, patch);
  }

  removeWhere(resource: string, field: string, value: unknown) {
    const m = this.store.get(resource)!;
    for (const [k, r] of m) if (r[field] === value) m.delete(k);
  }

  clear(resource: string) {
    this.store.get(resource)!.clear();
  }

  /** Chèn thẳng một bản ghi (vd: tạo trùng do lỗi cũ) */
  insertRaw(resource: string, rec: Record<string, unknown>) {
    const id = String(this.nextId++);
    this.store.get(resource)!.set(id, { ...rec, id });
  }

  fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (this.offline) throw new TypeError('Network request failed');

    const path = url.replace(this.base, '').replace(/^\/+/, '').split('?')[0];
    const [resource, id] = path.split('/');
    this.log.push(`${method} ${resource}${id ? '/' + id : ''}`);
    const table = this.store.get(resource);
    const respond = (status: number, data: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
    });

    if (this.failStatusOnce) {
      const s = this.failStatusOnce;
      this.failStatusOnce = null;
      return respond(s, 'Internal error');
    }
    if (!table) return respond(404, '"Not found"');

    const body = init?.body ? (JSON.parse(init.body) as Rec) : null;
    if (this.beforeResponse) await this.beforeResponse(method, resource, body);

    let result: ReturnType<typeof respond>;
    if (method === 'GET' && !id) result = respond(200, [...table.values()]);
    else if (method === 'GET') result = table.has(id) ? respond(200, table.get(id)) : respond(404, '"Not found"');
    else if (method === 'POST') {
      const rec = { ...body!, id: String(this.nextId++) };
      table.set(rec.id, rec);
      result = respond(201, rec);
    } else if (method === 'PUT') {
      if (!table.has(id)) return respond(404, '"Not found"');
      const rec = { ...table.get(id)!, ...body!, id };
      table.set(id, rec);
      result = respond(200, rec);
    } else if (method === 'DELETE') {
      if (!table.has(id)) return respond(404, '"Not found"');
      const rec = table.get(id);
      table.delete(id);
      result = respond(200, rec);
    } else result = respond(405, 'Method not allowed');

    if (this.commitThenTimeoutOnce === method) {
      this.commitThenTimeoutOnce = null;
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err; // dữ liệu ĐÃ được ghi ở trên, nhưng client không biết
    }
    return result;
  };
}
