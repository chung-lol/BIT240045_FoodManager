/**
 * Đóng gói tests/logic.test.ts bằng esbuild rồi chạy bằng Node (>= 22.5, có node:sqlite).
 * Các module native của Expo được thay bằng shim trong tests/shims.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shim = (f) => path.join(root, 'tests/shims', f);
const replacements = {
  'expo-sqlite': shim('expo-sqlite.ts'),
  'expo-crypto': shim('expo-crypto.ts'),
  'expo-image': shim('expo-image.ts'),
  '@/config/appConfig': shim('appConfig.ts'),
};

const outfile = path.join(root, 'node_modules/.cache/logic-tests/bundle.cjs');
await build({
  entryPoints: [path.join(root, 'tests/logic.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile,
  tsconfig: path.join(root, 'tsconfig.json'),
  define: { __DEV__: 'false' },
  external: ['node:*'],
  logLevel: 'warning',
  plugins: [
    {
      name: 'expo-shims',
      setup(b) {
        b.onResolve({ filter: /^(expo-sqlite|expo-crypto|expo-image|@\/config\/appConfig)$/ }, (args) => ({
          path: replacements[args.path],
        }));
      },
    },
  ],
});

const r = spawnSync(process.execPath, ['--no-warnings', outfile], { stdio: 'inherit' });
process.exit(r.status ?? 1);
