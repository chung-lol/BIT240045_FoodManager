/**
 * Kiểm thử tự động phần lõi (không cần điện thoại/emulator):
 *   SQLite thật (node:sqlite) + MockAPI giả lập + code nghiệp vụ THẬT của app.
 * Chạy:  npm run test:logic
 *
 * Mỗi test tương ứng một test case trong docs/TEST_CASES.md (TCxx).
 */
import { DatabaseSync } from 'node:sqlite';
import { testHandle } from 'expo-sqlite';
import { MOCKAPI_RESOURCES } from '@/config/appConfig';
import { getDb, writeTransaction } from '@/database/database';
import { COLS, MIGRATIONS, PREFIX, SQL, TABLES } from '@/database/schema';
import { seedIfNeeded } from '@/database/seed';
import type { DishFormInput } from '@/models';
import { countPending } from '@/repositories/dishRepository';
import { inspectSchema } from '@/repositories/schemaInspector';
import { CategoryInUseError, deleteCategory, getCategories, saveCategory } from '@/services/categoryService';
import { applyDishFilters, speedLabel } from '@/services/dishQuery';
import { changeThumbnail, createDish, deleteDish, getAllDishes, getDish, updateDish } from '@/services/dishService';
import { ValidationError } from '@/services/validationService';
import { DEFAULT_FILTERS } from '@/store/filterStore';
import { runSyncOnce } from '@/sync/syncEngine';
import { parseMoney, searchKey } from '@/utils/text';
import { FakeMockApi } from './fakeMockApi';

