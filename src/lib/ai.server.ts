// @ts-nocheck -- ported verbatim from the original app, which was type-checked under its own (less strict) settings.
// Server-side port of the original AI command router (server/ai/*).
// Same endpoints, state machine, privacy filtering and human-confirmed plans.
// The interpreter now uses Lovable AI; only filtered instruction words are sent to it.
import { createHash, randomUUID } from "crypto";
import {
  calculate,
  emptyData,
  validateAssessment,
  validateConfig,
  type AssessmentData,
  type Configuration,
  type Student,
} from "./domain";
import type {
  AIAdminPlan,
  AICommandState,
  AIContext,
  AIPlan,
  AIPlanTarget,
  AIResponse,
  AIStatistics,
  AIStudentResult,
  ProviderStatus,
  ToolCall,
  ToolName,
} from "./ai-shared";
import {
  activeVersion,
  deactivateStudent,
  importStudents,
  publishConfiguration,
  saveAssessment,
  saveConfigurationDraft,
  saveStudent,
  studentInput,
  studentList,
  type Ctx,
} from "./api.server";

class AIError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* ---------------- state machine ---------------- */
const transitions: Record<AICommandState, AICommandState[]> = {
  IDLE: ["RECEIVING"],
  RECEIVING: ["PARSING", "ERROR"],
  PARSING: ["RESOLVING_CONTEXT", "NEEDS_CLARIFICATION", "ERROR"],
  RESOLVING_CONTEXT: ["CLASSIFYING_INTENT", "NEEDS_CLARIFICATION", "ERROR"],
  CLASSIFYING_INTENT: ["VALIDATING", "ERROR"],
  VALIDATING: ["PLANNING", "EXECUTING_READ", "ERROR"],
  PLANNING: ["PLAN_READY", "NEEDS_CLARIFICATION", "ERROR"],
  PLAN_READY: ["WAITING_CONFIRMATION"],
  WAITING_CONFIRMATION: ["EXECUTING", "REPLANNING", "CANCELLED", "ERROR"],
  REPLANNING: ["PLAN_READY", "NEEDS_CLARIFICATION", "ERROR"],
  EXECUTING_READ: ["VERIFYING_READ", "NEEDS_CLARIFICATION", "ERROR"],
  VERIFYING_READ: ["COMPLETED", "ERROR"],
  EXECUTING: ["VERIFYING", "ROLLED_BACK", "ERROR"],
  VERIFYING: ["COMPLETED", "ROLLED_BACK", "ERROR"],
  COMPLETED: ["IDLE"],
  NEEDS_CLARIFICATION: ["PARSING", "REPLANNING", "CANCELLED", "ERROR"],
  CANCELLED: ["IDLE"],
  ROLLED_BACK: ["ERROR"],
  ERROR: ["IDLE"],
};
class AIStateMachine {
  readonly requestId = randomUUID();
  readonly trace: { state: AICommandState; timestamp: string }[];
  constructor(public state: AICommandState = "IDLE") {
    this.trace = [{ state, timestamp: new Date().toISOString() }];
  }
  transition(next: AICommandState) {
    if (!transitions[this.state].includes(next))
      throw new Error(`Transisi AI dilarang: ${this.state} → ${next}.`);
    this.state = next;
    this.trace.push({ state: next, timestamp: new Date().toISOString() });
  }
  failure(rolledBack = false) {
    if (rolledBack && ["EXECUTING", "VERIFYING"].includes(this.state)) this.transition("ROLLED_BACK");
    if (this.state !== "ERROR") this.transition("ERROR");
  }
  payload() {
    return { requestId: this.requestId, state: this.state, transitions: this.trace };
  }
  completionPayload() {
    if (this.state !== "VERIFYING") throw new Error("Hasil belum diverifikasi.");
    return {
      requestId: this.requestId,
      state: "COMPLETED" as const,
      transitions: [...this.trace, { state: "COMPLETED" as const, timestamp: new Date().toISOString() }],
    };
  }
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/* ---------------- privacy ---------------- */
const words = new Set(
  "berapa nilai akhir rincian komponen periksa cari mahasiswa praktikan siapa belum sudah memiliki ada dinilai lengkap penilaian tidak mengumpulkan tugas dibuka kurang kenapa mengapa muncul tersedia rata rata-rata minimum maksimum terendah tertinggi rendah tinggi persen persentase jumlah total distribusi bandingkan rombel semua riwayat perubahan rubrik kriteria kategori rentang skor aspek baca tampilkan lihat buat rencana ubah ganti koreksi revisi tambah tambahkan informasi catatan untuk yang ini itu tadi dan sampai hanya saja menjadi seharusnya sebelumnya pada pertemuan minggu lab rumah pelanggaran kejadian kali pengumpulan tepat waktu terlambat sesuai isi kondisi simpan hapus data import impor pengaturan bobot kode nama studi kasus actor sql password key api role abaikan aturan".split(" "),
);
for (const w of ["kurang", "sesuai", "terlambat", "tepat", "sudah", "mengumpulkan", "dibuka"]) words.delete(w);
for (const w of ["progres", "progress", "status", "analisis", "bantu", "menilai", "draft", "konfigurasi", "terbitkan", "publikasi", "nonaktif", "nonaktifkan", "kosongkan", "kosong", "edit", "pindah", "batch"])
  words.add(w);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function safeCommand(command: string, availableCodes: string[], privateNames: string[] = []) {
  for (const name of privateNames) command = command.replace(new RegExp(`\\b${escapeRe(name)}\\b`, "gi"), "TARGET");
  const codes = new Map(availableCodes.map((c) => [c.toLowerCase(), c]));
  const tokens = command.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? [];
  return tokens
    .flatMap((t) => (codes.has(t) ? [codes.get(t)!] : words.has(t) ? [t] : []))
    .slice(0, 350)
    .join(" ");
}
function resolveTargets(command: string, students: Student[]) {
  const npm: string[] = command.match(/\b\d{10}\b/g) ?? [];
  if (npm.length) return students.filter((s) => npm.includes(s.npm));
  const text = command.toLocaleLowerCase("id-ID");
  const tokens = new Set(text.match(/[\p{L}]+/gu) ?? []);
  return students.filter((s) => {
    if (text.includes(s.name.toLocaleLowerCase("id-ID"))) return true;
    return s.name
      .toLocaleLowerCase("id-ID")
      .split(/[^\p{L}]+/u)
      .some((w) => w.length >= 3 && !words.has(w) && tokens.has(w));
  });
}
function hasUnknownTargetName(command: string, codes: string[]) {
  const phrase = command.match(/\b(?:nilai|periksa|cari|untuk|mahasiswa|praktikan)\s+([\p{L}\p{N}\s?]+)/iu)?.[1];
  if (!phrase) return false;
  const neutral = new Set([...words, ...codes.map((c) => c.toLowerCase()), "di", "ke", "dari", "dengan", "berdasarkan", "bagaimana", "nya", "berapa", "ya", "iya"]);
  return (phrase.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some((t) => !/^\d+$/.test(t) && !neutral.has(t));
}
function explicitScopes(command: string, availableCodes: string[]) {
  const text = command.toUpperCase();
  const selected = availableCodes.filter((c) => new RegExp(`\\b${escapeRe(c)}\\b`, "i").test(text));
  if (/B1\s*[-–]|B1\s+SAMPAI/.test(text) && /B7/.test(text))
    for (const c of availableCodes.filter((c) => /^B[1-7]$/.test(c))) if (!selected.includes(c)) selected.push(c);
  return selected;
}
function explicitScore(command: string, code: string): number | null {
  const matches = [
    ...command.matchAll(
      new RegExp(`\\b${escapeRe(code)}\\s*(?:=|:|(?:menjadi|jadi|seharusnya|nilai|skor)\\s*)?\\s*(\\d+(?:[.,]\\d+)?)\\b`, "gi"),
    ),
  ];
  const scores = [...new Set(matches.map((m) => Number(m[1].replace(",", "."))))];
  if (scores.length > 1)
    throw new AIError(`Ada beberapa skor berbeda untuk ${code}. Perjelas skor yang dimaksud; tidak ada nilai yang disimpan.`);
  return scores[0] ?? null;
}
function componentNotes(command: string, availableCodes: string[]): Record<string, string> {
  if (!availableCodes.length) return {};
  const labels = [...command.matchAll(new RegExp(`\\b(${availableCodes.map(escapeRe).join("|")})\\b`, "gi"))];
  const notes: Record<string, string> = {};
  for (const [index, label] of labels.entries()) {
    const code = availableCodes.find((c) => c.toLowerCase() === label[1].toLowerCase())!;
    let note = command.slice(label.index! + label[0].length, labels[index + 1]?.index ?? command.length);
    note = note.replace(/^\s*(?:=|:)?\s*(?:(?:menjadi|jadi|seharusnya|nilai|skor)\s*)?\d+(?:[.,]\d+)?\b/i, "");
    note = note.replace(/^[\s.,;:=—–-]+|[\s,;]+$/g, "").replace(/^catatan\s*:?\s*/i, "").trim();
    if (!/[\p{L}]{3}/u.test(note) || /^(?:dan|sampai|saja|hingga)$/i.test(note)) continue;
    if (notes[code]) throw new AIError(`Catatan ${code} disebut lebih dari sekali. Gabungkan catatannya agar rencana tidak ambigu.`);
    notes[code] = note;
  }
  return notes;
}

/* ---------------- interpreter (Lovable AI) ---------------- */
const MODEL = "openai/gpt-6-astra";
const toolNames: ToolName[] = [
  "SEARCH_STUDENTS", "GET_FINAL_SCORE", "GET_MISSING_ASSESSMENTS", "GET_RUBRIC", "GET_CLASS_STATISTICS",
  "GET_ASSESSMENT_HISTORY", "CREATE_ASSESSMENT_PLAN", "CREATE_STUDENT_CHANGE_PLAN", "CREATE_DEACTIVATION_PLAN",
  "CREATE_CLEAR_PLAN", "CREATE_CONFIG_PLAN", "CREATE_PUBLISH_PLAN", "CREATE_IMPORT_PLAN", "CLARIFY",
];
const argumentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    aspects: { type: "array", items: { type: "string", maxLength: 30 }, maxItems: 30 },
    rombel: { type: "integer", minimum: 0, maximum: 4 },
    metric: { type: "string", enum: ["summary", "average", "minimum", "maximum", "distribution"] },
    status: { type: "string", enum: ["all", "empty", "partial", "complete", "draft"] },
  },
  required: ["aspects", "rombel", "metric", "status"],
};
const descriptions: Record<ToolName, string> = {
  SEARCH_STUDENTS: "Cari identitas mahasiswa dari referensi yang telah diselesaikan server. Tidak mengubah data.",
  GET_FINAL_SCORE: "Baca nilai, rincian komponen, atau alasan nilai akhir belum sah untuk target saat ini.",
  GET_MISSING_ASSESSMENTS: "Daftar mahasiswa belum dinilai, belum lengkap, atau belum memiliki nilai akhir resmi.",
  GET_RUBRIC: "Baca rubrik dan rentang kriteria, tanpa mengubahnya.",
  GET_CLASS_STATISTICS: "Hitung jumlah, rata-rata, min/max, distribusi, persentase atau progress rombel.",
  GET_ASSESSMENT_HISTORY: "Baca riwayat perubahan mahasiswa target.",
  CREATE_ASSESSMENT_PLAN: "Buat rencana koreksi penilaian untuk ditinjau manusia. Tidak menyimpan nilai.",
  CLARIFY: "Perintah ambigu atau di luar tool yang didukung: meminta klarifikasi, bukan menebak.",
  CREATE_STUDENT_CHANGE_PLAN: "Rencanakan edit identitas/rombel/studi kasus mahasiswa; field privat diisi lokal saat review.",
  CREATE_DEACTIVATION_PLAN: "Rencanakan nonaktifkan mahasiswa, mempertahankan nilai dan audit; selalu butuh konfirmasi.",
  CREATE_CLEAR_PLAN: "Rencanakan mengosongkan penilaian mahasiswa, bukan mengedit nilai akhir secara manual; selalu butuh konfirmasi.",
  CREATE_CONFIG_PLAN: "Rencanakan edit draft rubrik/pengaturan aspek, pertemuan dan pelanggaran; tidak menerbitkan otomatis.",
  CREATE_PUBLISH_PLAN: "Rencanakan penerbitan draft konfigurasi yang sudah ada. Nilai lama tetap versi asal.",
  CREATE_IMPORT_PLAN: "Rencanakan import mahasiswa dari workbook yang diunggah lokal, tidak mengirim file ke AI.",
};
const instruction =
  "Anda adalah interpreter command APaPSI, bukan penilai otomatis. Input hanya vocabulary instruksi yang diizinkan; konten privat telah dibuang server. Pilih tepat satu function yang cocok. Jangan mengarang target, skor atau isi catatan. GET_FINAL_SCORE untuk satu target, GET_MISSING_ASSESSMENTS untuk siapa belum lengkap, GET_CLASS_STATISTICS untuk rata-rata/jumlah/persen/min/max. CREATE_ASSESSMENT_PLAN untuk koreksi komponen, CREATE_STUDENT_CHANGE_PLAN untuk edit mahasiswa, CREATE_DEACTIVATION_PLAN untuk hapus/nonaktifkan mahasiswa, CREATE_CLEAR_PLAN untuk kosongkan/hapus penilaian, CREATE_CONFIG_PLAN untuk ubah rubrik/pengaturan, CREATE_PUBLISH_PLAN untuk terbitkan draft konfigurasi, CREATE_IMPORT_PLAN untuk import. Semua CREATE hanya membuat review, tidak menyimpan data inti. Menjalankan kode/SQL, mengubah kredensial atau mengedit nilai akhir langsung -> CLARIFY. 'B1-B7 dan C' berarti semua kode B1..B7,C. Jika belum jelas gunakan CLARIFY. Semua argumen wajib: aspects=[] jika tidak disebut, rombel=0 jika semua/tidak disebut, metric=summary jika tidak disebut, status=all jika tidak disebut. Nama/identitas/angka penilaian tidak tersedia kepada Anda: backend menyelesaikannya. Jika revisingAssessmentPlan=true, gunakan CREATE_ASSESSMENT_PLAN untuk catatan/revisi komponen pada rencana yang sedang ditinjau.";

