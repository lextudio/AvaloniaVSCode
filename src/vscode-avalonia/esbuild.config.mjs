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
await build({
  entryPoints: [entry],
  outfile: path.join(outDir, 'extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  sourcemap: true,
  target: ['node18'],
  external: [
    'vscode',
    'vscode-languageclient/node',
    'bson'
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

console.log('esbuild bundling complete -> dist/extension.js');
