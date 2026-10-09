// @ts-nocheck -- ported verbatim from the original app, which was type-checked under its own (less strict) settings.
// Server-side port of the original Express API (server/api.ts).
// Same paths, inputs, outputs and Indonesian messages; persistence now uses Lovable Cloud
// with the caller's own session, so row-level security applies to every query.
import ExcelJS from "exceljs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  calculate,
  emptyData,
  initialConfig,
  validateAssessment,
  validateConfig,
  type AssessmentData,
  type Configuration,
} from "./domain";

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type DB = SupabaseClient<Database>;
export type Ctx = { db: DB; userId: string; username: string; request: Request };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if ((key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) && headers.get("Authorization") === `Bearer ${key}`)
      headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

async function authenticate(request: Request): Promise<Ctx> {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token.split(".").length !== 3) throw new HttpError("Silakan login untuk melanjutkan.", 401);
  const db = createClient<Database>(url, key, {
    global: { fetch: supabaseFetch(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new HttpError("Sesi berakhir. Silakan login kembali.", 401);
  const userId = data.claims.sub;
  const profile = await db.from("profiles").select("username").eq("id", userId).maybeSingle();
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return { db, userId, username: profile.data?.username ?? email.split("@")[0] ?? "asisten", request };
}

function must<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    if (result.error.code === "23505") throw new HttpError("NPM sudah terdaftar. Data tidak digandakan.", 409);
    console.error("[api] database error", result.error);
    throw new HttpError("Operasi database gagal. Tidak ada perubahan parsial yang disimpan.", 500);
  }
  return result.data;
}

function text(value: unknown, label: string, maximum = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new HttpError(`${label} tidak valid.`);
  return value.trim();
}
export function studentInput(value: Record<string, unknown>) {
  const npm = text(value.npm, "NPM", 10);
  if (!/^\d{10}$/.test(npm)) throw new HttpError("NPM harus terdiri dari 10 digit.");
  const name = text(value.name, "Nama");
  const rombel = Number(value.rombel_id);
  if (![1, 2, 3, 4].includes(rombel)) throw new HttpError("Rombel tidak valid.");
  if (typeof value.study_case !== "string" || value.study_case.length > 2000) throw new HttpError("Studi kasus tidak valid.");
  return { npm, name, rombel_id: rombel, study_case: value.study_case.trim() };
}

export async function activeVersion(db: DB) {
  const row = must(await db.from("assessment_versions").select("*").eq("state", "active").maybeSingle());
  if (row) return row as typeof row & { config: Configuration };
  // A fresh database has no rubric yet. Seed the default one so the app is usable on first run
  // instead of failing every request with "versi konfigurasi aktif tidak ditemukan".
  const seeded = must(
    await db
      .from("assessment_versions")
      .insert({ number: 1, label: initialConfig.label, config: initialConfig as never, state: "active" })
      .select("*")
      .single(),
  );
  return seeded as typeof seeded & { config: Configuration };
}

export async function studentList(db: DB) {
  const [students, assessments, versions] = await Promise.all([
    db.from("students").select("*").eq("active", true).order("rombel_id").order("npm"),
    db.from("assessments").select("*"),
    db.from("assessment_versions").select("id,config,state"),
  ]);
  const versionMap = new Map(must(versions).map((v) => [v.id, v.config as unknown as Configuration]));
  const current = must(versions).find((v) => v.state === "active")?.config as unknown as Configuration;
  const byStudent = new Map(must(assessments).map((a) => [a.student_id, a]));
  return must(students).map((row) => {
    const a = byStudent.get(row.id);
    const config = (a && versionMap.get(a.version_id)) ?? current;
    const assessment = a ? { ...a, data: a.data as unknown as AssessmentData, config } : null;
    return {
      id: row.id,
      npm: row.npm,
      name: row.name,
      rombel_id: row.rombel_id,
      study_case: row.study_case,
      active: row.active,
      assessment,
      result: calculate(assessment?.data ?? emptyData(), config, assessment?.state === "verified"),
    };
  });
}

function differences(before: unknown, after: unknown, prefix = ""): Array<{ component: string; before: unknown; after: unknown }> {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
      differences((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key),
    );
  return [{ component: prefix || "Penilaian", before: before ?? null, after: after ?? null }];
}

type LogRow = { student: string | null; component: string; before: unknown; after: unknown; reason?: string };
export async function writeLogs(ctx: Ctx, rows: LogRow[], aiPlanId: string | null = null) {
  if (!rows.length) return;
  must(
    await ctx.db.from("assessment_logs").insert(
      rows.map((r) => ({
        actor_id: ctx.userId,
        student_id: r.student,
        component: r.component,
        before_value: (r.before ?? null) as never,
        after_value: (r.after ?? null) as never,
        reason: r.reason ?? "",
        ai_plan_id: aiPlanId,
      })),
    ),
  );
}

export async function saveAssessment(
  ctx: Ctx,
  studentId: string,
  payload: { data: AssessmentData; revision: number; verify: boolean; reason?: string },
  aiPlanId: string | null = null,
) {
  const { db } = ctx;
  const student = must(await db.from("students").select("*").eq("id", studentId).eq("active", true).maybeSingle());
  if (!student) throw new HttpError("Mahasiswa tidak ditemukan.", 404);
  const before = must(await db.from("assessments").select("*").eq("student_id", student.id).maybeSingle());
  if (typeof payload?.verify !== "boolean" || !Number.isInteger(payload.revision) || payload.revision < 0)
    throw new HttpError("Status pengesahan atau revisi tidak valid.");
  if ((before?.revision ?? 0) !== payload.revision)
    throw new HttpError("Penilaian telah berubah di sesi lain. Input Anda tetap tersedia; buka ulang data terbaru sebelum menyimpan.", 409);
  const version = before
    ? must(await db.from("assessment_versions").select("*").eq("id", before.version_id).single())
    : await activeVersion(db);
  const config = version.config as unknown as Configuration;
  const beforeData = before?.data as unknown as AssessmentData | undefined;
  const input = payload.data;
  const data: AssessmentData = {
    submissions: input?.submissions,
    scores: input?.scores,
    meetings: input?.meetings,
    violations: input?.violations,
    d2Reviewed: input?.d2Reviewed,
    legacyReviewed: input?.legacyReviewed,
    legacy: beforeData?.legacy ?? false,
    warnings: beforeData?.warnings ?? [],
  };
  validateAssessment(data, config);
  const calculation = calculate(data, config);
  if (payload.verify && !calculation.complete) throw new HttpError("Penilaian belum lengkap atau draft lama belum diperiksa.");
  const state = payload.verify ? "verified" : "draft";
  const revision = (before?.revision ?? 0) + 1;
  let row;
  if (before) {
    // Optimistic concurrency: only update when the stored revision is still the one the client saw.
    const updated = must(
      await db
        .from("assessments")
        .update({ data: data as never, state, revision, updated_at: new Date().toISOString(), updated_by: ctx.userId })
        .eq("id", before.id)
        .eq("revision", before.revision)
        .select("*"),
    );
    if (!updated.length)
      throw new HttpError("Penilaian telah berubah di sesi lain. Input Anda tetap tersedia; buka ulang data terbaru sebelum menyimpan.", 409);
    row = updated[0];
  } else {
    const inserted = await db
      .from("assessments")
      .insert({ student_id: student.id, version_id: version.id, data: data as never, state, revision, updated_by: ctx.userId })
      .select("*")
      .single();
    if (inserted.error?.code === "23505")
      throw new HttpError("Penilaian telah berubah di sesi lain. Input Anda tetap tersedia; buka ulang data terbaru sebelum menyimpan.", 409);
    row = must(inserted);
  }
  const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 1000) : "";
  const logs: LogRow[] = differences(beforeData ?? emptyData(), data).map((c) => ({ student: student.id, ...c, reason }));
  if (before?.state !== state)
    logs.push({ student: student.id, component: "Status penilaian", before: before?.state ?? "belum dinilai", after: state });
  await writeLogs(ctx, logs, aiPlanId);
  return { ...row, config, result: calculate(data, config, state === "verified") };
}

