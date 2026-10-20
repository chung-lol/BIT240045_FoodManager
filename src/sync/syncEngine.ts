/**
 * ===================================================================
 *  SYNC ENGINE — đồng bộ 2 chiều SQLite <-> MockAPI (offline-first)
 * ===================================================================
 *
 * Nguồn dữ liệu chính của UI luôn là SQLite. Mỗi bản ghi có metadata:
 *   {MSSV}_SyncStatus   'pending' | 'synced'
 *   {MSSV}_IsDeleted    tombstone (xoá mềm chờ xoá trên server)
 *   {MSSV}_RemoteId     id kỹ thuật MockAPI
 *   {MSSV}_LocalVersion tăng mỗi lần sửa local
 * => "Outbox theo bản ghi" thay cho bảng SyncQueue dạng log thao tác:
 *    tạo rồi sửa 5 lần khi offline chỉ cần 1 request; tạo rồi xoá khi offline
 *    tự triệt tiêu; không lo sai thứ tự CREATE/UPDATE/DELETE trong hàng đợi.
 *
 * Một lượt đồng bộ (runSyncOnce):
 *  1. SNAPSHOT: GET toàn bộ danh mục + món trên MockAPI, lập chỉ mục theo
 *     khoá nghiệp vụ {MSSV}_Id (UUID sinh trên thiết bị).
 *  2. DỌN TRÙNG: nếu server có >1 bản ghi cùng {MSSV}_Id (do lỗi cũ) -> giữ 1, xoá phần thừa.
 *  3. PUSH upsert: mỗi bản ghi Pending
 *        - đã có trên server  -> PUT (hoặc nhận bản server nếu server mới hơn: Last-Write-Wins)
 *        - chưa có            -> POST
 *     Vì luôn tra snapshot trước khi POST, một POST bị timeout (server đã tạo nhưng
 *     app không nhận phản hồi) sẽ được lượt sau nhận ra là "đã có" => PUT, KHÔNG POST lại
 *     => không sinh bản ghi trùng (idempotent).
 *  4. PUSH delete: món trước, danh mục sau; xoá xong mới xoá vật lý ở local.
 *  5. PULL/MERGE: ghi dữ liệu server về SQLite, BỎ QUA bản ghi đang Pending
 *     (thay đổi local chưa gửi không bao giờ bị dữ liệu cũ đè).
 *     Bản ghi đã Synced mà server không còn => đã bị xoá ở nơi khác => xoá local.
 *
 * Chỉ một lượt chạy tại một thời điểm (single-flight, xem syncScheduler.ts).
 */
import { ApiError, createRecord, deleteRecord, listRecords, updateRecord, type RemoteRecord } from '@/api/mockApiClient';
import { fromRemoteCategory, fromRemoteDish, toRemoteCategory, toRemoteDish } from '@/api/remoteMappers';
import { MOCKAPI_BASE_URL, MOCKAPI_RESOURCES } from '@/config/appConfig';
import { getDb, writeTransaction } from '@/database/database';
import { COLS, SETTING_KEYS, SQL, SYNC_STATUS } from '@/database/schema';
import * as catRepo from '@/repositories/categoryRepository';
import * as dishRepo from '@/repositories/dishRepository';
import { getSetting, setSetting } from '@/repositories/settingRepository';
import { SEED_ID_PREFIX } from '@/database/seed';

export interface SyncReport {
  pushed: number;
  pulled: number;
  deletedRemote: number;
  deletedLocal: number;
  duplicatesRemoved: number;
  skipped: number;
  errors: string[];
}

type RemoteIndex = Map<string, RemoteRecord[]>;

/** Lập chỉ mục theo {MSSV}_Id; bản ghi không có khoá nghiệp vụ (rác/mẫu MockAPI) bị bỏ qua. */
function indexByBusinessId(records: RemoteRecord[]): RemoteIndex {
  const map: RemoteIndex = new Map();
  for (const r of records) {
    const bid = r[COLS.id];
    if (typeof bid !== 'string' || !bid) continue;
    const list = map.get(bid) ?? [];
    list.push(r);
    map.set(bid, list);
  }
  // Bản "chính" = UpdatedAt lớn nhất, hoà thì id MockAPI nhỏ nhất (tạo sớm nhất).
  for (const list of map.values()) {
    list.sort((a, b) => {
      const du = Number(b[COLS.updatedAt] ?? 0) - Number(a[COLS.updatedAt] ?? 0);
      if (du !== 0) return du;
      const na = Number(a.id);
      const nb = Number(b.id);
      return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.id.localeCompare(b.id);
    });
  }
  return map;
}