// ------------------------------------------------------------------ mini test runner
const results: { name: string; ok: boolean; error?: string }[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) });
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq<T>(actual: T, expected: T, msg: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${msg}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`);
}
async function expectValidation(p: Promise<unknown>, field: string, key: string) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ValidationError) {
      const got = (e.fields as Record<string, { key: string }>)[field]?.key;
      eq(got, key, `field ${field}`);
      return;
    }
    throw e;
  }
  throw new Error(`expected ValidationError ${field}.${key}`);
}

// ------------------------------------------------------------------ environment
const BASE = 'https://test-project.mockapi.io/api/v1';
const R = MOCKAPI_RESOURCES;
const api = new FakeMockApi(BASE, [R.categories, R.dishes]);
(globalThis as { fetch: unknown }).fetch = api.fetch;

const form = (over: Partial<DishFormInput> = {}): DishFormInput => ({
  name: 'Test Dish',
  description: '',
  price: '40000',
  preparationTime: '12',
  isAvailable: true,
  dishCategoryId: 'seed-cat-main',
  images: [],
  ...over,
});
const remoteDishes = () => api.all(R.dishes);
const remoteByName = (name: string) => remoteDishes().filter((d) => d[COLS.name] === name);
const pending = async () => countPending(await getDb());

/** Giả lập gỡ app & cài lại: file SQLite mới tinh, chạy lại migration. */
function reinstallApp() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(MIGRATIONS[0]);
  raw.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
  testHandle.db!.raw = raw;
}

async function main() {
  await getDb();
  await seedIfNeeded();

  // ================================================================ DATABASE
  await test('DB01 Mọi bảng/cột/index có tiền tố MSSV (MSSV toàn chữ số vẫn chạy)', async () => {
    const report = await inspectSchema(await getDb());
    assert(PREFIX === '2251172999_', 'test dùng MSSV số');
    assert(report.allPrefixed, 'có tên chưa có tiền tố: ' + JSON.stringify(report.tables.map((t) => t.name)));
    eq(report.tables.length, Object.keys(TABLES).length, 'số bảng');
  });

  await test('DB02 PRAGMA foreign_keys đang BẬT', async () => {
    const report = await inspectSchema(await getDb());
    assert(report.foreignKeysEnabled, 'foreign_keys OFF');
  });

  await test('DB03 Seed đúng 3 danh mục / 15 món và KHÔNG seed lại lần 2', async () => {
    const again = await seedIfNeeded();
    eq(again, false, 'seed lần 2');
    eq((await getCategories()).length, 3, 'số danh mục');
    eq((await getAllDishes()).length, 15, 'số món');
  });

  await test('DB04 SQLite tự chặn Price <= 0 (CHECK) kể cả khi bỏ qua service', async () => {
    let failed = false;
    try {
      await writeTransaction((db) =>
        db.runAsync(`UPDATE ${SQL.T.dish} SET ${SQL.c.price} = 0 WHERE ${SQL.c.id} = 'seed-dish-lemon-tea'`),
      );
    } catch {
      failed = true;
    }
    assert(failed, 'CHECK price > 0 không hoạt động');
  });

  await test('DB05 Khoá ngoại chặn món trỏ tới danh mục không tồn tại', async () => {
    let failed = false;
    try {
      await writeTransaction((db) =>
        db.runAsync(`UPDATE ${SQL.T.dish} SET ${SQL.c.dishCategoryId} = 'nope' WHERE ${SQL.c.id} = 'seed-dish-lemon-tea'`),
      );
    } catch {
      failed = true;
    }
    assert(failed, 'FK không hoạt động');
  });

  await test('DB06 Unique index chặn 2 thumbnail cho cùng 1 món', async () => {
    let failed = false;
    try {
      await writeTransaction((db) =>
        db.runAsync(`UPDATE ${SQL.T.image} SET ${SQL.c.isThumbnail} = 1 WHERE ${SQL.c.dishId} = 'seed-dish-chicken-rice'`),
      );
    } catch {
      failed = true;
    }
    assert(failed, 'partial unique index thumbnail không hoạt động');
  });

  // ================================================================ VALIDATION
  await test('TC01 Tên toàn khoảng trắng => lỗi', () => expectValidation(createDish(form({ name: '   ' })), 'name', 'nameRequired'));
  await test('TC02a Giá = 0 => lỗi', () => expectValidation(createDish(form({ price: '0' })), 'price', 'pricePositive'));
  await test('TC02b Giá âm => lỗi', () => expectValidation(createDish(form({ price: '-5' })), 'price', 'pricePositive'));
  await test('TC02c Giá chữ => lỗi', () => expectValidation(createDish(form({ price: 'abc' })), 'price', 'priceInvalid'));
  await test('TC03a Thời gian = 0 => lỗi', () =>
    expectValidation(createDish(form({ preparationTime: '0' })), 'preparationTime', 'timePositive'));
  await test('TC03b Thời gian 12.5 => lỗi (phải là số nguyên phút)', () =>
    expectValidation(createDish(form({ preparationTime: '12.5' })), 'preparationTime', 'timeInvalid'));
  await test('TC04 Danh mục không tồn tại => lỗi', () =>
    expectValidation(createDish(form({ dishCategoryId: 'ghost' })), 'dishCategoryId', 'categoryNotFound'));
  await test('TC05 Trùng tên trong cùng danh mục (khác hoa/thường, thừa khoảng trắng) => lỗi', () =>
    expectValidation(createDish(form({ name: '  chicken   RICE ' })), 'name', 'duplicateDishName'));
  await test('TC05b Trùng tên tiếng Việt có dấu viết HOA => lỗi', async () => {
    await createDish(form({ name: 'Phở bò', dishCategoryId: 'seed-cat-main' }));
    await expectValidation(createDish(form({ name: 'PHỞ  BÒ' })), 'name', 'duplicateDishName');
  });
  await test('TC06 Cùng tên nhưng khác danh mục => cho phép', async () => {
    const id = await createDish(form({ name: 'Chicken Rice', dishCategoryId: 'seed-cat-appetizer' }));
    assert(await getDish(id), 'không tạo được');
  });
  await test('TC06b Sửa món giữ nguyên tên của chính nó => không báo trùng', async () => {
    const d = (await getDish('seed-dish-beef-noodles'))!;
    await updateDish(d.id, form({ name: d.name, price: '56000', dishCategoryId: d.dishCategoryId }));
    eq((await getDish(d.id))!.price, 56000, 'giá sau sửa');
  });
  await test('VAL Ảnh: URL sai / trùng URL => lỗi', async () => {
    await expectValidation(
      createDish(form({ name: 'Img A', images: [{ imageUrl: 'not-a-url', isThumbnail: true }] })),
      'images',
      'imageUrlInvalid',
    );
    await expectValidation(
      createDish(
        form({
          name: 'Img B',
          images: [
            { imageUrl: 'https://x.com/a.jpg', isThumbnail: true },
            { imageUrl: 'https://X.com/a.jpg', isThumbnail: false },
          ],
        }),
      ),
      'images',
      'imageUrlDuplicate',
    );
  });

  // ================================================================ CATEGORY / DELETE
  await test('TC09 Xoá danh mục đang có món => từ chối', async () => {
    let err: unknown;
    try {
      await deleteCategory('seed-cat-main');
    } catch (e) {
      err = e;
    }
    assert(err instanceof CategoryInUseError, 'phải ném CategoryInUseError');
    assert((await getCategories()).some((c) => c.id === 'seed-cat-main'), 'danh mục vẫn phải còn');
  });
  await test('CAT Xoá danh mục rỗng => được; tên danh mục trùng => lỗi', async () => {
    const id = await saveCategory({ name: 'Desserts', description: '' });
    await expectValidation(saveCategory({ name: ' desserts ', description: '' }), 'name', 'duplicateCategoryName');
    await deleteCategory(id);
    assert(!(await getCategories()).some((c) => c.id === id), 'chưa xoá');
  });
  await test('TC08 Xoá món => biến mất khỏi danh sách', async () => {
    const id = await createDish(form({ name: 'To Be Deleted' }));
    await deleteDish(id);
    assert(!(await getAllDishes()).some((d) => d.id === id), 'vẫn còn trong danh sách');
    eq(await getDish(id), null, 'getDish phải trả null (Not Found)');
  });
  await test('TC17 ID không tồn tại => null (màn hình Not Found)', async () => {
    eq(await getDish('does-not-exist-123'), null, 'getDish');
  });

  // ================================================================ IMAGES
  await test('TC10 Đổi thumbnail: luôn đúng 1 ảnh đại diện', async () => {
    const before = (await getDish('seed-dish-chicken-rice'))!;
    const target = before.images[2];
    await changeThumbnail(before.id, target.id);
    const after = (await getDish(before.id))!;
    eq(after.images.filter((i) => i.isThumbnail).map((i) => i.id), [target.id], 'thumbnail');
  });
  await test('IMG Tạo món nhiều ảnh không chọn thumbnail => ảnh đầu tự thành thumbnail', async () => {
    const id = await createDish(
      form({
        name: 'Multi Image',
        images: [
          { imageUrl: 'https://x.com/1.jpg', isThumbnail: false },
          { imageUrl: 'https://x.com/2.jpg', isThumbnail: false },
        ],
      }),
    );
    const d = (await getDish(id))!;
    eq(d.images.map((i) => i.isThumbnail), [true, false], 'thumbnail mặc định');
  });

  // ================================================================ FILTER / SORT / LABEL
  await test('TC11/12 Quick khi <=15 phút, Regular khi >15', () => {
    eq([speedLabel(15), speedLabel(16), speedLabel(1)], ['quick', 'regular', 'quick'], 'nhãn');
  });
  await test('TC13 Lọc "đang bán" ẩn món ngừng bán; "tất cả" vẫn thấy', async () => {
    const all = await getAllDishes();
    const avail = applyDishFilters(all, { ...DEFAULT_FILTERS, status: 'available' }).items;
    assert(!avail.some((d) => d.name === 'French Fries'), 'French Fries phải bị ẩn');
    assert(applyDishFilters(all, DEFAULT_FILTERS).items.some((d) => d.name === 'French Fries'), 'Tất cả phải thấy');
  });
  await test('TC14 Kết hợp tìm kiếm + danh mục + trạng thái + giá + sắp xếp (AND)', async () => {
    const all = await getAllDishes();
    const r = applyDishFilters(all, {
      search: 'RICE',
      categoryId: 'seed-cat-main',
      status: 'available',
      minPrice: '20.000',
      maxPrice: '60000',
      sort: 'priceDesc',
    });
    eq(r.items.map((d) => d.name), ['Chicken Rice'], 'kết quả');
    eq(r.priceError, null, 'không lỗi giá');
  });
  await test('TC14b Sắp xếp giá tăng/giảm, thời gian tăng', async () => {
    const all = (await getAllDishes()).filter((d) => d.dishCategoryId === 'seed-cat-appetizer' || d.dishCategoryId === 'seed-cat-drink');
    const by = (sort: typeof DEFAULT_FILTERS.sort) => applyDishFilters(all, { ...DEFAULT_FILTERS, sort }).items.map((d) => d.price);
    const asc = by('priceAsc');
    eq([...asc].sort((a, b) => a - b), asc, 'tăng dần');
    const desc = by('priceDesc');
    eq([...desc].sort((a, b) => b - a), desc, 'giảm dần');
    const times = applyDishFilters(all, { ...DEFAULT_FILTERS, sort: 'timeAsc' }).items.map((d) => d.preparationTime);
    eq([...times].sort((a, b) => a - b), times, 'thời gian tăng');
  });
  await test('TC16 Min > Max => báo lỗi và bỏ qua điều kiện giá', async () => {
    const all = await getAllDishes();
    const r = applyDishFilters(all, { ...DEFAULT_FILTERS, minPrice: '60000', maxPrice: '20000' });
    eq(r.priceError?.key, 'priceRangeInvalid', 'lỗi');
    eq(r.items.length, all.length, 'không lọc theo giá');
  });
  await test('SEARCH Tìm không dấu ra món có dấu ("pho bo" => "Phở bò")', async () => {
    const r = applyDishFilters(await getAllDishes(), { ...DEFAULT_FILTERS, search: 'pho bo' });
    eq(r.items.map((d) => d.name), ['Phở bò'], 'kết quả');
    eq(searchKey('ĐẶC BIỆT'), 'dac biet', 'searchKey');
  });
  await test('PARSE parseMoney chấp nhận 45.000 / 45,000 / 45000, từ chối 1e3', () => {
    eq([parseMoney('45.000'), parseMoney('45,000'), parseMoney('45000')], [45000, 45000, 45000], 'parse');
    assert(Number.isNaN(parseMoney('1e3')), '1e3 phải NaN');
  });

  // ================================================================ SYNC
  await test('SYNC01 Lần đồng bộ đầu đẩy toàn bộ dữ liệu lên MockAPI, hết Pending', async () => {
    await runSyncOnce();
    eq(api.all(R.categories).length, 3, 'số danh mục trên server');
    eq(remoteDishes().length, (await getAllDishes()).length, 'số món trên server = local');
    eq(await pending(), 0, 'pending');
    const sample = remoteByName('Chicken Rice')[0];
    assert(sample && typeof sample[COLS.price] === 'number', 'field trên MockAPI phải có tiền tố MSSV');
  });

  await test('SYNC02 Đồng bộ lặp lại nhiều lần không sinh bản ghi trùng', async () => {
    const n = remoteDishes().length;
    await runSyncOnce();
    await runSyncOnce();
    eq(remoteDishes().length, n, 'số món');
  });

  await test('TC19/20 Offline thêm món => lưu local, Pending; có mạng => tự lên MockAPI', async () => {
    api.offline = true;
    const id = await createDish(form({ name: 'Offline Soup', price: '35000' }));
    assert(await getDish(id), 'phải lưu được khi offline');
    assert((await pending()) >= 1, 'phải Pending');
    let threw = false;
    try {
      await runSyncOnce();
    } catch {
      threw = true;
    }
    assert(threw, 'sync khi offline phải dừng');
    assert(await getDish(id), 'dữ liệu pending không được mất');
    api.offline = false;
    await runSyncOnce();
    eq(remoteByName('Offline Soup').length, 1, 'đã lên server đúng 1 bản');
    eq(await pending(), 0, 'hết pending');
  });

  await test('TC21 Server ĐÃ tạo nhưng client timeout => retry KHÔNG tạo bản ghi thứ 2', async () => {
    await createDish(form({ name: 'Timeout Noodles', price: '42000' }));
    api.commitThenTimeoutOnce = 'POST';
    let threw = false;
    try {
      await runSyncOnce();
    } catch {
      threw = true;
    }
    assert(threw, 'lượt 1 phải gặp timeout');
    eq(remoteByName('Timeout Noodles').length, 1, 'server đã có 1 bản');
    assert((await pending()) >= 1, 'local vẫn Pending vì chưa xác nhận');
    await runSyncOnce();
    await runSyncOnce();
    eq(remoteByName('Timeout Noodles').length, 1, 'sau retry vẫn chỉ 1 bản');
    eq(await pending(), 0, 'hết pending');
  });

  await test('TC22 MockAPI lỗi 500 => không mất dữ liệu, lượt sau đồng bộ được', async () => {
    const id = await createDish(form({ name: 'Server Error Salad', dishCategoryId: 'seed-cat-appetizer' }));
    api.failStatusOnce = 500;
    try {
      await runSyncOnce();
    } catch {
      /* GET snapshot lỗi 500 => lượt dừng */
    }
    assert(await getDish(id), 'dữ liệu còn');
    await runSyncOnce();
    eq(remoteByName('Server Error Salad').length, 1, 'đã lên server');
  });

  await test('SYNC03 Offline sửa giá => có mạng thì MockAPI cập nhật giá mới', async () => {
    api.offline = true;
    const d = (await getDish('seed-dish-chicken-rice'))!;
    await updateDish(
      d.id,
      form({
        name: d.name,
        description: d.description,
        price: '50000',
        preparationTime: String(d.preparationTime),
        dishCategoryId: d.dishCategoryId,
        images: d.images,
      }),
    );
    eq((await getDish(d.id))!.price, 50000, 'local đổi ngay');
    api.offline = false;
    await runSyncOnce();
    const r = remoteDishes().filter((x) => x[COLS.id] === d.id);
    eq(r.length, 1, 'đúng 1 bản trên server');
    eq(r[0][COLS.price], 50000, 'giá trên server');
  });

  await test('SYNC04 Offline xoá => xoá trên server và KHÔNG "sống lại" sau khi kéo dữ liệu', async () => {
    api.offline = true;
    await deleteDish('seed-dish-lemon-tea');
    api.offline = false;
    await runSyncOnce();
    eq(remoteDishes().filter((x) => x[COLS.id] === 'seed-dish-lemon-tea').length, 0, 'server đã xoá');
    await runSyncOnce();
    eq(await getDish('seed-dish-lemon-tea'), null, 'local không sống lại');
  });

  await test('SYNC05 Người dùng sửa TRONG LÚC request đang bay => thay đổi mới không bị mất', async () => {
    const d = (await getDish('seed-dish-spring-rolls'))!;
    const input = (price: string) =>
      form({
        name: d.name,
        description: d.description,
        price,
        preparationTime: String(d.preparationTime),
        dishCategoryId: d.dishCategoryId,
        images: d.images,
      });
    await updateDish(d.id, input('31000'));
    let fired = false;
    api.beforeResponse = async (method, _res, body) => {
      if (!fired && method === 'PUT' && body?.[COLS.id] === d.id) {
        fired = true;
        await updateDish(d.id, input('32000')); // sửa tiếp khi PUT 31000 chưa trả về
      }
    };
    await runSyncOnce();
    api.beforeResponse = null;
    assert(fired, 'hook phải chạy');
    assert((await pending()) >= 1, 'bản 32000 phải còn Pending, không bị đánh dấu Synced nhầm');
    await runSyncOnce();
    eq(remoteDishes().find((x) => x[COLS.id] === d.id)?.[COLS.price], 32000, 'server có giá mới nhất');
    eq((await getDish(d.id))!.price, 32000, 'local giữ giá mới nhất');
  });

  await test('SYNC06 Dữ liệu sửa trên dashboard MockAPI được kéo về máy', async () => {
    api.patchWhere(R.dishes, COLS.id, 'seed-dish-beef-noodles', { [COLS.price]: 61000, [COLS.updatedAt]: Date.now() });
    await runSyncOnce();
    eq((await getDish('seed-dish-beef-noodles'))!.price, 61000, 'giá kéo về');
  });

  await test('SYNC07 Món bị xoá trên MockAPI => tự xoá ở máy', async () => {
    const id = await createDish(form({ name: 'Remote Deleted' }));
    await runSyncOnce();
    api.removeWhere(R.dishes, COLS.id, id);
    await runSyncOnce();
    eq(await getDish(id), null, 'đã xoá local');
  });

  await test('SYNC08 Server có bản ghi trùng (lỗi cũ) => tự dọn còn 1', async () => {
    const original = remoteDishes().find((x) => x[COLS.id] === 'seed-dish-french-fries')!;
    const { id: _ignored, ...copy } = original;
    api.insertRaw(R.dishes, copy);
    eq(remoteDishes().filter((x) => x[COLS.id] === 'seed-dish-french-fries').length, 2, 'đã tạo trùng');
    await runSyncOnce();
    eq(remoteDishes().filter((x) => x[COLS.id] === 'seed-dish-french-fries').length, 1, 'đã dọn trùng');
  });

  await test('SYNC09 Gỡ app cài lại: seed không ghi đè dữ liệu đã sửa trên server, không tạo trùng', async () => {
    const serverCountBefore = remoteDishes().length;
    reinstallApp();
    await seedIfNeeded(); // seed chạy lại với Id cố định + UpdatedAt cũ
    await runSyncOnce();
    eq(remoteDishes().length, serverCountBefore, 'server không có bản trùng');
    eq((await getDish('seed-dish-chicken-rice'))!.price, 50000, 'giữ giá đã sửa (50000), không về seed 45000');
    eq((await getDish('seed-dish-lemon-tea')), null, 'món đã xoá không sống lại');
    assert((await getAllDishes()).some((d) => d.name === 'Offline Soup'), 'món tạo từ trước được kéo về');
    eq(await pending(), 0, 'hết pending');
  });

  await test('SYNC10 Resource trên MockAPI bị xoá sạch => app đẩy lại dữ liệu, KHÔNG xoá dữ liệu máy', async () => {
    const localCount = (await getAllDishes()).length;
    api.clear(R.dishes);
    await runSyncOnce();
    eq((await getAllDishes()).length, localCount, 'local giữ nguyên');
    eq(remoteDishes().length, localCount, 'server được khôi phục');
  });

  await test('SYNC11 Danh mục mẫu đã xoá trên server không sống lại sau khi cài lại app', async () => {
    // Xoá toàn bộ đồ uống còn lại để danh mục Drinks trở thành danh mục rỗng.
    const drinks = (await getAllDishes()).filter((d) => d.dishCategoryId === 'seed-cat-drink');
    for (const drink of drinks) await deleteDish(drink.id);
    await runSyncOnce();
    await deleteCategory('seed-cat-drink');
    await runSyncOnce();
    eq(api.all(R.categories).filter((c) => c[COLS.id] === 'seed-cat-drink').length, 0, 'server đã xoá');
    reinstallApp();
    await seedIfNeeded();
    await runSyncOnce();
    eq(api.all(R.categories).filter((c) => c[COLS.id] === 'seed-cat-drink').length, 0, 'server không có lại');
    assert(!(await getCategories()).some((c) => c.id === 'seed-cat-drink'), 'local không có lại');
    eq(await pending(), 0, 'hết pending');
  });

  // ------------------------------------------------------------------ report
  const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  console.log('\n' + pad('RESULT', 8) + 'TEST');
  for (const r of results) {
    console.log(pad(r.ok ? 'PASS' : 'FAIL', 8) + r.name);
    if (!r.ok) console.log('        ' + (r.error ?? '').split('\n').slice(0, 6).join('\n        '));
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main();
