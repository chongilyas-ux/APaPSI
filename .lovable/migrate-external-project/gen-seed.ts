// One-off generator: reproduces the original server/seed.ts against the recovered spreadsheets
// and emits SQL INSERT statements. Run with: bun .lovable/migrate-external-project/gen-seed.ts
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { initialConfig, emptyData, slotKey, type AssessmentData } from "../../src/lib/domain";

const DIR = new URL("./source/src/imports/", import.meta.url).pathname;
const OUT = new URL("./seed.sql", import.meta.url).pathname;

function value(sheet: ExcelJS.Worksheet, row: number, column: number): any {
  const cell = sheet.getCell(row, column);
  if (cell.type === ExcelJS.ValueType.Formula) return cell.result ?? "";
  const v: any = cell.value ?? "";
  // Rich-text cells: the original seed stringified these as "[object Object]".
  if (v && typeof v === "object" && Array.isArray(v.richText))
    return v.richText.map((r: { text: string }) => r.text).join("");
  if (v && typeof v === "object" && "text" in v) return String(v.text);
  return v;
}
const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";

const out: string[] = [];
const versionId = randomUUID();
out.push(
  `INSERT INTO public.assessment_versions(id,number,label,config,state) VALUES(${q(versionId)},1,${q(initialConfig.label)},${q(JSON.stringify(initialConfig))}::jsonb,'active');`,
);

const book = new ExcelJS.Workbook();
await book.xlsx.readFile(DIR + "Salinan_Studi_Kasus_Prak_APSI_Angkatan_24.xlsx");
let mayaStudyCase = "";
const students: { id: string; npm: string; rombel: number }[] = [];
for (const sheet of book.worksheets) {
  const rombel = Number(sheet.name.match(/\d/)?.[0]);
  for (let row = 2; row <= sheet.rowCount; row++) {
    const rawNpm = value(sheet, row, 2);
    if (!rawNpm) continue;
    const npm = typeof rawNpm === "number" ? rawNpm.toFixed(0) : String(rawNpm).trim();
    if (!/^\d{10}$/.test(npm)) throw new Error(`NPM sumber tidak valid: ${sheet.name}, baris ${row}.`);
    const name = String(value(sheet, row, 3)).trim();
    let studyCase = String(value(sheet, row, 4)).trim();
    if (npm === "2440508065" && rombel === 1) {
      mayaStudyCase = studyCase;
      continue;
    }
    if (npm === "2440508065") studyCase = mayaStudyCase || studyCase;
    const id = randomUUID();
    students.push({ id, npm, rombel });
    out.push(
      `INSERT INTO public.students(id,npm,name,rombel_id,study_case) VALUES(${q(id)},${q(npm)},${q(name)},${rombel},${q(studyCase)});`,
    );
  }
}

const ab = new ExcelJS.Workbook();
await ab.xlsx.readFile(DIR + "PENILAIAN_PRAK_APSI_ROMBEL_2.xlsx");
const rombel2 = students.filter((s) => s.rombel === 2).sort((a, b) => a.npm.localeCompare(b.npm));
const first = ab.getWorksheet("A1")!;
let drafts = 0;
for (const student of rombel2) {
  let sourceRow = 0;
  for (let row = 4; row <= first.rowCount; row++) if (String(value(first, row, 1)) === student.npm) sourceRow = row;
  if (!sourceRow) throw new Error("Mahasiswa penilaian sumber tidak ditemukan: " + student.npm);
  const data: AssessmentData = {
    ...emptyData(),
    legacy: true,
    warnings: [
      "Import Excel: sel kosong bukan bukti penilaian selesai. Periksa dan lengkapi seluruh komponen sebelum mengesahkan.",
    ],
  };
  for (let m = 0; m < 5; m++) {
    for (let s = 0; s < 2; s++) {
      const column = 3 + m * 2 + s;
      const time = value(first, sourceRow, column);
      const content = value(ab.getWorksheet("A2")!, sourceRow, column);
      if (time !== "" || content !== "")
        data.submissions[slotKey(`meeting-${m + 1}`, s === 0 ? "lab" : "rumah")] = {
          time: time === 1 ? "late" : "",
          content: content === 1 ? "lacking" : "",
        };
    }
    const score = value(ab.getWorksheet("D1")!, sourceRow, 3 + m);
    if (typeof score === "number") data.meetings[`meeting-${m + 1}`] = { score, excused: false };
  }
  for (let i = 0; i < 8; i++) {
    const count = value(ab.getWorksheet("D2")!, sourceRow, i + 3);
    if (typeof count === "number") data.violations[`P${i + 1}`] = count;
  }
  if (sourceRow === 4)
    data.warnings.push(
      "Skor D1 dan input D2 pada baris ini diberi label contoh di Excel. Jangan sahkan sebelum memverifikasi.",
    );
  drafts++;
  out.push(
    `INSERT INTO public.assessments(student_id,version_id,data) SELECT s.id,v.id,${q(JSON.stringify(data))}::jsonb FROM public.students s, public.assessment_versions v WHERE s.npm=${q(student.npm)} AND v.number=1;`,
  );
}

const counts = [1, 2, 3, 4].map((r) => students.filter((s) => s.rombel === r).length);
out.push(
  `INSERT INTO public.import_batches(source,report) VALUES(${q("Lampiran awal APaPSI")},${q(
    JSON.stringify({
      students: students.length,
      rombels: counts,
      drafts,
      decisions: [
        "Maya dipindahkan ke Rombel 2; studi kasus dipertahankan",
        "Baris kosong diabaikan",
        "Nico: studi kasus belum diisi",
        "Nilai contoh diberi peringatan",
        "Sel kosong tetap belum dinilai",
      ],
    }),
  )}::jsonb);`,
);
await Bun.write(OUT, out.join("\n") + "\n");
console.error(`students=${students.length} rombels=${counts.join(",")} drafts=${drafts}`);