export async function createStudent(ctx: Ctx, payload: Record<string, unknown>, aiPlanId: string | null = null) {
  const student = studentInput(payload);
  const existing = must(await ctx.db.from("students").select("id,active").eq("npm", student.npm).maybeSingle());
  if (existing) throw new HttpError("NPM sudah terdaftar. Data tidak digandakan.", 409);
  const row = must(await ctx.db.from("students").insert(student).select("*").single());
  await writeLogs(ctx, [{ student: row.id, component: "Mahasiswa ditambahkan", before: null, after: student }], aiPlanId);
  return row;
}

export async function saveStudent(ctx: Ctx, studentId: string, payload: Record<string, unknown>, aiPlanId: string | null = null) {
  const student = studentInput(payload);
  const before = must(await ctx.db.from("students").select("*").eq("id", studentId).eq("active", true).maybeSingle());
  if (!before) throw new HttpError("Mahasiswa tidak ditemukan.", 404);
  must(await ctx.db.from("students").update(student).eq("id", before.id));
  await writeLogs(ctx, [{ student: before.id, component: "Data mahasiswa", before, after: student }], aiPlanId);
}

export async function deactivateStudent(ctx: Ctx, studentId: string, aiPlanId: string | null = null) {
  const rows = must(await ctx.db.from("students").update({ active: false }).eq("id", studentId).eq("active", true).select("id"));
  if (!rows.length) throw new HttpError("Mahasiswa tidak ditemukan.", 404);
  await writeLogs(
    ctx,
    [{ student: studentId, component: "Mahasiswa dinonaktifkan", before: true, after: false, reason: "Riwayat penilaian dipertahankan" }],
    aiPlanId,
  );
}