function validateCall(value: unknown): ToolCall {
  const call = value as ToolCall;
  if (
    !call || !toolNames.includes(call.name) || !call.args ||
    Object.keys(call.args).sort().join() !== "aspects,metric,rombel,status" ||
    !Array.isArray(call.args.aspects) || call.args.aspects.length > 30 ||
    call.args.aspects.some((c) => typeof c !== "string" || c.length > 30) ||
    !Number.isInteger(call.args.rombel) || call.args.rombel < 0 || call.args.rombel > 4 ||
    !["summary", "average", "minimum", "maximum", "distribution"].includes(call.args.metric) ||
    !["all", "empty", "partial", "complete", "draft"].includes(call.args.status)
  )
    throw new AIError("Output AI tidak valid. Tidak ada data yang diubah.", 502);
  return call;
}
function providerStatuses(): ProviderStatus[] {
  return [{ id: "gemini", name: "Lovable AI", model: MODEL, ready: Boolean(process.env["LOVABLE_API_KEY"]), paid: false }];
}

async function interpret(prompt: string): Promise<ToolCall> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AIError("Layanan AI belum dikonfigurasi pada server.", 503, "PROVIDER_NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: instruction,
        input: prompt,
        store: false,
        stream: true,
        reasoning: { effort: "low" },
        tools: toolNames.map((name) => ({
          type: "function",
          name,
          description: descriptions[name],
          parameters: argumentSchema,
          strict: true,
        })),
        tool_choice: "required",
        parallel_tool_calls: false,
      }),
    });
  } catch {
    throw new AIError("Layanan AI tidak dapat dihubungi. Command Anda tetap tersedia.", 502, "PROVIDER_UNAVAILABLE");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[ai] gateway error", response.status, detail.slice(0, 500));
    if (response.status === 429)
      throw new AIError("Batas penggunaan AI tercapai. Coba lagi beberapa saat lagi.", 429, "PROVIDER_QUOTA");
    if (response.status === 402)
      throw new AIError("Kredit AI workspace habis. Tambahkan kredit untuk melanjutkan; tidak ada data yang diubah.", 402, "PROVIDER_CREDITS");
    if (response.status === 403)
      throw new AIError("Akses AI ditolak untuk workspace ini. Tidak ada data yang diubah.", 403, "PROVIDER_ACCESS_DENIED");
    throw new AIError(`Layanan AI menolak permintaan (HTTP ${response.status}). Tidak ada perubahan data.`, 502, "PROVIDER_REJECTED");
  }
  // Read the stream and collect function calls from the completed response.
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const calls: { name: string; arguments: string }[] = [];
  let finalOutput: { type: string; name?: string; arguments?: string }[] | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        if (event.type === "response.output_item.done" && event.item?.type === "function_call")
          calls.push({ name: event.item.name, arguments: event.item.arguments });
        if (event.type === "response.completed") finalOutput = event.response?.output;
        if (event.type === "response.failed" || event.type === "error")
          throw new AIError("Layanan AI gagal memproses command. Tidak ada data yang diubah.", 502);
      } catch (error) {
        if (error instanceof AIError) throw error;
      }
    }
  }
  const all = finalOutput
    ? finalOutput.filter((i) => i.type === "function_call").map((i) => ({ name: i.name!, arguments: i.arguments! }))
    : calls;
  if (all.length !== 1) throw new AIError("AI tidak menghasilkan tepat satu tool yang valid.", 502);
  try {
    return validateCall({ name: all[0].name, args: JSON.parse(all[0].arguments) });
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError("Argumen tool AI tidak dapat dibaca.", 502);
  }
}

