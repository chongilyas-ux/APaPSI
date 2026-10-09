// @ts-nocheck -- ported verbatim from the original app, which was type-checked under its own (less strict) settings.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useRevalidator, useNavigate, Link } from "@/lib/rr";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileCheck2,
  Fingerprint,
  ListFilter,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, json, ApiError } from "./api";
import AIAdminReview from "./AIAdminReview";
import { Button, Card, Field, Modal, Spinner, Status, inputClass } from "./components";
import { calculate, formatScore, slotKey, type AssessmentData } from "@/lib/domain";
import type {
  AIContext,
  AIPlan,
  AIAdminPlan,
  AIPlanTarget,
  AIResponse,
  ProviderName,
  ProviderStatus,
} from "@/lib/ai-shared";

type OpenCommandWorkspace = (command?: string, tab?: string) => void;
const Workspace = createContext<OpenCommandWorkspace>(() => {});
const clone = <Value,>(value: Value): Value => JSON.parse(JSON.stringify(value));
export function AIEntry({ compact = false, tab = "Command" }: { compact?: boolean; tab?: string }) {
  const open = useContext(Workspace);
  return (
    <Button
      aria-label="AI Assistant"
      variant="secondary"
      onClick={() => open(undefined, tab)}
      className={compact ? "px-2.5 py-2 text-xs" : ""}
    >
      <Sparkles size={15} className="text-teal-700" />
      <span className={compact ? "hidden sm:inline" : ""}>AI Assistant</span>
    </Button>
  );
}
export function AICommandBox() {
  const open = useContext(Workspace);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const rombel =
    location.pathname === "/penilaian"
      ? Number(params.get("rombel") ?? (params.get("q") ? 0 : 1))
      : 0;
  const [command, setCommand] = useState("");
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Sparkles size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">AI Command Center</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rombel ? `Konteks: Rombel ${rombel}` : "Konteks: Semua rombel"} · Tetap Anda yang
              memutuskan.
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-teal-700">
          <LockKeyhole size={12} />
          Data penilaian tetap lokal
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          open(command);
        }}
        className="flex gap-3 p-5"
      >
        <input
          aria-label="Command AI"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          maxLength={4000}
          placeholder={
            rombel
              ? `Tanyakan nilai atau penilaian di Rombel ${rombel}…`
              : "Tanyakan sesuatu tentang mahasiswa, penilaian, atau nilai…"
          }
          className={`${inputClass} min-w-0 text-sm`}
        />
        <Button type="submit">
          <ArrowRight size={16} />
          <span className="hidden whitespace-nowrap sm:inline">Buka workspace</span>
        </Button>
      </form>
      <div className="flex flex-wrap gap-2 px-5 pb-5">
        {[
          "Siapa yang belum dinilai?",
          rombel ? `Statistik Rombel ${rombel}` : "Statistik seluruh rombel",
          "Tampilkan rubrik B5",
          "Bantu menilai berdasarkan catatan",
        ].map((suggestion) => (
          <Button
            key={suggestion}
            variant="ghost"
            className="bg-muted px-3 py-1.5 text-xs"
            onClick={() => open(suggestion)}
          >
            {suggestion}
            <ChevronRight size={12} />
          </Button>
        ))}
      </div>
    </Card>
  );
}