export async function saveConfigurationDraft(ctx: Ctx, payload: Record<string, any>, aiPlanId: string | null = null) {
  if (!payload.config || typeof payload.config !== "object" || !Array.isArray(payload.config.aspects) || !Array.isArray(payload.config.meetings) || !Array.isArray(payload.config.violations))
    throw new HttpError("Struktur draft konfigurasi tidak valid.");
  validateConfig(payload.config, true);
  const existing = must(await ctx.db.from("configuration_drafts").select("*").eq("id", 1).maybeSingle());
  const active = await activeVersion(ctx.db);
  if (payload.base_version !== active.id || payload.revision !== (existing?.revision ?? 0))
    throw new HttpError("Draft atau versi aktif berubah. Muat ulang pengaturan sebelum menyimpan.", 409);
  const next = { config: payload.config, base_version: active.id, revision: (existing?.revision ?? 0) + 1, updated_at: new Date().toISOString() };
  let draft;
  if (existing) {
    const rows = must(await ctx.db.from("configuration_drafts").update(next).eq("id", 1).eq("revision", existing.revision).select("*"));
    if (!rows.length) throw new HttpError("Draft atau versi aktif berubah. Muat ulang pengaturan sebelum menyimpan.", 409);
    draft = rows[0];
  } else {
    const inserted = await ctx.db.from("configuration_drafts").insert({ id: 1, ...next }).select("*").single();
    if (inserted.error?.code === "23505") throw new HttpError("Draft atau versi aktif berubah. Muat ulang pengaturan sebelum menyimpan.", 409);
    draft = must(inserted);
  }
  await writeLogs(ctx, [{ student: null, component: "Draft konfigurasi", before: existing?.config ?? null, after: draft.config }], aiPlanId);
  return draft;
}

export async function publishConfiguration(ctx: Ctx, payload: Record<string, any>, aiPlanId: string | null = null) {
  const draft = must(await ctx.db.from("configuration_drafts").select("*").eq("id", 1).maybeSingle());
  const current = await activeVersion(ctx.db);
  if (!draft || draft.revision !== payload.revision || draft.base_version !== current.id)
    throw new HttpError("Draft berubah atau tidak tersedia. Muat ulang pengaturan.", 409);
  const config = draft.config as unknown as Configuration;
  validateConfig(config);
  const archived = must(await ctx.db.from("assessment_versions").update({ state: "archived" }).eq("id", current.id).eq("state", "active").select("id"));
  if (!archived.length) throw new HttpError("Draft berubah atau tidak tersedia. Muat ulang pengaturan.", 409);
  const inserted = await ctx.db
    .from("assessment_versions")
    .insert({ number: current.number + 1, label: config.label, config: config as never, state: "active", created_by: ctx.userId })
    .select("*")
    .single();
  if (inserted.error) {
    await ctx.db.from("assessment_versions").update({ state: "active" }).eq("id", current.id);
    must(inserted);
  }
  const version = inserted.data!;
  must(await ctx.db.from("configuration_drafts").delete().eq("id", 1));
  await writeLogs(
    ctx,
    [{ student: null, component: "Konfigurasi diterbitkan", before: current.number, after: version.number, reason: "Penilaian lama tetap menggunakan versi asal" }],
    aiPlanId,
  );
  return version;
}

