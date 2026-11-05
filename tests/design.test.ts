import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
test('設計は安全性と配布制約を定義する', () => {
 const design = readFileSync('docs/DESIGN.md','utf8');
 for (const required of ['自動投稿','280','WebView2','windows-latest','手動添付']) expect(design).toContain(required);
});
