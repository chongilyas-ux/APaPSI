// Handler API server untuk penilaian CPMK 2. Tidak mengubah CPMK 1:
// semua query ke tabel assessments_cpmk2 yang terpisah; mahasiswa dipakai
// ulang dari tabel students yang sama.
import type { Ctx } from "../api.server";
import { HttpError, writeLogs, type LogRow } from "../api.server";
import {
  calculateCpmk2,
  emptyCpmk2Data,
  validateCpmk2,
  CPMK2_LABEL,
  type Cpmk2Data,
  type Cpmk2Result,
} from "./domain";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function must<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    console.error("[cpmk2] database error", result.error);
    throw new HttpError("Operasi database gagal. Tidak ada perubahan parsial yang disimpan.", 500);
  }
  return result.data;
}

function pick(data: any): Cpmk2Data {
  return {
    a: data?.a ?? {},
    b: data?.b ?? {},
    d1: data?.d1 ?? {},
    d2: Array.isArray(data?.d2) ? data.d2 : [],
    d2Reviewed: Boolean(data?.d2Reviewed),
  };
}

export type Cpmk2Student = {
  id: string;
  npm: string;
  name: string;
  rombel_id: number;
  study_case: string;
  active: boolean;
  assessment: {
    id: string;
    data: Cpmk2Data;
    state: "draft" | "verified";
    revision: number;
  } | null;
  result: Cpmk2Result;
};

export async function cpmk2StudentList(db: Ctx["db"]): Promise<Cpmk2Student[]> {
  const [students, assessments] = await Promise.all([
    db.from("students").select("*").eq("active", true).order("rombel_id").order("npm"),
    db.from("assessments_cpmk2").select("*"),
  ]);
  const byStudent = new Map(must(assessments).map((a) => [a.student_id, a]));
  return must(students).map((row) => {
    const a = byStudent.get(row.id);
    const data = a ? pick(a.data) : emptyCpmk2Data();
    const result = calculateCpmk2(data);
    return {
      id: row.id,
      npm: row.npm,
      name: row.name,
      rombel_id: row.rombel_id,
      study_case: row.study_case,
      active: row.active,
      assessment: a
        ? { id: a.id, data, state: a.state as "draft" | "verified", revision: a.revision }
        : null,
      result,
    };
  });
}

function cpmk2Logs(before: Cpmk2Data | null, after: Cpmk2Data, studentId: string, reason: string): LogRow[] {
  const rows: LogRow[] = [];
  const aBefore = before?.a ?? {};
  const aAfter = after.a;
  for (const week of Object.keys(aAfter)) {
    if (JSON.stringify(aBefore[week]) !== JSON.stringify(aAfter[week]))
      rows.push({ student: studentId, component: `CPMK2 · Pengumpulan minggu ${week}`, before: aBefore[week] ?? null, after: aAfter[week], reason });
  }
  const bBefore = before?.b ?? {};
  for (const code of Object.keys(after.b)) {
    if (JSON.stringify(bBefore[code]) !== JSON.stringify(after.b[code]))
      rows.push({ student: studentId, component: `CPMK2 · Skor ${code}`, before: bBefore[code] ?? null, after: after.b[code], reason });
  }
  const d1Before = before?.d1 ?? {};
  for (const week of Object.keys(after.d1)) {
    if (JSON.stringify(d1Before[week]) !== JSON.stringify(after.d1[week]))
      rows.push({ student: studentId, component: `CPMK2 · Kehadiran minggu ${week}`, before: d1Before[week] ?? null, after: after.d1[week], reason });
  }
  if (JSON.stringify(before?.d2 ?? []) !== JSON.stringify(after.d2))
    rows.push({ student: studentId, component: "CPMK2 · Catatan pelanggaran", before: before?.d2?.length ?? 0, after: after.d2.length, reason });
  if (before?.d2Reviewed !== after.d2Reviewed)
    rows.push({ student: studentId, component: "CPMK2 · D2 diperiksa", before: before?.d2Reviewed ?? false, after: after.d2Reviewed, reason });
  return rows;
}