export async function importStudents(ctx: Ctx, payload: Record<string, any>, aiPlanId: string | null = null) {
  if (!Array.isArray(payload.records) || payload.records.length < 1 || payload.records.length > 5000) throw new HttpError("Data import tidak valid.");
  const records = payload.records.map(studentInput);
  if (new Set(records.map((item: { npm: string }) => item.npm)).size !== records.length) throw new HttpError("NPM ganda dalam import.");
  const existing = new Set(must(await ctx.db.from("students").select("npm")).map((r) => r.npm));
  const fresh = records.filter((r: { npm: string }) => !existing.has(r.npm));
  let insertedRows: { id: string; npm: string }[] = [];
  if (fresh.length) insertedRows = must(await ctx.db.from("students").insert(fresh).select("id,npm"));
  await writeLogs(
    ctx,
    insertedRows.map((row) => ({ student: row.id, component: "Mahasiswa diimpor", before: null, after: fresh.find((r: { npm: string }) => r.npm === row.npm) })),
    aiPlanId,
  );
  const result = { inserted: insertedRows.length, skipped: records.length - insertedRows.length };
  must(await ctx.db.from("import_batches").insert({ source: "Upload admin", report: result, actor_id: ctx.userId }));
  return result;
}

export async function listLogs(db: DB, studentId: string | null, limit: number) {
  let query = db.from("assessment_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (studentId) query = query.eq("student_id", studentId);
  const logs = must(await query);
  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[];
  const studentIds = [...new Set(logs.map((l) => l.student_id).filter(Boolean))] as string[];
  const [profiles, students] = await Promise.all([
    actorIds.length ? db.from("profiles").select("id,username").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
    studentIds.length ? db.from("students").select("id,name,npm").in("id", studentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const p = new Map((profiles.data ?? []).map((r: { id: string; username: string }) => [r.id, r.username]));
  const s = new Map((students.data ?? []).map((r: { id: string; name: string; npm: string }) => [r.id, r]));
  return logs.map((l) => ({
    ...l,
    username: (l.actor_id && p.get(l.actor_id)) ?? "sistem",
    name: (l.student_id && s.get(l.student_id)?.name) ?? null,
    npm: (l.student_id && s.get(l.student_id)?.npm) ?? null,
  }));
}

function safeWorkbook(buffer: Uint8Array) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buffer.length < 22 || view.getUint32(0, true) !== 0x04034b50) throw new HttpError("File harus berupa workbook .xlsx.");
  let expanded = 0;
  let entries = 0;
  for (let position = 0; position < buffer.length - 46; position++)
    if (view.getUint32(position, true) === 0x02014b50) {
      expanded += view.getUint32(position + 24, true);
      entries++;
    }
  if (expanded > 50 * 1024 * 1024 || entries > 10000) throw new HttpError("Workbook terlalu besar untuk diproses.");
}

async function importPreview(ctx: Ctx) {
  const body = new Uint8Array(await ctx.request.arrayBuffer());
  if (!body.length) throw new HttpError("Unggah file .xlsx yang valid.");
  if (body.length > 5 * 1024 * 1024) throw new HttpError("File terlalu besar (maksimum 5 MB).", 413);
  safeWorkbook(body);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
  const records: ReturnType<typeof studentInput>[] = [];
  const errors: string[] = [];
  for (const sheet of book.worksheets) {
    const rombel = Number(sheet.name.match(/rombel\s*(\d)/i)?.[1]);
    if (![1, 2, 3, 4].includes(rombel)) {
      errors.push(`Sheet ${sheet.name}: nama harus Rombel 1–4.`);
      continue;
    }
    const headers = [1, 2, 3, 4].map((column) => sheet.getCell(1, column).text.toLowerCase().trim());
    if (headers.join("|") !== "no|npm|nama|studi kasus") {
      errors.push(`Sheet ${sheet.name}: header harus No, NPM, Nama, Studi Kasus.`);
      continue;
    }
    for (let row = 2; row <= Math.min(sheet.rowCount, 5000); row++) {
      const cell = sheet.getCell(row, 2);
      if (!cell.value && !sheet.getCell(row, 3).value) continue;
      try {
        const npm = typeof cell.value === "number" ? cell.value.toFixed(0) : cell.text.trim();
        const record = studentInput({ npm, name: sheet.getCell(row, 3).text, rombel_id: rombel, study_case: sheet.getCell(row, 4).text });
        if (records.some((item) => item.npm === npm)) errors.push(`NPM ${npm} ganda dalam file. Perbaiki sebelum import.`);
        records.push(record);
      } catch (error) {
        errors.push(`${sheet.name} baris ${row}: ${(error as Error).message}`);
      }
    }
  }
  if (!records.length && !errors.length) errors.push("Tidak ada mahasiswa pada workbook.");
  const existing = new Set(must(await ctx.db.from("students").select("npm")).map((r) => r.npm));
  return {
    records,
    errors,
    total: records.length,
    existing: records.filter((item) => existing.has(item.npm)).length,
    missingStudyCase: records.filter((item) => !item.study_case).length,
  };
}

async function exportWorkbook(ctx: Ctx, url: URL) {
  const rombelFilter = url.searchParams.get("rombel");
  const type = url.searchParams.get("type");
  const students = (await studentList(ctx.db)).filter((s) => !rombelFilter || s.rombel_id === Number(rombelFilter));
  const book = new ExcelJS.Workbook();
  const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (type === "students") {
    for (const rombel of [1, 2, 3, 4].filter((v) => !rombelFilter || v === Number(rombelFilter))) {
      const sheet = book.addWorksheet(`Rombel ${rombel}`);
      sheet.addRow(["No", "NPM", "Nama", "Studi Kasus"]);
      students.filter((s) => s.rombel_id === rombel).forEach((s, i) => sheet.addRow([i + 1, s.npm, s.name, s.study_case]));
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((c) => {
        c.width = 24;
      });
      sheet.getColumn(4).width = 65;
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    }
    return new Response(await book.xlsx.writeBuffer(), {
      headers: { "Content-Type": xlsx, "Content-Disposition": "attachment; filename=APaPSI-Mahasiswa.xlsx" },
    });
  }
  const sheet = book.addWorksheet("Nilai Akhir");
  const codes = [...new Set([...initialConfig.aspects.map((i) => i.code), ...students.flatMap((s) => Object.keys(s.result.scores))])];
  sheet.addRow(["NPM", "Nama", "Rombel", ...codes, "Nilai Akhir", "Nilai Sementara", "Status", "Versi"]);
  students.forEach((s) =>
    sheet.addRow([
      s.npm,
      s.name,
      `Rombel ${s.rombel_id}`,
      ...codes.map((code) => (s.result.scores[code] == null ? null : Math.round(s.result.scores[code]! * 10) / 10)),
      s.result.status === "complete" ? Math.round(s.result.total * 10) / 10 : null,
      s.result.status !== "complete" ? Math.round(s.result.total * 10) / 10 : null,
      s.result.status,
      s.assessment?.config.label ?? "",
    ]),
  );
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF203B52" } };
  sheet.columns.forEach((c) => {
    c.width = 18;
  });
  sheet.getColumn(2).width = 32;
  for (let column = 4; column <= 4 + codes.length; column++) sheet.getColumn(column).numFmt = "0.0";
  return new Response(await book.xlsx.writeBuffer(), {
    headers: { "Content-Type": xlsx, "Content-Disposition": 'attachment; filename="APaPSI-Nilai-Akhir.xlsx"' },
  });
}

/**
 * First-run only: creates the administrator account when no account exists yet.
 * The browser never sends a service-role key, so the caller authenticates with the
 * credentials it just chose and the server creates the account for them.
 */
async function bootstrap(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || email.length > 200) throw new HttpError("Username tidak valid.", 400);
  if (password.length < 5) throw new HttpError("Password minimal 5 karakter.", 400);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new HttpError("Layanan akun belum tersedia.", 503);
  // An account already exists: this request is a plain sign-in attempt, not a first run.
  if (data.users.length) return json({ message: "Username atau password tidak sesuai." }, 401);

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: email.split("@")[0] },
  });
  if (created.error) {
    // Supabase enforces its own minimum length; surface that instead of a generic failure.
    if (/password/i.test(created.error.message))
      throw new HttpError("Password ditolak Supabase. Turunkan 'Minimum password length' di Authentication > Providers > Email, lalu coba lagi.", 400);
    throw new HttpError("Akun administrator gagal dibuat.", 500);
  }
  return json({ success: true }, 201);
}