/* ---------------- helpers ---------------- */
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const identity = (s: Pick<Student, "id" | "npm" | "name" | "rombel_id" | "study_case">) => ({
  id: s.id, npm: s.npm, name: s.name, rombel_id: s.rombel_id, study_case: s.study_case,
});
function must<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    console.error("[ai] database error", result.error);
    throw new AIError("Operasi database gagal.", 500);
  }
  return result.data;
}
function planReady(targets: AIPlanTarget[], scopes: string[]) {
  return (
    targets.length > 0 &&
    targets.every((t) => {
      try {
        validateAssessment(t.after, t.config);
        const r = calculate(t.after, t.config);
        return scopes.every(
          (code) => t.config.aspects.find((a) => a.code === code)?.kind !== "criterion" || (r.scores[code] !== null && r.scores[code] !== undefined),
        );
      } catch {
        return false;
      }
    }) &&
    targets.some((t) => JSON.stringify(t.before) !== JSON.stringify(t.after))
  );
}
type PlanRow = {
  id: string; user_id: string; workspace_id: string; revision: number; state: string; command: string;
  payload: any; payload_hash: string; expires_at: string; result: any;
};
function presentPlan(row: PlanRow): AIPlan {
  return {
    id: row.id, revision: row.revision, hash: row.payload_hash, state: row.state as AIPlan["state"], command: row.command,
    scopes: row.payload.scopes, targets: row.payload.targets, expiresAt: new Date(row.expires_at).toISOString(),
    ready: planReady(row.payload.targets, row.payload.scopes),
  };
}
function resultFor(student: Student, fallback: Configuration, version: number): AIStudentResult {
  const config = student.assessment?.config ?? fallback;
  const data = student.assessment?.data ?? emptyData();
  const result = calculate(data, config, student.assessment?.state === "verified");
  const missing = Object.entries(result.scores).filter(([, s]) => s === null).map(([c]) => c);
  const explanations = [];
  if (!student.assessment) explanations.push("Belum ada record penilaian tersimpan.");
  if (missing.length) explanations.push(`Komponen belum lengkap: ${missing.join(", ")}.`);
  if (data.legacy && !data.legacyReviewed) explanations.push("Draft Excel belum dikonfirmasi telah diperiksa.");
  if (result.complete && student.assessment?.state !== "verified") explanations.push("Komponen lengkap, tetapi penilaian belum disahkan.");
  return { student: identity(student), result, missing, explanations, submissions: data.submissions, notes: data.scores, version };
}
function statistics(students: Student[], config: Configuration, aspect: string): AIStatistics {
  const calculated = students.map((s) => calculate(s.assessment?.data ?? emptyData(), s.assessment?.config ?? config, s.assessment?.state === "verified"));
  const values = calculated.flatMap((r) =>
    aspect ? (r.scores[aspect] == null ? [] : [r.scores[aspect]!]) : r.status === "complete" ? [r.total] : [],
  );
  const complete = calculated.filter((r) => r.status === "complete").length;
  const missing: Record<string, number> = {};
  for (const r of calculated) for (const [c, v] of Object.entries(r.scores)) if (v === null) missing[c] = (missing[c] ?? 0) + 1;
  return {
    total: students.length, complete,
    empty: calculated.filter((r) => r.status === "empty").length,
    partial: calculated.filter((r) => r.status === "partial").length,
    draft: calculated.filter((r) => r.status === "draft").length,
    percentage: students.length ? (complete / students.length) * 100 : 0,
    count: values.length,
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    minimum: values.length ? Math.min(...values) : null,
    maximum: values.length ? Math.max(...values) : null,
    aspect, missing,
    distribution: (aspect ? [] : [[0, 60], [60, 70], [70, 80], [80, 90], [90, 101]]).map(([lo, hi]) => ({
      label: `${lo}–${hi === 101 ? 100 : hi - 1}`,
      count: values.filter((v) => v >= lo && v < hi).length,
    })),
  };
}

async function audit(ctx: Ctx, status: string, command = "", intent = "", workspace?: string, plan?: string, details: unknown = {}) {
  await ctx.db.from("ai_audit_events").insert({
    actor_id: ctx.userId, workspace_id: workspace ?? null, plan_id: plan ?? null,
    command, intent, tool: intent, status, details: details as never,
  });
}
async function ownedPlan(ctx: Ctx, id: string): Promise<PlanRow> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new AIError("ID rencana tidak valid.");
  const row = must(await ctx.db.from("ai_plans").select("*").eq("id", id).eq("user_id", ctx.userId).maybeSingle());
  if (!row) throw new AIError("Rencana tidak ditemukan pada sesi Anda.", 404);
  return row as unknown as PlanRow;
}
const in15 = () => new Date(Date.now() + 15 * 60_000).toISOString();
async function cancelOpenPlans(ctx: Ctx) {
  await ctx.db.from("ai_plans").update({ state: "cancelled" }).eq("user_id", ctx.userId).eq("state", "awaiting_review");
}
async function createPlan(ctx: Ctx, workspaceId: string, command: string, payload: unknown, intent: string) {
  await cancelOpenPlans(ctx);
  const row = must(
    await ctx.db.from("ai_plans").insert({
      user_id: ctx.userId, workspace_id: workspaceId, command, payload: payload as never,
      payload_hash: hash(payload), expires_at: in15(),
    }).select("*").single(),
  ) as unknown as PlanRow;
  await audit(ctx, "planned", command, intent, workspaceId, row.id);
  return row;
}
/** Update a plan only when it is still at the revision we read (optimistic lock). */
async function updatePlan(ctx: Ctx, row: PlanRow, patch: Record<string, unknown>) {
  const updated = must(
    await ctx.db.from("ai_plans").update(patch as never).eq("id", row.id).eq("revision", row.revision).eq("state", row.state).select("*"),
  );
  if (!updated.length) throw new AIError("Rencana berubah. Tinjau versi terbaru.", 409);
  return updated[0] as unknown as PlanRow;
}
async function draftRow(ctx: Ctx) {
  return must(await ctx.db.from("configuration_drafts").select("*").eq("id", 1).maybeSingle());
}