export async function cpmk2SaveAssessment(
  ctx: Ctx,
  studentId: string,
  payload: { data: Cpmk2Data; revision: number; verify: boolean; reason?: string },
) {
  const student = must(
    await ctx.db.from("students").select("*").eq("id", studentId).eq("active", true).maybeSingle(),
  );
  if (!student) throw new HttpError("Mahasiswa tidak ditemukan.", 404);
  const before = must(await ctx.db.from("assessments_cpmk2").select("*").eq("student_id", student.id).maybeSingle());
  if (typeof payload?.verify !== "boolean" || !Number.isInteger(payload.revision) || payload.revision < 0)
    throw new HttpError("Status pengesahan atau revisi tidak valid.");
  if ((before?.revision ?? 0) !== payload.revision)
    throw new HttpError("Penilaian telah berubah di sesi lain. Input Anda tetap tersedia; buka ulang data terbaru sebelum menyimpan.", 409);
  const data = pick(payload.data);
  validateCpmk2(data);
  const calculation = calculateCpmk2(data);
  if (payload.verify && !calculation.complete)
    throw new HttpError(calculation.manualReview ? "D1 masih perlu tinjauan manual; tuntaskan terlebih dahulu sebelum mengesahkan." : "Penilaian belum lengkap.");
  const state = payload.verify ? "verified" : "draft";
  const revision = (before?.revision ?? 0) + 1;
  let row;
  if (before) {
    const updated = must(
      await ctx.db
        .from("assessments_cpmk2")
        .update({ data: data as never, state, revision, updated_by: ctx.userId })
        .eq("id", before.id)
        .eq("revision", before.revision)
        .select("*"),
    );
    if (!updated.length)
      throw new HttpError("Penilaian telah berubah di sesi lain. Input Anda tetap tersedia; buka ulang data terbaru sebelum menyimpan.", 409);
    row = updated[0];
  } else {
    const inserted = await ctx.db
      .from("assessments_cpmk2")
      .insert({ student_id: student.id, data: data as never, state, revision, updated_by: ctx.userId })
      .select("*")
      .single();
    if (inserted.error?.code === "23505") throw new HttpError("Penilaian telah berubah di sesi lain. Input tetap tersedia. Muat ulang halaman.", 409);
    row = must(inserted);
  }
  const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 1000) : "";
  const logs = cpmk2Logs(before ? pick(before.data) : null, data, student.id, reason);
  if (before?.state !== state)
    logs.push({ student: student.id, component: "CPMK2 · Status penilaian", before: before?.state ?? "belum dinilai", after: state });
  await writeLogs(ctx, logs);
  return { ...row, data, result: calculation };
}

// dipanggil dari handleApi
export async function handleCpmk2(ctx: Ctx, method: string, path: string, body: Record<string, any>, url: URL): Promise<Response | undefined> {
  if (path !== "/cpmk2/students" && !path.startsWith("/cpmk2/students/")) return undefined;
  const studentsMatch = path.match(/^\/cpmk2\/students\/([0-9a-f-]{36})\/assessment$/);
  if (path === "/cpmk2/students" && method === "GET") return json(await cpmk2StudentList(ctx.db));
  if (studentsMatch && method === "PUT") return json(await cpmk2SaveAssessment(ctx, studentsMatch[1], body));
  if (path === "/cpmk2/export" && method === "GET") return await cpmk2Export(ctx, url);
  throw new HttpError("Endpoint tidak ditemukan.", 404);
}

async function cpmk2Export(ctx: Ctx, url: URL): Promise<Response> {
  const rombelFilter = url.searchParams.get("rombel");
  const students = (await cpmk2StudentList(ctx.db)).filter((s) => !rombelFilter || s.rombel_id === Number(rombelFilter));
  const codes = ["A1", "A2", "B1", "B2", "B3", "B4", "B5", "C", "D1", "D2"] as const;
  const { ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Nilai CPMK 2");
  sheet.addRow([CPMK2_LABEL]);
  sheet.addRow(["NPM", "Nama", "Rombel", ...codes, "Total", "Status"]);
  students.forEach((s) =>
    sheet.addRow([
      s.npm,
      s.name,
      `Rombel ${s.rombel_id}`,
      ...codes.map((code) => (s.result.scores[code] == null ? null : s.result.scores[code])),
      s.result.status === "complete" ? s.result.total : null,
      s.result.status,
    ]),
  );
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF203B52" } };
  sheet.columns.forEach((c) => {
    c.width = 16;
  });
  sheet.getColumn(2).width = 30;
  const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(await book.xlsx.writeBuffer(), {
    headers: { "Content-Type": xlsx, 'Content-Disposition': 'attachment; filename="APaPSI-Nilai-CPMK2.xlsx"' },
  });
}