function PlanEditor({
  plan,
  onChange,
  onConfirmed,
  onRevise,
  isDirty,
}: {
  plan: AIPlan;
  onChange: (plan: AIPlan) => void;
  onConfirmed: (plan: AIPlan) => Promise<void>;
  onRevise: (mode: string) => void;
  isDirty: boolean;
}) {
  const [targets, setTargets] = useState(() => clone(plan.targets));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(false);
  const changed = JSON.stringify(targets) !== JSON.stringify(plan.targets);
  const update = (id: string, change: (data: AssessmentData) => void) =>
    setTargets((current) =>
      current.map((target) => {
        if (target.student.id !== id) return target;
        const after = clone(target.after);
        change(after);
        return { ...target, after, preview: calculate(after, target.config) };
      }),
    );
  async function saveReview() {
    setBusy(true);
    setError("");
    try {
      onChange(
        await api<AIPlan>(`/ai/plans/${plan.id}`, {
          method: "PATCH",
          body: json({
            revision: plan.revision,
            hash: plan.hash,
            targets: targets.map((target) => ({
              studentId: target.student.id,
              after: target.after,
            })),
          }),
        }),
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await api(`/ai/plans/${plan.id}/cancel`, { method: "POST" });
      onChange({ ...plan, state: "cancelled" });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirmed(plan);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = plan.state === "awaiting_review";
  return (
    <Card className="mt-5 overflow-hidden">
      <div className="border-b border-border bg-teal-50/50 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <FileCheck2 size={17} />
            Rencana penilaian · {targets.length} mahasiswa
          </h3>
          <span className="rounded-full bg-white px-2 py-1 text-xs text-teal-700">
            {active
              ? `Review · revisi ${plan.revision}`
              : plan.state === "executed"
                ? "Tersimpan sebagai draft"
                : "Dibatalkan"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {plan.scopes.join(" · ")} · Skor dan catatan di bawah hanya diproses backend. Penyimpanan
          tidak mengesahkan nilai.
        </p>
      </div>
      {targets.length > 1 && (
        <div className="flex gap-2 border-b border-border px-5 py-3">
          <Button
            variant={summary ? "secondary" : "primary"}
            className="text-xs"
            onClick={() => setSummary(false)}
          >
            Review semua
          </Button>
          <Button
            variant={summary ? "primary" : "secondary"}
            className="text-xs"
            onClick={() => setSummary(true)}
          >
            Ringkasan perubahan
          </Button>
        </div>
      )}
      <fieldset disabled={!active || busy} className="min-w-0 divide-y divide-border">
        {targets.map((target) => (
          <section key={target.student.id} className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{target.student.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {target.student.npm} · Rombel {target.student.rombel_id} · Rubrik terikat versi
                </p>
              </div>
              <span className="rounded-lg bg-muted px-3 py-2 text-xs">
                Subtotal draft: <strong>{formatScore(target.preview.total)}</strong> ·{" "}
                {target.preview.completed}/{target.preview.required}
              </span>
            </div>
            {summary ? (
              <div className="space-y-2">
                {plan.scopes.map((code) => (
                  <div className="flex items-center justify-between text-xs" key={code}>
                    <span>{code}</span>
                    <span>
                      {formatScore(calculate(target.before, target.config).scores[code])} →{" "}
                      <strong>{formatScore(target.preview.scores[code])}</strong>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {target.config.aspects
                  .filter((aspect) => plan.scopes.includes(aspect.code))
                  .map((aspect) => (
                    <div key={aspect.code} className="rounded-lg border border-border p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold">
                          {aspect.code} — {aspect.name}
                        </h4>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Maks. {aspect.max}
                        </span>
                      </div>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Sebelum:{" "}
                        {formatScore(calculate(target.before, target.config).scores[aspect.code])} →
                        Usulan: {formatScore(target.preview.scores[aspect.code])}
                      </p>
                      {aspect.kind === "criterion" && (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Kategori">
                              <select
                                aria-label={`${target.student.npm} ${aspect.code} kategori`}
                                className={`${inputClass} text-xs`}
                                value={target.after.scores[aspect.code]?.level ?? ""}
                                onChange={(event) =>
                                  update(target.student.id, (data) => {
                                    const criterion = aspect.criteria.find(
                                      (item) => item.level === event.target.value,
                                    );
                                    data.scores[aspect.code] = {
                                      level: event.target.value,
                                      score:
                                        criterion && criterion.min === criterion.max
                                          ? criterion.min
                                          : null,
                                      note: data.scores[aspect.code]?.note ?? "",
                                    };
                                  })
                                }
                              >
                                <option value="">Pilih kategori</option>
                                {aspect.criteria
                                  .filter((item) => item.active !== false)
                                  .map((item) => (
                                    <option key={item.level} value={item.level}>
                                      {item.level} · {item.min}–{item.max}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                            <Field label="Skor dalam rentang">
                              <select
                                aria-label={`${target.student.npm} ${aspect.code} skor`}
                                className={`${inputClass} text-xs`}
                                value={target.after.scores[aspect.code]?.score ?? ""}
                                onChange={(event) =>
                                  update(target.student.id, (data) => {
                                    data.scores[aspect.code].score =
                                      event.target.value === "" ? null : Number(event.target.value);
                                  })
                                }
                              >
                                <option value="">Pilih skor</option>
                                {(() => {
                                  const criterion = aspect.criteria.find(
                                    (item) =>
                                      item.level === target.after.scores[aspect.code]?.level,
                                  );
                                  return criterion
                                    ? Array.from(
                                        { length: criterion.max - criterion.min + 1 },
                                        (_, index) => criterion.min + index,
                                      ).map((score) => (
                                        <option key={score} value={score}>
                                          {score}
                                        </option>
                                      ))
                                    : [];
                                })()}
                              </select>
                            </Field>
                          </div>
                          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            {aspect.criteria.find(
                              (item) => item.level === target.after.scores[aspect.code]?.level,
                            )?.description ??
                              "Pilih kategori berdasarkan rubrik resmi, bukan tebakan AI."}
                          </p>
                          <Field label="Catatan lokal — tidak dikirim ke provider">
                            <textarea
                              aria-label={`${target.student.npm} ${aspect.code} catatan`}
                              maxLength={4000}
                              rows={2}
                              className={`${inputClass} mt-1 text-xs`}
                              value={target.after.scores[aspect.code]?.note ?? ""}
                              onChange={(event) =>
                                update(target.student.id, (data) => {
                                  data.scores[aspect.code] = {
                                    level: data.scores[aspect.code]?.level ?? "",
                                    score: data.scores[aspect.code]?.score ?? null,
                                    note: event.target.value,
                                  };
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                      {aspect.kind === "average" && (
                        <div className="space-y-3">
                          {target.config.meetings
                            .filter((meeting) => meeting.active)
                            .map((meeting) => (
                              <div key={meeting.id} className="flex flex-wrap items-center gap-3">
                                <span className="flex-1 text-xs">{meeting.name}</span>
                                <input
                                  aria-label={`${target.student.npm} ${meeting.name} D1`}
                                  type="number"
                                  min={0}
                                  max={10}
                                  step={1}
                                  disabled={target.after.meetings[meeting.id]?.excused}
                                  className={`${inputClass} w-20 text-xs`}
                                  value={target.after.meetings[meeting.id]?.score ?? ""}
                                  onChange={(event) =>
                                    update(target.student.id, (data) => {
                                      data.meetings[meeting.id] = {
                                        score:
                                          event.target.value === ""
                                            ? null
                                            : Number(event.target.value),
                                        excused: false,
                                      };
                                    })
                                  }
                                />
                                <label className="flex items-center gap-1.5 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={target.after.meetings[meeting.id]?.excused ?? false}
                                    onChange={(event) =>
                                      update(target.student.id, (data) => {
                                        data.meetings[meeting.id] = {
                                          excused: event.target.checked,
                                          score: null,
                                        };
                                      })
                                    }
                                  />
                                  Izin sah
                                </label>
                              </div>
                            ))}
                        </div>
                      )}
                      {aspect.kind === "deduction" && (
                        <div className="space-y-3">
                          {target.config.violations
                            .filter((item) => item.active)
                            .map((violation) => (
                              <div key={violation.code} className="flex items-center gap-3">
                                <span className="flex-1 text-xs">
                                  {violation.code} — {violation.name}{" "}
                                  <span className="text-muted-foreground">
                                    (−{violation.penalty}/kejadian)
                                  </span>
                                </span>
                                <input
                                  aria-label={`${target.student.npm} ${violation.code}`}
                                  type="number"
                                  min={0}
                                  max={10000}
                                  step={1}
                                  value={target.after.violations[violation.code] ?? 0}
                                  className={`${inputClass} w-20 text-xs`}
                                  onChange={(event) =>
                                    update(target.student.id, (data) => {
                                      data.violations[violation.code] = Number(event.target.value);
                                    })
                                  }
                                />
                              </div>
                            ))}
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={target.after.d2Reviewed}
                              onChange={(event) =>
                                update(target.student.id, (data) => {
                                  data.d2Reviewed = event.target.checked;
                                })
                              }
                            />
                            D2 telah diperiksa, termasuk jika tidak ada pelanggaran
                          </label>
                        </div>
                      )}
                      {(aspect.kind === "submission-time" ||
                        aspect.kind === "submission-content") && (
                        <div className="space-y-3">
                          {target.config.meetings
                            .filter((meeting) => meeting.active)
                            .flatMap((meeting) =>
                              target.config.slots.map((slot) => {
                                const key = slotKey(meeting.id, slot);
                                const field =
                                  aspect.kind === "submission-time" ? "time" : "content";
                                return (
                                  <div key={key} className="grid grid-cols-2 items-center gap-3">
                                    <span className="text-xs">
                                      {meeting.name} · {slot}
                                    </span>
                                    <select
                                      aria-label={`${target.student.npm} ${key} ${aspect.code}`}
                                      className={`${inputClass} text-xs`}
                                      value={target.after.submissions[key]?.[field] ?? ""}
                                      onChange={(event) =>
                                        update(target.student.id, (data) => {
                                          const value = event.target.value;
                                          const item = data.submissions[key] ?? {
                                            time: "",
                                            content: "",
                                          };
                                          data.submissions[key] =
                                            value === "missing"
                                              ? { time: "missing", content: "missing" }
                                              : {
                                                  ...item,
                                                  [field]: value,
                                                  ...(item.time === "missing"
                                                    ? {
                                                        [field === "time" ? "content" : "time"]: "",
                                                      }
                                                    : {}),
                                                };
                                        })
                                      }
                                    >
                                      <option value="">Belum dicatat</option>
                                      {(field === "time"
                                        ? [
                                            ["on-time", "Tepat waktu"],
                                            ["late", "Terlambat"],
                                            ["missing", "Tidak mengumpulkan"],
                                          ]
                                        : [
                                            ["suitable", "Sesuai"],
                                            ["lacking", "Masih kurang"],
                                            ["unreadable", "Tidak bisa dibuka"],
                                            ["missing", "Tidak mengumpulkan"],
                                          ]
                                      ).map(([value, label]) => (
                                        <option key={value} value={value}>
                                          {label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              }),
                            )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>
        ))}
      </fieldset>
      <div className="border-t border-border bg-muted/30 p-5">
        {error && (
          <p role="alert" className="mb-3 text-xs text-red-700">
            {error}
          </p>
        )}
        {isDirty && (
          <p className="mb-3 text-xs text-amber-700">
            Ada input form belum tersimpan. Selesaikan form sebelum eksekusi AI.
          </p>
        )}
        {active && (
          <>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck size={13} className="mr-1 inline" />
              Konfirmasi menyimpan seluruh perubahan di atas sebagai draft. Rencana berlaku sampai{" "}
              {new Date(plan.expiresAt).toLocaleTimeString("id-ID")}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={cancel}>
                <X size={13} />
                Batalkan
              </Button>
              <Button variant="ghost" disabled={busy || changed} onClick={() => onRevise("Revisi")}>
                <Pencil size={13} />
                Revisi command
              </Button>
              <Button
                variant="ghost"
                disabled={busy || changed}
                onClick={() => onRevise("Tambahkan informasi")}
              >
                <Plus size={13} />
                Tambahkan informasi
              </Button>
              {changed ? (
                <Button disabled={busy} onClick={saveReview}>
                  {busy ? <Spinner /> : <Check size={14} />}Simpan revisi rencana
                </Button>
              ) : (
                <Button disabled={busy || !plan.ready || isDirty} onClick={confirm}>
                  {busy ? <Spinner /> : <CheckCheck size={14} />}Konfirmasi dan simpan draft
                </Button>
              )}
            </div>
            {!plan.ready && !changed && (
              <p className="mt-3 text-xs text-amber-700">
                Lengkapi pilihan skor/komponen dan pastikan ada perubahan sebelum konfirmasi.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Result({ result }: { result: AIResponse }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [result.sourceTime]);
  return (
    <div className="space-y-4">
      {result.comparison && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="p-2">Rombel</th>
                <th className="p-2">Mahasiswa</th>
                <th className="p-2">Disahkan</th>
                <th className="p-2">Progress</th>
                <th className="p-2">Rata-rata</th>
              </tr>
            </thead>
            <tbody>
              {result.comparison.map((item) => (
                <tr key={item.rombel} className="border-b border-border">
                  <td className="p-2">{item.rombel}</td>
                  <td className="p-2">{item.statistics.total}</td>
                  <td className="p-2">{item.statistics.complete}</td>
                  <td className="p-2">{item.statistics.percentage.toFixed(1)}%</td>
                  <td className="p-2">{formatScore(item.statistics.average)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <h3 className="text-base font-semibold">{result.title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{result.description}</p>
      </div>
      {result.statistics && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Mahasiswa", result.statistics.total],
              ["Disahkan", result.statistics.complete],
              ["Progress", `${result.statistics.percentage.toFixed(1)}%`],
              ["Rata-rata", formatScore(result.statistics.average)],
              ["Belum dinilai", result.statistics.empty],
              ["Belum lengkap", result.statistics.partial],
              ["Draft Excel", result.statistics.draft],
              [
                "Min / maks",
                `${formatScore(result.statistics.minimum)} / ${formatScore(result.statistics.maximum)}`,
              ],
            ].map(([label, value]) => (
              <Card key={label} className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-lg font-semibold">{value}</p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Sampel nilai: {result.statistics.count} ·{" "}
            {result.statistics.aspect || "nilai akhir resmi"}
          </p>
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-semibold">Komponen yang belum lengkap</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(result.statistics.missing).map(([code, count]) => (
                <span
                  key={code}
                  className="rounded border border-border bg-white px-2 py-1 text-xs"
                >
                  {code}: {count}
                </span>
              ))}
            </div>
            {result.statistics.distribution.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {result.statistics.distribution.map((item) => (
                  <span key={item.label} className="text-xs">
                    {item.label}: <strong>{item.count}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {result.students && (
        <div className="space-y-3">
          {!result.students.length && (
            <p className="text-sm text-muted-foreground">
              Tidak ada mahasiswa yang sesuai dengan filter.
            </p>
          )}
          {result.students.slice(page * 25, page * 25 + 25).map((item) => (
            <Card key={item.student.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    to={`/penilaian/rombel-${item.student.rombel_id}/${item.student.npm}`}
                    className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {item.student.name}
                    <ChevronRight size={13} className="ml-1 inline" />
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.student.npm} · Rombel {item.student.rombel_id} · Rubrik v{item.version}
                  </p>
                </div>
                <Status result={item.result} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(item.result.scores).map(([code, value]) => (
                  <span
                    key={code}
                    className={`rounded px-2 py-1 text-xs ${value === null ? "bg-amber-50 text-amber-800" : "bg-muted"}`}
                  >
                    {code}: {formatScore(value)}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold">
                {item.result.status === "complete"
                  ? "Nilai akhir resmi"
                  : "Subtotal sementara — bukan nilai sah"}
                : {formatScore(item.result.total)} · {item.result.completed}/{item.result.required}
              </p>
              {item.explanations.map((reason) => (
                <p key={reason} className="mt-2 text-xs text-muted-foreground">
                  • {reason}
                </p>
              ))}
              {item.submissions &&
                Object.values(item.submissions).some((slot) =>
                  ["missing", "unreadable", "lacking"].includes(slot.content),
                ) && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-medium">
                      Bukti status pengumpulan tersimpan
                    </summary>
                    {Object.entries(item.submissions)
                      .filter(([, slot]) =>
                        ["missing", "unreadable", "lacking"].includes(slot.content),
                      )
                      .map(([slot, value]) => (
                        <p className="mt-2 text-muted-foreground" key={slot}>
                          {slot}:{" "}
                          {value.content === "missing"
                            ? "Tidak mengumpulkan"
                            : value.content === "unreadable"
                              ? "Tidak bisa dibuka"
                              : "Isi masih kurang"}
                        </p>
                      ))}
                  </details>
                )}
            </Card>
          ))}
        </div>
      )}
      {result.students && result.students.length > 25 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            disabled={!page}
            onClick={() => setPage((current) => current - 1)}
          >
            Sebelumnya
          </Button>
          <span className="text-xs text-muted-foreground">
            {page * 25 + 1}–{Math.min((page + 1) * 25, result.students.length)} dari{" "}
            {result.students.length}
          </span>
          <Button
            variant="secondary"
            disabled={(page + 1) * 25 >= result.students.length}
            onClick={() => setPage((current) => current + 1)}
          >
            Berikutnya
          </Button>
        </div>
      )}
      {result.rubric &&
        result.rubric.aspects
          .filter((aspect) => aspect.active)
          .map((aspect) => (
            <Card key={aspect.code} className="p-4">
              <h4 className="text-sm font-semibold">
                {aspect.code} — {aspect.name} · {aspect.max}
              </h4>
              <div className="mt-3 space-y-3">
                {aspect.criteria
                  .filter((criterion) => criterion.active !== false)
                  .map((criterion) => (
                    <div key={criterion.level}>
                      <p className="text-xs font-medium">
                        {criterion.level} · {criterion.min}–{criterion.max}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {criterion.description}
                      </p>
                    </div>
                  ))}
              </div>
            </Card>
          ))}
      {result.history && (
        <div className="divide-y divide-border">
          {!result.history.length && (
            <p className="text-xs text-muted-foreground">Belum ada riwayat perubahan.</p>
          )}
          {result.history.map((item, index) => (
            <div key={index} className="py-3 text-xs">
              <p className="font-semibold">{item.component}</p>
              <p className="mt-2 break-words text-muted-foreground">
                {JSON.stringify(item.before_value)} → {JSON.stringify(item.after_value)}
              </p>
              <p className="mt-2 text-muted-foreground">
                {item.reason} · {new Date(item.created_at).toLocaleString("id-ID")}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Fingerprint size={12} />
        Sumber: PostgreSQL APaPSI · {new Date(result.sourceTime).toLocaleTimeString("id-ID")}
      </p>
    </div>
  );
}

export default function AIWorkspaceProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [provider, setProvider] = useState<ProviderName>("gemini");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [paid, setPaid] = useState(false);
  const [tab, setTab] = useState("Command");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AIResponse | null>(null);
  const [providerFailure, setProviderFailure] = useState(false);
  const [revisionMode, setRevisionMode] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [candidates, setCandidates] = useState<AIPlanTarget["student"][]>([]);
  const [history, setHistory] = useState<
    { command: string; intent: string; status: string; created_at: string }[]
  >([]);
  const draftMap = useRef(new Map<string, boolean>());
  const [draftVersion, setDraftVersion] = useState(0);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const currentRoute = useRef(location.pathname + location.search);
  currentRoute.current = location.pathname + location.search;
  const commandRequest = useRef(0);
  const searchRequest = useRef(0);
  const initializedProvider = useRef(false);
  const params = new URLSearchParams(location.search);
  const match = location.pathname.match(/\/penilaian\/rombel-([1-4])\/(\d{10})/);
  const context: AIContext = {
    pathname: location.pathname,
    rombel: match
      ? Number(match[1])
      : Number(
          params.get("rombel") ??
            (["/mahasiswa", "/penilaian", "/nilai-akhir"].includes(location.pathname) &&
            !params.get("q")
              ? 1
              : 0),
        ),
    npm: match?.[2],
    status: params.get("status") ?? undefined,
    dirty: contextDirty(),
  };
  function contextDirty() {
    return [...draftMap.current.values()].some(Boolean);
  }
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ npm: string; dirty: boolean }>).detail;
      draftMap.current.set(detail.npm, detail.dirty);
      setDraftVersion((version) => version + 1);
    };
    window.addEventListener("apapsi-assessment-state", listener);
    return () => window.removeEventListener("apapsi-assessment-state", listener);
  }, []);
  async function refresh() {
    try {
      const [status, items] = await Promise.all([
        api<{ providers: ProviderStatus[]; defaultProvider: ProviderName }>("/ai/status"),
        api<typeof history>("/ai/history"),
      ]);
      setProviders(status.providers);
      if (!initializedProvider.current) {
        setProvider(status.defaultProvider);
        initializedProvider.current = true;
      }
      setHistory(items);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  useEffect(() => {
    if (open) void refresh();
  }, [open]);
  useEffect(() => {
    searchRequest.current++;
    setCandidates([]);
  }, [localSearch]);
  useEffect(() => {
    commandRequest.current++;
    searchRequest.current++;
    setBusy(false);
    setProviderFailure(false);
    setResult(null);
    setCommand("");
    setRevisionMode("");
    setCandidates([]);
    setLocalSearch("");
    setError("");
    setOpen(false);
  }, [location.pathname, location.search]);
  const selectedProvider = providers.find((item) => item.id === provider);
  const isDirty = Boolean(draftVersion >= 0 && contextDirty());
  async function submit(selectedIds?: string[]) {
    if (!command.trim()) return;
    const submittedRoute = currentRoute.current;
    const requestId = ++commandRequest.current;
    setBusy(true);
    setError("");
    setProviderFailure(false);
    try {
      const next = await api<AIResponse>("/ai/commands", {
        method: "POST",
        body: json({
          command,
          provider,
          acknowledgePaid: paid,
          context,
          selectedIds,
          ...(revisionMode && result?.plan
            ? {
                planId: result.plan.id,
                planRevision: result.plan.revision,
                revisionAction:
                  revisionMode === "Tambahkan informasi" ? "ADD_INFORMATION" : "REVISE",
              }
            : {}),
        }),
      });
      if (submittedRoute !== currentRoute.current || requestId !== commandRequest.current) return;
      setResult(next);
      setCandidates(next.candidates ?? []);
      setRevisionMode("");
      await refresh();
    } catch (failure) {
      if (submittedRoute !== currentRoute.current || requestId !== commandRequest.current) return;
      setError((failure as Error).message);
      setProviderFailure(
        failure instanceof ApiError && Boolean(failure.code?.startsWith("PROVIDER_")),
      );
    } finally {
      if (submittedRoute === currentRoute.current && requestId === commandRequest.current)
        setBusy(false);
    }
  }
  async function searchLocal() {
    const submittedRoute = currentRoute.current;
    const requestId = ++searchRequest.current;
    try {
      const matches = await api<AIPlanTarget["student"][]>(
        `/ai/students?q=${encodeURIComponent(localSearch)}`,
      );
      if (submittedRoute === currentRoute.current && requestId === searchRequest.current)
        setCandidates(matches);
    } catch (failure) {
      if (submittedRoute !== currentRoute.current || requestId !== searchRequest.current) return;
      setError((failure as Error).message);
    }
  }
  function updatePlan(plan: AIPlan) {
    setResult((current) => (current ? { ...current, plan } : current));
  }
  async function confirm(plan: AIPlan | AIAdminPlan) {
    if (contextDirty()) throw new Error("Ada form dengan input belum tersimpan.");
    const outcome = await api<{
      saved: { student_id: string; data: AssessmentData; revision: number; state: string }[];
    }>(`/ai/plans/${plan.id}/confirm`, {
      method: "POST",
      body: json({ confirm: true, revision: plan.revision, hash: plan.hash, dirty: isDirty }),
    });
    for (const saved of outcome.saved)
      window.dispatchEvent(new CustomEvent("apapsi-ai-saved", { detail: saved }));
    if ("targets" in plan) updatePlan({ ...plan, state: "executed" });
    else
      setResult((current) =>
        current ? { ...current, adminPlan: { ...plan, state: "executed" } } : current,
      );
    if (!("targets" in plan) && plan.student && plan.student.npm === context.npm) {
      if (plan.kind === "student")
        navigate(`/penilaian/rombel-${plan.after.rombel_id}/${plan.after.npm}`);
      if (plan.kind === "deactivate") navigate(`/mahasiswa?rombel=${plan.student.rombel_id}`);
    }
    revalidator.revalidate();
    await refresh();
    toast.success(
      "targets" in plan
        ? "Perubahan tersimpan dan diverifikasi sebagai draft"
        : "Tindakan tersimpan dan diverifikasi",
    );
  }
  return (
    <Workspace.Provider
      value={(prefill, selectedTab) => {
        if (prefill) setCommand(prefill);
        setOpen(true);
        setTab(selectedTab ?? "Command");
      }}
    >
      {children}
      {open && (
        <Modal
          title="AI Workspace"
          wide
          onClose={() => {
            setOpen(false);
          }}
        >
          <div className="-mx-6 -mt-6">
            <div className="border-b border-border bg-muted/40 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-teal-800">
                  <ShieldCheck size={14} />
                  Strict · Mode non-sensitif · Database tidak dikirim
                </div>
                <span className="text-xs text-muted-foreground">
                  {context.npm
                    ? `${context.npm} · Rombel ${context.rombel}`
                    : context.rombel
                      ? `Rombel ${context.rombel}`
                      : "Konteks halaman + sesi"}
                </span>
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api("/ai/context", { method: "DELETE" });
                      setResult(null);
                      setCommand("");
                      setRevisionMode("");
                      setCandidates([]);
                      setLocalSearch("");
                      await refresh();
                      toast.success(
                        "Konteks sesi dibersihkan; plan tertunda dibatalkan. Audit tetap disimpan.",
                      );
                    } catch (failure) {
                      setError((failure as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Bersihkan sesi
                </Button>
              </div>
              <div className="mt-4 flex gap-5">
                {["Command", "Riwayat", "Konfigurasi"].map((item) => (
                  <button
                    key={item}
                    onClick={() => setTab(item)}
                    className={`border-b-2 pb-2 text-xs font-semibold ${tab === item ? "border-teal-600 text-teal-800" : "border-transparent text-muted-foreground"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-6 py-5">
              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-xs leading-relaxed text-red-700"
                >
                  {error}
                </p>
              )}
              {error && providerFailure && (
                <Card className="mb-4 flex flex-wrap items-center gap-3 p-3 text-xs text-muted-foreground">
                  Command tetap tersedia. Tidak ada pergantian provider otomatis.
                  <Button variant="secondary" onClick={() => setTab("Konfigurasi")}>
                    Periksa provider
                  </Button>
                  {tab === "Command" && (
                    <Button
                      variant="secondary"
                      disabled={
                        busy || !selectedProvider?.ready || (provider !== "gemini" && !paid)
                      }
                      onClick={() => void submit()}
                    >
                      <RefreshCw size={13} />
                      Coba lagi
                    </Button>
                  )}
                </Card>
              )}
              {tab === "Konfigurasi" ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Provider & kontrol biaya</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Gemini adalah default. Claude dan OpenAI hanya dipakai setelah dipilih dan
                    disetujui; tidak ada fallback berbayar otomatis. Label tersedia berarti API key
                    dikonfigurasi, bukan jaminan saldo atau kuota.
                  </p>
                  {providers.map((item) => (
                    <Card key={item.id} className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-semibold">
                          {item.name}
                          {item.id === "gemini" ? " · default" : " · opsional"}
                        </p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{item.model}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-xs ${item.ready ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-800"}`}
                      >
                        {item.connection === "connected"
                          ? "Connected · diuji"
                          : item.connection === "failed"
                            ? "Connection failed"
                            : item.ready
                              ? "Key/model dikonfigurasi"
                              : "Belum dikonfigurasi"}
                      </span>
                      <Button
                        variant="secondary"
                        className="text-xs"
                        disabled={busy || !item.ready}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          setProviderFailure(false);
                          try {
                            await api(`/ai/providers/${item.id}/test`, {
                              method: "POST",
                              body: json({}),
                            });
                            await refresh();
                            toast.success(`Koneksi ${item.name} berhasil diuji`);
                          } catch (failure) {
                            setError((failure as Error).message);
                            setProviderFailure(
                              failure instanceof ApiError &&
                                Boolean(failure.code?.startsWith("PROVIDER_")),
                            );
                            await refresh();
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Test Connection
                      </Button>
                    </Card>
                  ))}
                  <Card className="space-y-3 p-4">
                    <p className="text-xs font-semibold">
                      Environment server — bukan melalui command
                    </p>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                      {
                        "AI_PROVIDER=gemini\nAI_MODEL=…\nAI_API_KEY=…\nAI_MAX_TOKENS=2048\nAI_TIMEOUT=20000\n\nGEMINI_API_KEY=…\nGEMINI_MODEL=…\nCLAUDE_API_KEY=…\nCLAUDE_MODEL=…\nOPENAI_API_KEY=…\nOPENAI_MODEL=…"
                      }
                    </pre>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Jangan menggunakan VITE_* untuk API key. Free tier mengikuti batas project
                      Google; Claude/OpenAI menggunakan kredit API, bukan kuota chat web. Batas
                      aplikasi: 10 command/menit, 100/hari, 25 mahasiswa/batch.
                    </p>
                    <Button variant="secondary" onClick={refresh}>
                      <RefreshCw size={13} />
                      Periksa konfigurasi
                    </Button>
                  </Card>
                </div>
              ) : tab === "Riwayat" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Aktivitas session ini</h3>
                    <Button variant="ghost" onClick={refresh}>
                      <RefreshCw size={13} />
                      Muat ulang
                    </Button>
                  </div>
                  {!history.length && (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      Belum ada command dalam sesi ini.
                    </p>
                  )}
                  {history.map((item, index) => (
                    <Card key={index} className="p-4">
                      <p className="whitespace-pre-wrap text-xs">{item.command}</p>
                      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock3 size={12} />
                        {item.status} · {item.intent || "request"} ·{" "}
                        {new Date(item.created_at).toLocaleTimeString("id-ID")}
                      </p>
                    </Card>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={17} className="text-teal-700" />
                      <h3 className="text-sm font-semibold">Satu command, tindakan terarah.</h3>
                    </div>
                    <select
                      aria-label="Provider AI"
                      disabled={busy}
                      value={provider}
                      onChange={(event) => {
                        setProvider(event.target.value as ProviderName);
                        setPaid(false);
                      }}
                      className={`${inputClass} w-auto text-xs`}
                    >
                      {(providers.length
                        ? providers
                        : [{ id: "gemini", name: "Gemini", ready: false }]
                      ).map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                          {!item.ready ? " · belum aktif" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    AI memahami instruksi yang disaring. Nama/NPM, angka nilai, dan catatan tidak
                    diteruskan. Catatan kualitatif tidak dinilai oleh model pada mode ini; gunakan
                    review rubrik atau form penilaian.
                  </p>
                  {selectedProvider && !selectedProvider.ready && (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3">
                      <p className="text-xs text-amber-800">
                        {selectedProvider.name} belum aktif. Tidak ada jawaban AI simulasi.
                      </p>
                      <Button
                        variant="ghost"
                        className="shrink-0 text-xs"
                        onClick={() => setTab("Konfigurasi")}
                      >
                        Konfigurasi
                        <ArrowRight size={12} />
                      </Button>
                    </div>
                  )}
                  {provider !== "gemini" && (
                    <label className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={paid}
                        onChange={(event) => setPaid(event.target.checked)}
                        className="mt-0.5"
                      />
                      Saya menyetujui penggunaan kredit API {selectedProvider?.name ?? provider}{" "}
                      untuk command ini.
                    </label>
                  )}
                  <form
                    className="mt-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submit();
                    }}
                  >
                    <label htmlFor="ai-command" className="sr-only">
                      Perintah AI
                    </label>
                    <textarea
                      id="ai-command"
                      ref={textInput}
                      maxLength={4000}
                      rows={3}
                      value={command}
                      onChange={(event) => setCommand(event.target.value)}
                      placeholder={
                        revisionMode
                          ? `${revisionMode}, misalnya: revisi B4 menjadi 5`
                          : "Tanyakan nilai, kelengkapan, atau buat rencana koreksi B1 menjadi 5…"
                      }
                      className={`${inputClass} resize-y text-sm leading-relaxed`}
                    />
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {revisionMode
                          ? `${revisionMode} pada rencana saat ini`
                          : `${command.length}/4.000 karakter`}
                      </span>
                      <Button
                        disabled={
                          busy ||
                          !command.trim() ||
                          !selectedProvider?.ready ||
                          (provider !== "gemini" && !paid)
                        }
                        type="submit"
                      >
                        {busy ? <Spinner /> : <Send size={14} />}
                        {busy ? "Memproses…" : "Kirim command"}
                      </Button>
                    </div>
                  </form>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      "Siapa yang belum dinilai?",
                      context.rombel
                        ? `Statistik Rombel ${context.rombel}`
                        : "Statistik seluruh rombel",
                      "Tampilkan rubrik B5",
                    ].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="ghost"
                        className="bg-muted px-3 py-1.5 text-xs"
                        disabled={busy}
                        onClick={() => setCommand(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                  {busy && (
                    <p
                      role="status"
                      className="mt-5 flex items-center gap-2 rounded-lg bg-muted p-4 text-xs text-muted-foreground"
                    >
                      <Spinner />
                      Menjalankan interpreter dan controlled tool. Perubahan nilai tidak dieksekusi
                      otomatis.
                    </p>
                  )}
                  {result && !busy && (
                    <div className="mt-6 border-t border-border pt-5">
                      <div className="mb-4 flex flex-wrap gap-2">
                        {result.activities.map((activity) => (
                          <span
                            key={activity}
                            className="flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs text-teal-800"
                          >
                            <Check size={11} />
                            {activity}
                          </span>
                        ))}
                      </div>
                      <Result result={result} />
                      {result.kind === "clarification" && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-semibold">
                            Cari/pilih target di database lokal
                          </p>
                          <div className="flex gap-2">
                            <input
                              aria-label="Cari target AI lokal"
                              value={localSearch}
                              onChange={(event) => setLocalSearch(event.target.value)}
                              className={`${inputClass} text-xs`}
                              placeholder="NPM atau nama…"
                            />
                            <Button variant="secondary" onClick={searchLocal}>
                              <ListFilter size={14} />
                              Cari
                            </Button>
                          </div>
                          <div className="mt-3 space-y-2">
                            {candidates.map((student) => (
                              <Button
                                key={student.id}
                                variant="secondary"
                                className="w-full justify-between text-xs"
                                onClick={() => void submit([student.id])}
                              >
                                <span>
                                  {student.name} · {student.npm}
                                </span>
                                <span>
                                  Rombel {student.rombel_id}
                                  <ChevronRight size={12} className="ml-1 inline" />
                                </span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.plan && (
                        <PlanEditor
                          key={`${result.plan.id}-${result.plan.revision}`}
                          plan={result.plan}
                          isDirty={isDirty}
                          onChange={updatePlan}
                          onConfirmed={confirm}
                          onRevise={(mode) => {
                            setRevisionMode(mode);
                            setCommand("");
                            textInput.current?.focus();
                          }}
                        />
                      )}
                      {result.adminPlan && (
                        <AIAdminReview
                          key={`${result.adminPlan.id}-${result.adminPlan.revision}`}
                          plan={result.adminPlan}
                          dirty={isDirty}
                          onChange={(plan) =>
                            setResult((current) =>
                              current ? { ...current, adminPlan: plan } : current,
                            )
                          }
                          onConfirm={confirm}
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </Workspace.Provider>
  );
}