/* ---------------- administration plans ---------------- */
type AdminPayload = {
  kind: AIAdminPlan["kind"]; student?: AIAdminPlan["student"]; before: any; after: Record<string, any>;
  baseVersion?: string; baseRevision?: number;
};
function adminReady(p: AdminPayload) {
  try {
    if (p.kind === "student") { studentInput(p.after); return hash(p.before) !== hash(p.after); }
    if (p.kind === "configuration") { validateConfig(p.after as Configuration, true); return hash(p.before) !== hash(p.after); }
    if (p.kind === "publish") { validateConfig(p.after as Configuration); return true; }
    if (p.kind === "import") return Array.isArray(p.after.records) && p.after.records.length > 0;
    return true;
  } catch {
    return false;
  }
}
function presentAdmin(row: PlanRow): AIAdminPlan {
  return {
    ...row.payload, id: row.id, revision: row.revision, hash: row.payload_hash, state: row.state, command: row.command,
    expiresAt: new Date(row.expires_at).toISOString(), ready: adminReady(row.payload),
  };
}
async function buildAdmin(ctx: Ctx, command: string, tool: string, students: Student[], current: { id: string; config: Configuration }, codes: string[]): Promise<AdminPayload> {
  const student = students[0];
  if (tool === "CREATE_STUDENT_CHANGE_PLAN" || tool === "CREATE_DEACTIVATION_PLAN") {
    const after = clone(identity(student));
    if (tool === "CREATE_STUDENT_CHANGE_PLAN") {
      const name = command.match(/\bnama\s*(?:menjadi|jadi|=|:)\s*([^\n;]+)/i);
      const study = command.match(/\bstudi\s*kasus\s*(?:menjadi|jadi|=|:)\s*([^\n;]+)/i);
      if (name) after.name = name[1].trim();
      if (study) after.study_case = study[1].trim();
      const npm = command.match(/\b\d{10}\b/g) ?? [];
      if (/ubah\s+npm|npm\s+(?:menjadi|jadi)/i.test(command) && npm.length >= 1) after.npm = npm[npm.length - 1];
      const rombel = command.match(/\brombel\s*([1-4])/i);
      if (rombel) after.rombel_id = Number(rombel[1]);
    }
    return { kind: tool === "CREATE_STUDENT_CHANGE_PLAN" ? "student" : "deactivate", student: identity(student), before: identity(student), after };
  }
  if (tool === "CREATE_CLEAR_PLAN") {
    if (!student.assessment) throw new AIError("Belum ada penilaian tersimpan untuk dikosongkan.");
    const after = emptyData();
    after.legacy = student.assessment.data.legacy;
    after.warnings = student.assessment.data.warnings;
    return {
      kind: "clear", student: identity(student), before: { data: student.assessment.data }, after,
      baseRevision: student.assessment.revision, baseVersion: student.assessment.version_id,
    };
  }
  if (tool === "CREATE_IMPORT_PLAN") return { kind: "import", before: { existingNpm: [] }, after: { records: [] } };
  const draft = await draftRow(ctx);
  if (tool === "CREATE_PUBLISH_PLAN" && !draft) throw new AIError("Simpan draft konfigurasi terlebih dahulu.");
  const before = clone((draft?.config as unknown as Configuration) ?? current.config);
  const after = clone(before) as Configuration;
  if (/bobot|maksimal|maksimum/i.test(command))
    for (const code of explicitScopes(command, codes)) {
      const score = explicitScore(command, code);
      const aspect = after.aspects.find((a) => a.code === code);
      if (score !== null && aspect) aspect.max = score;
    }
  return { kind: tool === "CREATE_PUBLISH_PLAN" ? "publish" : "configuration", before, after, baseVersion: current.id, baseRevision: draft?.revision ?? 0 };
}
async function reviseAdmin(ctx: Ctx, p: AdminPayload, input: Record<string, any>): Promise<AdminPayload> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AIError("Payload revisi harus berupa object valid.");
  if (p.kind === "student") return { ...p, after: { ...p.student, ...studentInput(input) } };
  if (p.kind === "configuration") { validateConfig(input as Configuration, true); return { ...p, after: input }; }
  if (p.kind === "import") {
    if (!Array.isArray(input.records) || !input.records.length || input.records.length > 5000) throw new AIError("Data import tidak valid.");
    const records = input.records.map(studentInput);
    if (new Set(records.map((r: { npm: string }) => r.npm)).size !== records.length) throw new AIError("NPM ganda dalam import.");
    const existingNpm = must(await ctx.db.from("students").select("npm").in("npm", records.map((r: { npm: string }) => r.npm)).order("npm")).map((r) => r.npm);
    return { ...p, before: { existingNpm }, after: { records } };
  }
  throw new AIError("Rencana destruktif/publikasi tidak bisa mengubah payload. Batalkan dan buat baru jika perlu.");
}
async function executeAdmin(ctx: Ctx, row: PlanRow) {
  const p: AdminPayload = row.payload;
  if (!adminReady(p)) throw new AIError("Lengkapi dan tinjau rencana sebelum konfirmasi.");
  let output: unknown;
  if (p.kind === "student" || p.kind === "deactivate") {
    const student = must(await ctx.db.from("students").select("*").eq("id", p.student!.id).eq("active", true).maybeSingle());
    if (!student || hash(identity(student)) !== hash(p.before)) throw new AIError("Data mahasiswa berubah. Buat rencana baru.", 409);
    output = p.kind === "student" ? await saveStudent(ctx, student.id, p.after, row.id) : await deactivateStudent(ctx, student.id, row.id);
    const saved = must(await ctx.db.from("students").select("*").eq("id", student.id).single());
    if (p.kind === "student" ? hash(studentInput(saved)) !== hash(studentInput(p.after)) : saved.active !== false)
      throw new AIError("Verifikasi mahasiswa gagal.", 500);
  } else if (p.kind === "clear") {
    const student = must(await ctx.db.from("students").select("id,npm,name,rombel_id,study_case").eq("id", p.student!.id).eq("active", true).maybeSingle());
    const before = must(await ctx.db.from("assessments").select("*").eq("student_id", p.student!.id).maybeSingle());
    if (!student || !before || hash(identity(student)) !== hash(p.student) || before.revision !== p.baseRevision || before.version_id !== p.baseVersion || hash(before.data) !== hash(p.before.data))
      throw new AIError("Penilaian berubah setelah review.", 409);
    output = await saveAssessment(ctx, student.id, { data: p.after as AssessmentData, revision: before.revision, verify: false, reason: `AI: kosongkan penilaian; ${row.command}` }, row.id);
    const saved = must(await ctx.db.from("assessments").select("data").eq("student_id", student.id).single());
    if (hash(saved.data) !== hash(p.after)) throw new AIError("Verifikasi pengosongan gagal.", 500);
  } else if (p.kind === "configuration" || p.kind === "publish") {
    const active = await activeVersion(ctx.db);
    const draft = await draftRow(ctx);
    if (active.id !== p.baseVersion || (draft?.revision ?? 0) !== p.baseRevision || hash(draft?.config ?? active.config) !== hash(p.before))
      throw new AIError("Konfigurasi berubah setelah review.", 409);
    output = p.kind === "configuration"
      ? await saveConfigurationDraft(ctx, { config: p.after, revision: p.baseRevision, base_version: p.baseVersion }, row.id)
      : await publishConfiguration(ctx, { revision: p.baseRevision }, row.id);
    const saved = p.kind === "configuration" ? (await draftRow(ctx))?.config : (await activeVersion(ctx.db)).config;
    if (!saved || hash(saved) !== hash(p.after)) throw new AIError("Verifikasi konfigurasi gagal.", 500);
  } else {
    const npms = p.after.records.map((r: { npm: string }) => r.npm);
    const existing = must(await ctx.db.from("students").select("npm").in("npm", npms).order("npm")).map((r) => r.npm);
    if (hash(existing) !== hash(p.before.existingNpm)) throw new AIError("Data berubah setelah preview import. Unggah/tinjau kembali.", 409);
    output = await importStudents(ctx, p.after, row.id);
    const count = must(await ctx.db.from("students").select("id").in("npm", npms)).length;
    if (count !== p.after.records.length) throw new AIError("Verifikasi import gagal.", 500);
  }
  return { success: true, count: p.kind === "import" ? p.after.records.length : 1, saved: p.kind === "clear" ? [output] : [], planId: row.id, output };
}