/**
 * Bản ghi mẫu chưa từng bị người dùng sửa và chưa từng lên server
 * (LocalVersion = 1 là giá trị lúc seed; mọi lần sửa đều tăng số này).
 */
const isUntouchedSeed = (r: { id: string; localVersion: number; remoteId: string | null }) =>
  r.id.startsWith(SEED_ID_PREFIX) && r.localVersion === 1 && !r.remoteId;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Lỗi mạng => dừng cả lượt (giữ nguyên Pending, lượt sau thử lại). Lỗi HTTP khác => ghi nhận, làm tiếp. */
function rethrowIfNetwork(e: unknown) {
  if (e instanceof ApiError && e.isNetworkError) throw e;
}

const categorySignature = (c: { name: string; description: string }) => JSON.stringify([c.name, c.description]);

const dishSignature = (d: {
  name: string;
  description: string;
  price: number;
  preparationTime: number;
  isAvailable: boolean;
  dishCategoryId: string;
  images: { id: string; imageUrl: string; isThumbnail: boolean; sortOrder: number }[];
}) =>
  JSON.stringify([
    d.name,
    d.description,
    d.price,
    d.preparationTime,
    d.isAvailable,
    d.dishCategoryId,
    d.images.map((i) => [i.id, i.imageUrl, i.isThumbnail, i.sortOrder]),
  ]);

