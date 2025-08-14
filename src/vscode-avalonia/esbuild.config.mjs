#!/usr/bin/env node
import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync, existsSync } from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const outDir = path.join(root, 'out');
const entry = path.join(root, 'src', 'extension.ts');

// Clean output
if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir);

// Bundle extension entry (code-split disabled so single file)
// We keep CommonJS output so we don't need to mark the package as type=module.
// Dependencies like 'bson' ship ESM with top-level await; bundling them into CJS
// would trigger an esbuild error, so we externalize them and include their files
// via .vscodeignore whitelist.
await build({
  entryPoints: [entry],
  outfile: path.join(outDir, 'extension.js'),
  bundle: true,
  platform: 'node',
  sourcemap: true,
  external: [
    'vscode', // provided by VS Code at runtime
    'bson'    // left external (ESM with top-level await)
  ],
  minify: true,
  legalComments: 'none'
});

// Copy non-code assets required at runtime (language grammars, media, etc.)
const assets = [
  'AXAML.language-configuration.json',
  'AXAML.tmLanguage.json',
  'csharp.json',
  'media'
];
for (const a of assets) {
  const src = path.join(root, a);
  const dst = path.join(outDir, a);
  cpSync(src, dst, { recursive: true });
}

console.log('esbuild bundling complete -> out/extension.js');