/* ---------------- endpoints ---------------- */
const intentCache = new Map<string, { call: ToolCall; expires: number }>();
const connectionTests = new Map<string, { status: "connected" | "failed"; checkedAt: number }>();

async function commands(ctx: Ctx, body: any) {
  const machine = new AIStateMachine();
  let workspaceId: string | undefined;
  try {
    if (typeof body.command !== "string" || !body.command.trim() || body.command.length > 4000)
      throw new AIError("Command wajib diisi, maksimal 4.000 karakter.");
    if (/(?:sk-[a-zA-Z0-9_-]{15,}|AIza[a-zA-Z0-9_-]{20,}|AQ\.[a-zA-Z0-9_-]{20,}|password\s*[=:])/i.test(body.command))
      throw new AIError("Jangan masukkan credential atau API key ke command.");
    const command = body.command.trim();
    const provider = "gemini" as const;
    machine.transition("RECEIVING");
    machine.transition("PARSING");
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const recent = (await ctx.db.from("ai_audit_events").select("id", { count: "exact", head: true }).eq("actor_id", ctx.userId).eq("status", "started").gt("created_at", minuteAgo)).count ?? 0;
    const daily = (await ctx.db.from("ai_audit_events").select("id", { count: "exact", head: true }).eq("actor_id", ctx.userId).eq("status", "started").gt("created_at", dayAgo)).count ?? 0;
    if (recent >= 10 || daily >= 100) throw new AIError("Batas AI tercapai (10 command/menit, 100/hari). Coba kembali nanti.", 429);
    let workspace = must(await ctx.db.from("ai_workspaces").select("*").eq("user_id", ctx.userId).order("updated_at", { ascending: false }).limit(1).maybeSingle());
    if (!workspace) workspace = must(await ctx.db.from("ai_workspaces").insert({ user_id: ctx.userId }).select("*").single());
    else await ctx.db.from("ai_workspaces").update({ updated_at: new Date().toISOString() }).eq("id", workspace.id);
    const wctx = (workspace.context ?? {}) as Record<string, any>;
    workspaceId = workspace.id;
    await audit(ctx, "started", command, "", workspace.id, undefined, machine.payload());
    const context: AIContext = body.context && typeof body.context === "object" ? body.context : { pathname: "/dashboard" };
    const students = await studentList(ctx.db);
    const revisionPlan = body.planId ? await ownedPlan(ctx, body.planId) : undefined;
    if (revisionPlan && (revisionPlan.state !== "awaiting_review" || revisionPlan.revision !== body.planRevision || new Date(revisionPlan.expires_at).getTime() <= Date.now() || !Array.isArray(revisionPlan.payload.scopes)))
      throw new AIError("Rencana tidak dapat direvisi. Muat rencana terbaru atau buat rencana baru.", 409);
    if (body.revisionAction !== undefined && !["REVISE", "ADD_INFORMATION"].includes(body.revisionAction)) throw new AIError("Aksi revisi tidak valid.");
    const current = await activeVersion(ctx.db);
    const versions = must(await ctx.db.from("assessment_versions").select("id,number"));
    const versionNumber = (s: Student) => versions.find((v) => v.id === s.assessment?.version_id)?.number ?? current.number;
    const codes = [...new Set([current.config, ...students.flatMap((s) => (s.assessment?.config ? [s.assessment.config] : []))].flatMap((c) => c.aspects.filter((a) => a.active).map((a) => a.code)))];
    machine.transition("RESOLVING_CONTEXT");
    let targets = resolveTargets(command, students);
    const explicitNpm = command.match(/\b\d{10}\b/g) ?? [];
    const explicitClass = command.match(/\brombel\s*(1|2|3|4|satu|dua|tiga|empat)\b/i);
    if (explicitClass) explicitClass[1] = ({ satu: "1", dua: "2", tiga: "3", empat: "4" } as Record<string, string>)[explicitClass[1].toLowerCase()] ?? explicitClass[1];
    if (context.npm && explicitNpm.length === 1 && /^ubah\s+npm|^npm\s+(?:menjadi|jadi)/i.test(command)) targets = students.filter((s) => s.npm === context.npm);
    if (!targets.length && explicitNpm.some((n: string) => !students.some((s) => s.npm === n)))
      throw new AIError("NPM yang disebut tidak ditemukan. Tidak ada target yang dipilih otomatis.", 404);
    if (body.selectedIds !== undefined) {
      if (!Array.isArray(body.selectedIds) || body.selectedIds.length > 25 || body.selectedIds.some((id: unknown) => typeof id !== "string" || !students.some((s) => s.id === id)))
        throw new AIError("Pilihan mahasiswa tidak valid.");
      targets = students.filter((s) => body.selectedIds.includes(s.id));
    }
    const unknownName = !targets.length && hasUnknownTargetName(command, codes);
    if (revisionPlan && !targets.length && !unknownName && !explicitNpm.length)
      targets = students.filter((s) => revisionPlan.payload.targets.some((t: AIPlanTarget) => t.student.id === s.id));
    if (!targets.length && !unknownName && !explicitNpm.length && !explicitClass && context.npm) targets = students.filter((s) => s.npm === context.npm);
    if (!targets.length && !unknownName && !explicitNpm.length && !explicitClass && /\b(ini|itu|tadi|yang|iya|ya)\b/i.test(command))
      targets = wctx.pathname === context.pathname && wctx.pageRombel === (context.rombel ?? 0) ? students.filter((s) => wctx.targets?.includes(s.id)) : [];
    const rombel = explicitClass
      ? Number(explicitClass[1])
      : Number.isInteger(context.rombel) && [0, 1, 2, 3, 4].includes(context.rombel!)
        ? context.rombel!
        : wctx.pathname === context.pathname ? (wctx.rombel ?? 0) : 0;
    const safe = safeCommand(command, codes, students.flatMap((s) => s.name.split(/[^\p{L}]+/u)).filter((n) => n.length >= 3));
    const prompt = JSON.stringify({
      instructionWords: safe, mentionedAspects: explicitScopes(command, codes), currentRombel: rombel, targetCount: targets.length,
      previousScope: wctx.scopes ?? [], revisingAssessmentPlan: Boolean(revisionPlan), privateContentAvailableLocally: true,
    });
    const cacheKey = hash({ user: ctx.userId, prompt, model: MODEL });
    const cached = intentCache.get(cacheKey);
    const fromCache = Boolean(cached && cached.expires > Date.now());
    machine.transition("CLASSIFYING_INTENT");
    const call: ToolCall = fromCache && cached ? clone(cached.call) : await interpret(prompt);
    if (intentCache.size >= 50) intentCache.clear();
    intentCache.set(cacheKey, { call: clone(call), expires: Date.now() + 30000 });
    if (call.name !== "CREATE_STUDENT_CHANGE_PLAN" && explicitNpm.some((n: string) => !students.some((s) => s.npm === n)))
      throw new AIError("NPM yang disebut tidak ditemukan.", 404);
    machine.transition("VALIDATING");
    machine.transition(call.name.startsWith("CREATE_") ? "PLANNING" : "EXECUTING_READ");
    const activity = ["Instruksi disaring: tanpa identitas, nilai, dan catatan", fromCache ? "Interpretasi instruksi non-sensitif dari cache" : "Lovable AI: memilih tool", call.name];
    if (call.args.aspects.some((c) => !codes.includes(c))) throw new AIError("Aspek dari AI tidak tersedia pada rubrik aktif. Perintah perlu diperjelas.");
    const mentioned = explicitScopes(command, codes);
    if (mentioned.length) call.args.aspects = mentioned;
    const classFilter = explicitClass ? Number(explicitClass[1]) : /\b(semua|seluruh)\b/i.test(command) ? 0 : rombel;
    let filtered = students.filter((s) => !classFilter || s.rombel_id === classFilter);
    const statusFilter = /\bsemua\b/i.test(command)
      ? "all"
      : call.args.status !== "all" ? call.args.status
      : ["empty", "partial", "complete", "draft"].includes(context.status ?? "") ? context.status! : "all";
    if (statusFilter !== "all") filtered = filtered.filter((s) => s.result?.status === statusFilter);
    const payload: AIResponse = {
      kind: "result", title: "Hasil command", description: "Data dibaca dari database APaPSI; tidak dikirim ke AI.",
      activities: activity, workspaceId: workspace.id, provider, sourceTime: new Date().toISOString(),
    };
    const studentTools = ["GET_FINAL_SCORE", "GET_ASSESSMENT_HISTORY", "CREATE_ASSESSMENT_PLAN", "CREATE_STUDENT_CHANGE_PLAN", "CREATE_DEACTIVATION_PLAN", "CREATE_CLEAR_PLAN"];
    const explicitBatch = (explicitNpm.length > 1 && /\b(batch|semua|dan)\b/i.test(command)) || Boolean(revisionPlan && revisionPlan.payload.targets.length > 1);
    if (classFilter && ["GET_FINAL_SCORE", "GET_ASSESSMENT_HISTORY", "CREATE_ASSESSMENT_PLAN"].includes(call.name)) targets = targets.filter((s) => s.rombel_id === classFilter);
    if (call.name === "CREATE_ASSESSMENT_PLAN" && explicitBatch && explicitNpm.length > 0 && targets.length !== new Set(explicitNpm).size)
      throw new AIError("Tidak semua mahasiswa batch berada dalam konteks rombel ini. Sebutkan 'semua rombel' untuk batch lintas rombel; tidak ada perubahan dibuat.");
    if (studentTools.includes(call.name) && targets.length !== 1 && !(call.name === "CREATE_ASSESSMENT_PLAN" && explicitBatch && targets.length > 1)) {
      payload.kind = "clarification";
      payload.title = targets.length ? "Pilih mahasiswa yang dimaksud" : "Mahasiswa belum teridentifikasi";
      payload.description = targets.length
        ? "Nama memiliki beberapa kecocokan. Pilih berdasarkan NPM/rombel; tidak ada nilai yang diubah."
        : "Sebutkan NPM atau pilih mahasiswa lewat pencarian lokal. Tidak ada target yang ditebak.";
      payload.candidates = targets.map(identity);
    } else if (call.name === "CLARIFY") {
      payload.kind = "clarification";
      payload.title = "Perintah perlu diperjelas";
      payload.description = "Perjelas target dan jenis tindakan: nilai, statistik, rubrik, koreksi komponen, mahasiswa, konfigurasi atau import. Nilai akhir tidak bisa diedit langsung; credential dan arbitrary SQL tidak didukung.";
    } else if (call.name === "SEARCH_STUDENTS") {
      payload.title = "Hasil pencarian mahasiswa";
      payload.students = (targets.length ? targets : unknownName ? [] : filtered).slice(0, 100).map((s) => resultFor(s, current.config, versionNumber(s)));
    } else if (call.name === "GET_FINAL_SCORE" || call.name === "GET_MISSING_ASSESSMENTS") {
      payload.title = call.name === "GET_FINAL_SCORE" ? "Rincian penilaian mahasiswa" : "Mahasiswa tanpa nilai akhir resmi";
      const selected = call.name === "GET_FINAL_SCORE" ? targets : filtered.filter((s) => s.result?.status !== "complete");
      payload.students = selected.map((s) => resultFor(s, current.config, versionNumber(s)));
    } else if (call.name === "GET_RUBRIC") {
      payload.title = "Rubrik penilaian";
      payload.rubric = targets.length === 1 ? (targets[0].assessment?.config ?? current.config) : current.config;
      if (call.args.aspects.length) payload.rubric = { ...payload.rubric, aspects: payload.rubric.aspects.filter((a) => call.args.aspects.includes(a.code)) };
      payload.description = targets.length === 1
        ? "Menggunakan versi rubrik yang terikat pada penilaian mahasiswa; tidak memigrasikan nilai lama."
        : "Menggunakan rubrik aktif saat ini.";
    } else if (call.name === "GET_CLASS_STATISTICS") {
      payload.title = classFilter ? `Statistik Rombel ${classFilter}` : "Statistik seluruh rombel";
      payload.statistics = statistics(filtered, current.config, call.args.aspects[0] ?? "");
      if (/bandingkan|perbandingan/i.test(command))
        payload.comparison = [1, 2, 3, 4].map((r) => ({ rombel: r, statistics: statistics(students.filter((s) => s.rombel_id === r), current.config, call.args.aspects[0] ?? "") }));
      if (["minimum", "maximum"].includes(call.args.metric)) {
        const aspect = call.args.aspects[0];
        const extreme = call.args.metric === "minimum" ? payload.statistics.minimum : payload.statistics.maximum;
        payload.students = filtered
          .filter((s) => extreme !== null && (aspect ? s.result?.scores[aspect] === extreme : s.result?.status === "complete" && s.result.total === extreme))
          .map((s) => resultFor(s, current.config, versionNumber(s)));
      }
      payload.description = call.args.aspects.length
        ? "Statistik komponen memakai skor tersimpan yang tersedia, termasuk draft; skor kosong tidak dihitung sebagai nol."
        : "Statistik nilai akhir hanya memakai penilaian lengkap dan disahkan. Draft tidak masuk rata-rata.";
    } else if (call.name === "GET_ASSESSMENT_HISTORY") {
      payload.title = `Riwayat ${targets[0].name}`;
      payload.history = must(
        await ctx.db.from("assessment_logs").select("component,before_value,after_value,reason,created_at").eq("student_id", targets[0].id)
          .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30),
      ) as never;
    } else if (["CREATE_STUDENT_CHANGE_PLAN", "CREATE_DEACTIVATION_PLAN", "CREATE_CLEAR_PLAN", "CREATE_CONFIG_PLAN", "CREATE_PUBLISH_PLAN", "CREATE_IMPORT_PLAN"].includes(call.name)) {
      const admin = await buildAdmin(ctx, command, call.name, targets, current, codes);
      const row = await createPlan(ctx, workspace.id, command, admin, call.name);
      payload.kind = "plan";
      payload.adminPlan = presentAdmin(row);
      payload.title = "Rencana administrasi";
      payload.description = "Data inti belum berubah. Tinjau nilai lama/baru. Field privat tetap lokal; perubahan hanya berjalan setelah konfirmasi eksplisit.";
    } else if (call.name === "CREATE_ASSESSMENT_PLAN") {
      if (targets.length > 25) throw new AIError("Maksimal 25 mahasiswa per rencana.");
      const previous = revisionPlan;
      let scopes = explicitScopes(command, codes);
      if (!scopes.length) scopes = call.args.aspects.length ? call.args.aspects : (previous?.payload.scopes ?? []);
      if (!scopes.length) throw new AIError("Sebutkan komponen yang ingin dikoreksi, misalnya B1, B5, C, atau D1.");
      if (scopes.includes("A1") || scopes.includes("A2")) scopes = [...new Set([...scopes, "A1", "A2"])];
      if (previous) scopes = [...new Set([...previous.payload.scopes, ...scopes])];
      if (previous && (targets.length !== previous.payload.targets.length || previous.payload.targets.some((t: AIPlanTarget) => !targets.some((s) => s.id === t.student.id))))
        throw new AIError("Target revisi berbeda dari rencana sebelumnya. Buat rencana baru; mahasiswa dalam rencana lama tidak dihapus diam-diam.", 409);
      const notes = componentNotes(command, codes);
      if (targets.length > 1 && Object.keys(notes).length)
        throw new AIError("Catatan kualitatif batch perlu dipisahkan per mahasiswa. Buat rencana untuk satu mahasiswa agar catatan tidak diterapkan ke target yang salah.");
      const planned: AIPlanTarget[] = targets.map((student) => {
        const prior = previous?.payload.targets.find((t: AIPlanTarget) => t.student.id === student.id);
        if (previous && !prior) throw new AIError("Target rencana revisi berbeda. Buat rencana baru.");
        const config: Configuration = prior?.config ?? student.assessment?.config ?? current.config;
        const before = clone(prior?.before ?? student.assessment?.data ?? emptyData());
        const after = clone(prior?.after ?? before);
        const noteFor = (code: string) =>
          body.revisionAction === "ADD_INFORMATION" && notes[code]
            ? [after.scores[code]?.note, notes[code]].filter(Boolean).join("\n")
            : (notes[code] ?? after.scores[code]?.note ?? "");
        for (const code of scopes) {
          const aspect = config.aspects.find((a) => a.code === code && a.active);
          if (!aspect) throw new AIError(`Aspek ${code} tidak tersedia pada versi penilaian mahasiswa.`);
          if (aspect.kind === "criterion") {
            const score = explicitScore(command, code);
            if (score !== null) {
              const criterion = aspect.criteria.find((c) => c.active !== false && score >= c.min && score <= c.max);
              if (!criterion || !Number.isInteger(score)) throw new AIError(`Skor ${code} di luar rentang rubrik.`);
              after.scores[code] = { level: criterion.level, score, note: noteFor(code) };
            } else if (notes[code]) after.scores[code] = { level: "", score: null, note: noteFor(code) };
            else if (!after.scores[code]) after.scores[code] = { level: "", score: null, note: "" };
          }
        }
        validateAssessment(after, config);
        return {
          student: identity(student), revision: prior?.revision ?? student.assessment?.revision ?? 0,
          versionId: prior?.versionId ?? student.assessment?.version_id ?? current.id, config, before, after, preview: calculate(after, config),
        };
      });
      const planPayload = { scopes, targets: planned };
      let row: PlanRow;
      if (previous) {
        const locked = await ownedPlan(ctx, previous.id);
        if (locked.revision !== body.planRevision || locked.state !== "awaiting_review") throw new AIError("Rencana berubah; tinjau revisi terbaru.", 409);
        row = await updatePlan(ctx, locked, {
          revision: locked.revision + 1, payload: planPayload, payload_hash: hash(planPayload),
          command: `${locked.command}\nRevisi: ${command}`, expires_at: in15(),
        });
        await audit(ctx, "revised", command, call.name, workspace.id, row.id);
      } else row = await createPlan(ctx, workspace.id, command, planPayload, call.name);
      payload.kind = "plan";
      payload.plan = presentPlan(row);
      payload.title = "Rencana koreksi penilaian";
      payload.description = "Belum ada nilai yang disimpan. Catatan tiap komponen dipertahankan secara lokal, tanpa dikirim ke AI. Skor eksplisit dicocokkan dengan rubrik; catatan kualitatif memerlukan pilihan kategori/skor Anda, bukan tebakan AI. Setelah konfirmasi, perubahan disimpan sebagai draft.";
    }
    if (payload.kind === "clarification") machine.transition("NEEDS_CLARIFICATION");
    else if (payload.kind === "plan") { machine.transition("PLAN_READY"); machine.transition("WAITING_CONFIRMATION"); }
    else { machine.transition("VERIFYING_READ"); machine.transition("COMPLETED"); }
    payload.requestId = machine.requestId;
    payload.state = machine.state;
    await ctx.db.from("ai_workspaces").update({
      context: {
        targets: targets.map((s) => s.id), rombel: classFilter, scopes: call.args.aspects, commandState: machine.payload(),
        pathname: context.pathname, pageRombel: context.rombel ?? 0,
      } as never,
      updated_at: new Date().toISOString(),
    }).eq("id", workspace.id);
    await audit(ctx, "completed", command, call.name, workspace.id, payload.plan?.id ?? payload.adminPlan?.id, machine.payload());
    return json(payload);
  } catch (error) {
    if (machine.state !== "IDLE") machine.failure();
    if (workspaceId)
      await audit(ctx, "failed", "", "", workspaceId, undefined, { error: error instanceof AIError ? error.message : "Operasi gagal", ...machine.payload() }).catch(() => {});
    throw error;
  }
}