export async function runSyncOnce(): Promise<SyncReport> {
  const report: SyncReport = {
    pushed: 0,
    pulled: 0,
    deletedRemote: 0,
    deletedLocal: 0,
    duplicatesRemoved: 0,
    skipped: 0,
    errors: [],
  };
  const R = MOCKAPI_RESOURCES;
  const db = await getDb();

  // 0. Đổi sang project MockAPI khác => coi toàn bộ dữ liệu local là chưa đồng bộ.
  const lastUrl = await getSetting(db, SETTING_KEYS.lastSyncBaseUrl);
  if (lastUrl && lastUrl !== MOCKAPI_BASE_URL) {
    await writeTransaction(async (tx) => {
      await catRepo.markAllCategoriesPending(tx);
      await dishRepo.markAllDishesPending(tx);
    });
  }

  // 1. SNAPSHOT server (lỗi mạng ở đây => ném ra, lượt này kết thúc)
  const [remoteCatsRaw, remoteDishesRaw] = await Promise.all([listRecords(R.categories), listRecords(R.dishes)]);
  const catIndex = indexByBusinessId(remoteCatsRaw);
  const dishIndex = indexByBusinessId(remoteDishesRaw);

  // 1b. Server trống trơn nhưng local có dữ liệu "đã đồng bộ" => server bị reset/xoá resource.
  //     An toàn hơn là đẩy lại dữ liệu local thay vì xoá sạch máy người dùng.
  let localCats = await catRepo.listAllCategoriesForSync(db);
  let localDishes = await dishRepo.listAllDishesForSync(db);
  const serverCatsEmpty = catIndex.size === 0 && localCats.some((c) => c.syncStatus === SYNC_STATUS.synced);
  const serverDishesEmpty = dishIndex.size === 0 && localDishes.some((d) => d.syncStatus === SYNC_STATUS.synced);
  if (serverCatsEmpty || serverDishesEmpty) {
    await writeTransaction(async (tx) => {
      if (serverCatsEmpty) await catRepo.markAllCategoriesPending(tx);
      if (serverDishesEmpty) await dishRepo.markAllDishesPending(tx);
    });
    localCats = await catRepo.listAllCategoriesForSync(db);
    localDishes = await dishRepo.listAllDishesForSync(db);
  }

  // 2. DỌN TRÙNG trên server
  for (const [resource, index] of [
    [R.categories, catIndex],
    [R.dishes, dishIndex],
  ] as const) {
    for (const [bid, list] of index) {
      if (list.length <= 1) continue;
      const extras = list.slice(1);
      for (const extra of extras) {
        try {
          await deleteRecord(resource, extra.id);
          report.duplicatesRemoved++;
        } catch (e) {
          rethrowIfNetwork(e);
          report.errors.push(`dedupe ${bid}: ${errText(e)}`);
        }
      }
      index.set(bid, [list[0]]);
    }
  }

  // Chụp lại trạng thái snapshot TRƯỚC khi đẩy (các vòng lặp bên dưới cập nhật index).
  const serverHadCategories = catIndex.size > 0;
  const serverHadDishes = dishIndex.size > 0;

  // 3a. PUSH upsert danh mục (trước món, vì món tham chiếu danh mục)
  //     Seed chưa sửa + server ĐÃ có dữ liệu + server không có bản này
  //     => bản này đã bị xoá trên server: không đẩy lên lại, gom để xoá local ở bước 4c.
  const seedCatsToDrop: string[] = [];
  for (const local of localCats) {
    if (local.syncStatus !== SYNC_STATUS.pending || local.isDeleted) continue;
    const remote = catIndex.get(local.id)?.[0];
    const untouchedSeed = isUntouchedSeed(local);
    if (!remote && untouchedSeed && serverHadCategories) {
      seedCatsToDrop.push(local.id);
      continue;
    }
    try {
      const parsed = remote ? fromRemoteCategory(remote) : null;
      if (remote && parsed && (parsed.updatedAt > local.updatedAt || untouchedSeed)) {
        // Last-Write-Wins: bản trên server mới hơn (vd: seed chạy lại sau khi cài lại app)
        await writeTransaction(async (tx) => {
          await tx.runAsync(
            `UPDATE ${SQL.T.category} SET ${SQL.c.syncStatus} = 'synced'
             WHERE ${SQL.c.id} = ? AND ${SQL.c.localVersion} = ?`,
            [local.id, local.localVersion],
          );
          await catRepo.upsertCategoryFromRemote(tx, parsed, remote.id);
        });
        report.pulled++;
        continue;
      }
      const body = toRemoteCategory(local);
      const saved = remote ? await updateRecord(R.categories, remote.id, body) : await createRecord(R.categories, body);
      catIndex.set(local.id, [saved]);
      await writeTransaction((tx) => catRepo.markCategorySynced(tx, local.id, saved.id, local.localVersion));
      report.pushed++;
    } catch (e) {
      rethrowIfNetwork(e);
      report.errors.push(`category ${local.name}: ${errText(e)}`);
      await writeTransaction((tx) => catRepo.setCategorySyncError(tx, local.id, errText(e)));
    }
  }

  // 3b. PUSH upsert món ăn (ảnh đi kèm trong payload)
  for (const local of localDishes) {
    if (local.syncStatus !== SYNC_STATUS.pending || local.isDeleted) continue;
    const remote = dishIndex.get(local.id)?.[0];
    const untouchedSeed = isUntouchedSeed(local);
    if (!remote && untouchedSeed && serverHadDishes) {
      // Món mẫu đã bị xoá trên server (vd: xoá rồi cài lại app) => bỏ ở local, không POST lại
      await writeTransaction((tx) => dishRepo.purgeDish(tx, local.id));
      report.deletedLocal++;
      continue;
    }
    try {
      const parsed = remote ? fromRemoteDish(remote) : null;
      if (remote && parsed && (parsed.updatedAt > local.updatedAt || untouchedSeed)) {
        await writeTransaction(async (tx) => {
          await tx.runAsync(
            `UPDATE ${SQL.T.dish} SET ${SQL.c.syncStatus} = 'synced'
             WHERE ${SQL.c.id} = ? AND ${SQL.c.localVersion} = ?`,
            [local.id, local.localVersion],
          );
          await dishRepo.upsertDishFromRemote(tx, parsed, remote.id);
        });
        report.pulled++;
        continue;
      }
      const body = toRemoteDish(local);
      const saved = remote ? await updateRecord(R.dishes, remote.id, body) : await createRecord(R.dishes, body);
      dishIndex.set(local.id, [saved]);
      await writeTransaction((tx) => dishRepo.markDishSynced(tx, local.id, saved.id, local.localVersion));
      report.pushed++;
    } catch (e) {
      rethrowIfNetwork(e);
      report.errors.push(`dish ${local.name}: ${errText(e)}`);
      await writeTransaction((tx) => dishRepo.setDishSyncError(tx, local.id, errText(e)));
    }
  }

  // 4a. PUSH delete món (tombstone)
  for (const local of localDishes) {
    if (!local.isDeleted || local.syncStatus !== SYNC_STATUS.pending) continue;
    try {
      for (const r of dishIndex.get(local.id) ?? []) {
        await deleteRecord(R.dishes, r.id);
        report.deletedRemote++;
      }
      dishIndex.delete(local.id);
      await writeTransaction((tx) => dishRepo.purgeDish(tx, local.id));
    } catch (e) {
      rethrowIfNetwork(e);
      report.errors.push(`delete dish ${local.name}: ${errText(e)}`);
    }
  }

  // 4b. PUSH delete danh mục
  for (const local of localCats) {
    if (!local.isDeleted || local.syncStatus !== SYNC_STATUS.pending) continue;
    try {
      for (const r of catIndex.get(local.id) ?? []) {
        await deleteRecord(R.categories, r.id);
        report.deletedRemote++;
      }
      catIndex.delete(local.id);
      // FK RESTRICT: nếu còn món (kể cả món chờ xoá) tham chiếu, lệnh này lỗi và để lượt sau.
      await writeTransaction((tx) => catRepo.purgeCategory(tx, local.id));
    } catch (e) {
      rethrowIfNetwork(e);
      report.errors.push(`delete category ${local.name}: ${errText(e)}`);
    }
  }

  // 4c. Danh mục mẫu đã bị xoá trên server: xoá local nếu không còn món nào dùng;
  //     nếu vẫn còn món tham chiếu thì giữ lại và đẩy lên (toàn vẹn dữ liệu quan trọng hơn).
  for (const id of seedCatsToDrop) {
    const used = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT COUNT(*) AS n FROM ${SQL.T.dish} WHERE ${SQL.c.dishCategoryId} = ?`,
      [id],
    );
    if (Number(used?.n ?? 0) === 0) {
      await writeTransaction((tx) => catRepo.purgeCategory(tx, id));
      report.deletedLocal++;
    } else {
      await writeTransaction((tx) => catRepo.markCategoryPending(tx, id)); // LocalVersion tăng => lượt sau đẩy lên
    }
  }

  // 5. PULL / MERGE — đọc lại trạng thái local mới nhất
  localCats = await catRepo.listAllCategoriesForSync(db);
  localDishes = await dishRepo.listAllDishesForSync(db);
  const localCatMap = new Map(localCats.map((c) => [c.id, c]));
  const localDishMap = new Map(localDishes.map((d) => [d.id, d]));

  // 5a. Danh mục từ server -> local
  for (const [bid, [remote]] of catIndex) {
    const parsed = fromRemoteCategory(remote);
    if (!parsed) {
      report.skipped++;
      continue;
    }
    const local = localCatMap.get(bid);
    if (local && (local.syncStatus === SYNC_STATUS.pending || local.isDeleted)) continue;
    if (local && local.remoteId === remote.id && categorySignature(local) === categorySignature(parsed)) continue;
    try {
      await writeTransaction((tx) => catRepo.upsertCategoryFromRemote(tx, parsed, remote.id));
      report.pulled++;
    } catch (e) {
      report.skipped++;
      report.errors.push(`pull category ${parsed.name}: ${errText(e)}`);
    }
  }

  // 5b. Món từ server -> local
  for (const [bid, [remote]] of dishIndex) {
    const parsed = fromRemoteDish(remote);
    if (!parsed) {
      report.skipped++;
      continue;
    }
    const local = localDishMap.get(bid);
    if (local && (local.syncStatus === SYNC_STATUS.pending || local.isDeleted)) continue;
    if (local && local.remoteId === remote.id && dishSignature(local) === dishSignature(parsed)) continue;
    try {
      const applied = await writeTransaction((tx) => dishRepo.upsertDishFromRemote(tx, parsed, remote.id));
      if (applied) report.pulled++;
    } catch (e) {
      // Ví dụ: món tham chiếu danh mục không tồn tại (FK), hoặc trùng tên với món local đang chờ.
      report.skipped++;
      report.errors.push(`pull dish ${parsed.name}: ${errText(e)}`);
    }
  }

  // 5c. Bản ghi đã Synced nhưng server không còn => đã bị xoá ở nơi khác => xoá local.
  for (const local of localDishes) {
    if (local.syncStatus !== SYNC_STATUS.synced || dishIndex.has(local.id)) continue;
    await writeTransaction((tx) => dishRepo.purgeDish(tx, local.id));
    report.deletedLocal++;
  }
  for (const local of localCats) {
    if (local.syncStatus !== SYNC_STATUS.synced || catIndex.has(local.id)) continue;
    const inUse = await catRepo.countActiveDishesInCategory(db, local.id);
    if (inUse > 0) {
      // Không thể xoá vì còn món dùng => đẩy danh mục lên lại để giữ toàn vẹn dữ liệu.
      await writeTransaction((tx) => catRepo.markCategoryPending(tx, local.id));
    } else {
      try {
        await writeTransaction((tx) => catRepo.purgeCategory(tx, local.id));
        report.deletedLocal++;
      } catch (e) {
        report.errors.push(`purge category ${local.name}: ${errText(e)}`);
      }
    }
  }

  await writeTransaction(async (tx) => {
    await setSetting(tx, SETTING_KEYS.lastSyncAt, String(Date.now()));
    await setSetting(tx, SETTING_KEYS.lastSyncBaseUrl, MOCKAPI_BASE_URL);
  });

  return report;
}
