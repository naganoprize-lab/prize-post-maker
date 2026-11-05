import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readExcel, filterSchedule } from "../src/excel";
const path = process.env.EXCEL_FIXTURE_PATH;
test.skipIf(!path)("添付実ファイルを読取専用で検証する", async () => {
  const before = readFileSync(path!);
  const hash = createHash("sha256").update(before).digest("hex");
  const rows = await readExcel(
    new Uint8Array(before),
    "入替指示書_マクロ版.xlsm",
  );
  expect(rows).toHaveLength(135);
  expect(filterSchedule(rows, "2026-11-05")).toHaveLength(8);
  expect(
    rows.every(
      (p) =>
        p.excel!.rowNumber! >= 2 && p.arrivalDate === "" && p.status === "予定",
    ),
  ).toBe(true);
  expect(createHash("sha256").update(readFileSync(path!)).digest("hex")).toBe(
    hash,
  );
});