export type AiHandler = (ctx: Ctx, method: string, path: string, url: URL) => Promise<Response>;

export async function handleApi(request: Request, path: string, aiHandler?: AiHandler): Promise<Response> {
  try {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    if (path === "/health") return json({ status: "ok" });
    if (path === "/auth/bootstrap" && method === "POST") return await bootstrap(request);
    const ctx = await authenticate(request);
    const body = async () => {
      const raw = await request.text();
      if (raw.length > 1024 * 1024) throw new HttpError("Permintaan terlalu besar.", 413);
      return raw ? JSON.parse(raw) : {};
    };
    if (path === "/auth/session" && method === "GET") return json({ username: ctx.username, csrf: "-", mustChangePassword: false, requirePasswordChange: false });
    if (path === "/auth/password-logged" && method === "POST") {
      await writeLogs(ctx, [{ student: null, component: "Keamanan: password diubah", before: null, after: "Password diperbarui; sesi lain dicabut" }]);
      return json({ success: true });
    }
    if (path.startsWith("/ai/") || path === "/ai") {
      if (!aiHandler) throw new HttpError("Endpoint tidak ditemukan.", 404);
      return await aiHandler(ctx, method, path, url);
    }
    if (path === "/students" && method === "GET") return json(await studentList(ctx.db));
    if (path === "/students" && method === "POST") return json(await createStudent(ctx, await body()), 201);
    if (path === "/dashboard" && method === "GET") {
      const students = await studentList(ctx.db);
      const complete = students.filter((s) => s.result.status === "complete");
      const grades = complete.map((s) => s.result.total);
      return json({
        total: students.length,
        rombels: [1, 2, 3, 4].map((r) => students.filter((s) => s.rombel_id === r).length),
        complete: complete.length,
        empty: students.filter((s) => s.result.status === "empty").length,
        partial: students.filter((s) => ["partial", "draft"].includes(s.result.status)).length,
        average: grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null,
        highest: grades.length ? Math.max(...grades) : null,
        lowest: grades.length ? Math.min(...grades) : null,
        students: students.filter((s) => s.result.status !== "complete").slice(0, 5),
        logs: await listLogs(ctx.db, null, 5),
      });
    }
    if (path === "/students/import/preview" && method === "POST") return json(await importPreview(ctx));
    if (path === "/students/import/commit" && method === "POST") return json(await importStudents(ctx, await body()));
    const assessmentMatch = path.match(/^\/students\/([0-9a-f-]{36})\/assessment$/);
    if (assessmentMatch && method === "GET") {
      const students = await studentList(ctx.db);
      const student = students.find((s) => s.id === assessmentMatch[1]);
      if (!student) throw new HttpError("Mahasiswa tidak ditemukan.", 404);
      const active = student.assessment ? null : await activeVersion(ctx.db);
      return json({ student, config: student.assessment?.config ?? active!.config, version: student.assessment?.version_id ?? active!.id });
    }
    if (assessmentMatch && method === "PUT") return json(await saveAssessment(ctx, assessmentMatch[1], await body()));
    const studentMatch = path.match(/^\/students\/([0-9a-f-]{36})$/);
    if (studentMatch && method === "PUT") {
      await saveStudent(ctx, studentMatch[1], await body());
      return json({ success: true });
    }
    if (studentMatch && method === "DELETE") {
      await deactivateStudent(ctx, studentMatch[1]);
      return json({ success: true });
    }
    if (path === "/logs" && method === "GET") {
      const id = url.searchParams.get("student");
      if (id && !/^[0-9a-f-]{36}$/.test(id)) throw new HttpError("Mahasiswa tidak valid.");
      return json(await listLogs(ctx.db, id, 300));
    }
    if (path === "/config" && method === "GET") {
      const [active, draft, versions] = await Promise.all([
        activeVersion(ctx.db),
        ctx.db.from("configuration_drafts").select("*").eq("id", 1).maybeSingle(),
        ctx.db.from("assessment_versions").select("id,number,label,state,created_at").order("number", { ascending: false }),
      ]);
      return json({ active, draft: must(draft) ?? null, versions: must(versions) });
    }
    if (path === "/config/draft" && method === "PUT") return json(await saveConfigurationDraft(ctx, await body()));
    if (path === "/config/publish" && method === "POST") return json(await publishConfiguration(ctx, await body()));
    if (path === "/export" && method === "GET") return await exportWorkbook(ctx, url);
    throw new HttpError("Endpoint tidak ditemukan.", 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ message: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ message: "Format permintaan tidak valid." }, 400);
    // validateConfig / validateAssessment throw plain Errors with user-facing Indonesian messages.
    if (error instanceof Error && !("code" in error)) return json({ message: error.message }, 400);
    console.error("[api] unexpected", error);
    return json({ message: "Operasi database gagal. Tidak ada perubahan parsial yang disimpan." }, 500);
  }
}