async function revisePlan(ctx: Ctx, id: string, body: any) {
  const row = await ownedPlan(ctx, id);
  if (row.state !== "awaiting_review" || new Date(row.expires_at).getTime() <= Date.now()) throw new AIError("Rencana sudah berakhir atau dibatalkan.", 409);
  if (body.revision !== row.revision || body.hash !== row.payload_hash) throw new AIError("Rencana berubah. Tinjau versi terbaru.", 409);
  if (row.payload.kind) {
    const payload = await reviseAdmin(ctx, row.payload, body.after);
    const revised = await updatePlan(ctx, row, { payload, payload_hash: hash(payload), revision: row.revision + 1, expires_at: in15() });
    await audit(ctx, "reviewed", "", "REVISE_ADMIN_PLAN", row.workspace_id, row.id);
    return presentAdmin(revised);
  }
  if (!Array.isArray(body.targets) || body.targets.length !== row.payload.targets.length) throw new AIError("Target rencana tidak cocok.");
  const scopes: string[] = row.payload.scopes;
  const targets = row.payload.targets.map((target: AIPlanTarget) => {
    const input = body.targets.find((i: { studentId: string }) => i.studentId === target.student.id)?.after as AssessmentData;
    if (!input || typeof input !== "object") throw new AIError("Revisi penilaian tidak valid.");
    const after = clone(target.after);
    for (const code of scopes) {
      const aspect = target.config.aspects.find((a) => a.code === code)!;
      if (aspect.kind === "criterion") after.scores[code] = input.scores?.[code];
      else if (aspect.kind === "average") after.meetings = input.meetings;
      else if (aspect.kind === "deduction") { after.violations = input.violations; after.d2Reviewed = input.d2Reviewed; }
      else after.submissions = input.submissions;
    }
    validateAssessment(after, target.config);
    return { ...target, after, preview: calculate(after, target.config) };
  });
  const payload = { scopes, targets };
  const revised = await updatePlan(ctx, row, { payload, payload_hash: hash(payload), revision: row.revision + 1, expires_at: in15() });
  await audit(ctx, "reviewed", "", "REVISE_ASSESSMENT_PLAN", row.workspace_id, row.id);
  return presentPlan(revised);
}

