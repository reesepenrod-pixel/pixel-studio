// Architecture rule (ARCHITECTURE §3): the runtime and core must never depend on React or editor code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('../../src/', import.meta.url));
const files = (dir: string): string[] => {
  try { return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []; }); } catch { return []; }
};
const imports = (file: string) => [...readFileSync(file, 'utf8').matchAll(/\bfrom\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1] || m[2]);

describe('module boundaries', () => {
  for (const layer of ['engine', 'core']) {
    it(`src/${layer} imports no React, editor, app or component code`, () => {
      const bad = files(join(src, layer)).flatMap(f => imports(f).filter(i => /^react(-dom)?(\/|$)|\/(editors|app|components)\//.test(i)).map(i => `${f.slice(src.length)} → ${i}`));
      expect(bad).toEqual([]);
    });
  }
  it('src/core does not import src/engine', () => {
    const bad = files(join(src, 'core')).flatMap(f => imports(f).filter(i => /\/engine\//.test(i)).map(i => `${f.slice(src.length)} → ${i}`));
    expect(bad).toEqual([]);
  });
});
