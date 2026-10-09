/**
 * Impor data ekspor CSV ke project Supabase APaPSI.
 *
 *   node scripts/import-csv.mjs <students.csv> <assessments.csv>
 *
 * Catatan penting:
 *  - assessment CSV merujuk ke rubrik versi dari project lama. Versi itu
 *    dipetakan ke rubrik aktif yang ada di project ini, karena keduanya
 *    memakai kode aspek dan pertemuan yang sama.
 *  - Id mahasiswa dipertahankan supaya assessment tetap connect.
 */
import { readFile } from "node:fs/promises";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.");
  process.exit(1);
}

const [studentsPath, assessmentsPath] = process.argv.slice(2);
if (!studentsPath || !assessmentsPath) {
  console.error("Pemakaian: node scripts/import-csv.mjs <students.csv> <assessments.csv>");
  process.exit(1);
}

/** CSV Apepsi diekspor dengan titik koma dan-kutip yang digandakan. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ";") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

function toObjects(text) {
  const [header, ...body] = parseCsv(text);
  return body.map((cells) =>
    Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""])),
  );
}

async function rest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...options.headers,
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${body}`);
  return body ? JSON.parse(body) : null;
}

const students = toObjects(await readFile(studentsPath, "utf8"));
const assessments = toObjects(await readFile(assessmentsPath, "utf8"));

console.log(`Membaca ${students.length} mahasiswa, ${assessments.length} penilaian.`);

// Rubrik aktif di project ini adalah acuan untuk semua penilaian.
const [activeVersion] = await rest("assessment_versions?state=eq.active&select=id,number,label");
if (!activeVersion) throw new Error("Tidak ada rubrik aktif. Buka aplikasi sekali untuk membuatnya.");
console.log(`Rubrik aktif: #${activeVersion.number} ${activeVersion.label} (${activeVersion.id})`);

const studentRows = students.map((s) => ({
  id: s.id,
  npm: s.npm,
  name: s.name,
  rombel_id: Number(s.rombel_id),
  study_case: s.study_case ?? "",
  active: s.active === "true",
  created_at: s.created_at || new Date().toISOString(),
  updated_at: s.updated_at || new Date().toISOString(),
}));

const insertedStudents = await rest("students", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(studentRows),
});
console.log(`Mahasiswa: ${studentRows.length} baris dikirim.`);

const known = new Set(studentRows.map((s) => s.id));
const assessmentRows = [];
const skipped = [];

for (const a of assessments) {
  if (!known.has(a.student_id)) { skipped.push(a.student_id); continue; }
  let data;
  try {
    data = JSON.parse(a.data);
  } catch (error) {
    skipped.push(`${a.student_id} (JSON rusak: ${error.message})`);
    continue;
  }
  assessmentRows.push({
    id: a.id,
    student_id: a.student_id,
    version_id: activeVersion.id,
    data,
    state: a.state === "verified" ? "verified" : "draft",
    revision: Number(a.revision) || 1,
    updated_at: a.updated_at || new Date().toISOString(),
    updated_by: null,
  });
}

await rest("assessments", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(assessmentRows),
});
console.log(`Penilaian: ${assessmentRows.length} baris dikirim.`);

if (skipped.length) console.log(`Dilewati: ${skipped.length} (${skipped.join(", ")})`);

const [{ count: totalStudents }] = await rest("students?select=id", { headers: { Prefer: "count=exact", Range: "0-0" } }).catch(() => [{ count: "?" }]);
console.log("Selesai.");