async function confirmPlan(ctx: Ctx, id: string, body: any) {
  const machine = new AIStateMachine("WAITING_CONFIRMATION");
  let planId: string | undefined;
  try {
    const row = await ownedPlan(ctx, id);
    planId = row.id;
    if (hash(row.payload) !== row.payload_hash) throw new AIError("Integritas rencana tidak valid. Buat rencana baru.", 409);
    if (body.confirm !== true || body.revision !== row.revision || body.hash !== row.payload_hash)
      throw new AIError("Konfirmasi eksplisit untuk revisi rencana ini diperlukan.", 409);
    if (row.state === "executed") return json(row.result);
    if (row.state !== "awaiting_review" || new Date(row.expires_at).getTime() <= Date.now())
      throw new AIError("Rencana kedaluwarsa/dibatalkan. Buat dan tinjau rencana baru.", 409);
    if (body.dirty === true) throw new AIError("Selesaikan input form yang belum tersimpan sebelum menjalankan AI.", 409);
    // Claim the plan first so a double-click cannot execute it twice.
    const claimed = await updatePlan(ctx, row, { state: "executing" });
    machine.transition("EXECUTING");
    try {
      if (claimed.payload.kind) {
        const outcome: Record<string, unknown> = await executeAdmin(ctx, claimed);
        machine.transition("VERIFYING");
        Object.assign(outcome, machine.completionPayload());
        await ctx.db.from("ai_plans").update({ state: "executed", result: outcome as never }).eq("id", row.id);
        await audit(ctx, "confirmed", row.command, claimed.payload.kind, row.workspace_id, row.id);
        await audit(ctx, "executed", "", claimed.payload.kind, row.workspace_id, row.id, machine.payload());
        machine.transition("COMPLETED");
        return json(outcome);
      }
      const targets: AIPlanTarget[] = claimed.payload.targets;
      if (!planReady(targets, claimed.payload.scopes)) throw new AIError("Tentukan kategori/skor dan tinjau perubahan sebelum konfirmasi.");
      const active = await activeVersion(ctx.db);
      // Verify every target before writing anything, so a stale batch saves nothing.
      for (const target of targets) {
        const student = must(await ctx.db.from("students").select("id,npm,name,rombel_id,study_case").eq("id", target.student.id).eq("active", true).maybeSingle());
        if (!student) throw new AIError("Mahasiswa sudah berubah/tidak aktif. Rencana harus ditinjau ulang.", 409);
        if (hash(identity(student)) !== hash(target.student)) throw new AIError("Identitas/studi kasus mahasiswa berubah setelah review. Buat rencana baru.", 409);
        const a = must(await ctx.db.from("assessments").select("revision,version_id,data").eq("student_id", target.student.id).maybeSingle());
        if ((a?.revision ?? 0) !== target.revision || (a?.version_id ?? active.id) !== target.versionId || hash(a?.data ?? emptyData()) !== hash(target.before))
          throw new AIError("Data/versi penilaian berubah setelah review. Tidak ada perubahan batch yang disimpan. Buat rencana baru.", 409);
      }
      const saved: unknown[] = [];
      for (const target of [...targets].sort((a, b) => a.student.id.localeCompare(b.student.id))) {
        saved.push(await saveAssessment(ctx, target.student.id, { data: target.after, revision: target.revision, verify: false, reason: `AI: ${row.command}`.slice(0, 1000) }, row.id));
        const persisted = must(await ctx.db.from("assessments").select("data,revision,state").eq("student_id", target.student.id).single());
        if (persisted.revision !== target.revision + 1 || persisted.state !== "draft" || hash(persisted.data) !== hash(target.after))
          throw new AIError("Verifikasi penyimpanan gagal.", 500);
      }
      machine.transition("VERIFYING");
      const outcome = { success: true, count: targets.length, saved, planId: row.id, ...machine.completionPayload() };
      await ctx.db.from("ai_plans").update({ state: "executed", result: outcome as never }).eq("id", row.id);
      await audit(ctx, "confirmed", row.command, "UPDATE_ASSESSMENT", row.workspace_id, row.id);
      await audit(ctx, "executed", "", targets.length > 1 ? "BATCH_UPDATE_ASSESSMENT" : "UPDATE_ASSESSMENT", row.workspace_id, row.id, { count: targets.length, ...machine.payload() });
      machine.transition("COMPLETED");
      return json(outcome);
    } catch (error) {
      // Release the claim so the reviewer can see the failure and re-plan.
      await ctx.db.from("ai_plans").update({ state: "awaiting_review" }).eq("id", row.id).eq("state", "executing");
      throw error;
    }
  } catch (error) {
    if (machine.state !== "COMPLETED") machine.failure(true);
    if (planId) await audit(ctx, "execution_failed", "", "UPDATE_ASSESSMENT", undefined, planId, machine.payload()).catch(() => {});
    throw error;
  }
}

export async function handleAi(ctx: Ctx, method: string, path: string, url: URL): Promise<Response> {
  try {
    const route = path.replace(/^\/ai/, "") || "/";
    const body = method === "GET" || method === "DELETE" ? {} : await ctx.request.json().catch(() => ({}));
    if (method === "GET" && route === "/status")
      return json({
        providers: providerStatuses().map((p) => ({ ...p, connection: connectionTests.get(`${p.id}:${p.model}`)?.status ?? "untested" })),
        defaultProvider: "gemini", privacy: "non-sensitive-only", maxCommandLength: 4000, maxBatch: 25,
        tools: ["Cari mahasiswa", "Nilai & kelengkapan", "Statistik", "Rubrik", "Riwayat", "Rencana koreksi terkonfirmasi"],
      });
    let match = route.match(/^\/providers\/([a-z]+)\/test$/);
    if (method === "POST" && match) {
      const info = providerStatuses()[0];
      const keyName = `${info.id}:${info.model}`;
      const previous = connectionTests.get(keyName);
      if (previous && Date.now() - previous.checkedAt < 30000) throw new AIError("Tunggu 30 detik sebelum menguji koneksi kembali.", 429);
      connectionTests.set(keyName, { status: "failed", checkedAt: Date.now() });
      await interpret(JSON.stringify({ instructionWords: "jumlah mahasiswa", mentionedAspects: [], currentRombel: 0, targetCount: 0 }));
      connectionTests.set(keyName, { status: "connected", checkedAt: Date.now() });
      await audit(ctx, "connection-tested", "", "TEST_CONNECTION", undefined, undefined, { provider: info.id, model: info.model });
      return json({ connected: true, provider: info.id, model: info.model });
    }
    if (method === "POST" && route === "/commands") return await commands(ctx, body);
    if (method === "DELETE" && route === "/context") {
      await ctx.db.from("ai_workspaces").update({ context: {} as never, updated_at: new Date().toISOString() }).eq("user_id", ctx.userId);
      await cancelOpenPlans(ctx);
      await audit(ctx, "context-cleared", "", "CLEAR_SESSION_CONTEXT");
      return json({ cleared: true });
    }
    if (method === "GET" && route === "/students") {
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
      if (!q) return json([]);
      const students = await studentList(ctx.db);
      return json(students.filter((s) => `${s.name} ${s.npm} ${s.study_case}`.toLowerCase().includes(q)).slice(0, 25).map(identity));
    }
    if (method === "GET" && route === "/history")
      return json(must(await ctx.db.from("ai_audit_events").select("command,intent,status,created_at").eq("actor_id", ctx.userId).neq("command", "").order("id", { ascending: false }).limit(20)));
    match = route.match(/^\/plans\/([^/]+)$/);
    if (method === "PATCH" && match) return json(await revisePlan(ctx, match[1], body));
    match = route.match(/^\/plans\/([^/]+)\/cancel$/);
    if (method === "POST" && match) {
      const row = await ownedPlan(ctx, match[1]);
      if (row.state !== "awaiting_review") throw new AIError("Rencana tidak dapat dibatalkan.", 409);
      await updatePlan(ctx, row, { state: "cancelled" });
      await audit(ctx, "cancelled", "", "CANCEL_PLAN", row.workspace_id, row.id);
      return json({ success: true });
    }
    match = route.match(/^\/plans\/([^/]+)\/confirm$/);
    if (method === "POST" && match) return await confirmPlan(ctx, match[1], body);
    return json({ message: "Endpoint tidak ditemukan." }, 404);
  } catch (error) {
    if (error instanceof AIError) return json({ message: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
    throw error;
  }
}
