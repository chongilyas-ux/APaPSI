// @ts-nocheck -- ported verbatim from the original app, which was type-checked under its own (less strict) settings.
import { useEffect, useMemo, useState } from "react";
import { Link, useBlocker, useLoaderData, useRevalidator } from "@/lib/rr";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Info,
  Minus,
  Plus,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { api, json } from "./api";
import {
  Button,
  Card,
  Field,
  inputClass,
  Modal,
  PageHeading,
  Progress,
  Spinner,
  Status,
} from "./components";
import {
  calculate,
  emptyData,
  formatScore,
  slotKey,
  validateAssessment,
  type AssessmentData,
  type Aspect,
  type Configuration,
  type Student,
} from "@/lib/domain";
import { Logs, type LogItem } from "./Shell";

export type AssessmentPageData = {
  student: Student;
  config: Configuration;
  version: string;
  students: Student[];
};
const groupTabs = ["Administrasi", "Substansi", "Tata Tulis", "Sikap", "Ringkasan"];
function CriterionInput({
  aspect,
  data,
  onChange,
}: {
  aspect: Aspect;
  data: AssessmentData;
  onChange: (data: AssessmentData) => void;
}) {
  const score = data.scores[aspect.code] ?? { level: "", score: null, note: "" };
  const criterion = aspect.criteria.find(
    (item) => item.active !== false && item.level === score.level,
  );
  function update(value: Partial<typeof score>) {
    onChange({
      ...data,
      scores: { ...data.scores, [aspect.code]: { ...score, ...value } },
    });
  }
  return (
    <Card className="p-5 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-primary">
            {aspect.code}
          </span>
          <div>
            <h3 className="text-sm font-semibold">{aspect.name}</h3>
            <p className="mt-1 text-[10px] text-slate-400">
              Pilih kategori, lalu tentukan skor dalam rentangnya.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] text-slate-500">
          Maks. {aspect.max}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {aspect.criteria
          .filter((item) => item.active !== false)
          .map((item) => (
            <label
              key={item.level}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-3 text-[11px] transition ${
                score.level === item.level
                  ? "border-teal-600 bg-teal-50/50 text-teal-800"
                  : "border-border text-slate-500 hover:border-slate-300"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`category-${aspect.code}`}
                  checked={score.level === item.level}
                  onChange={() =>
                    update({
                      level: item.level,
                      score: item.min === item.max ? item.min : null,
                    })
                  }
                  className="accent-teal-700"
                />
                {item.level}
              </span>
              <span className="font-semibold tabular-nums">
                {item.min === item.max ? item.max : `${item.min}–${item.max}`}
              </span>
            </label>
          ))}
      </div>
      {criterion && (
        <div className="mt-4 rounded-lg bg-[#f5f8f7] px-4 py-3">
          <div className="flex gap-2">
            <BookOpen size={14} className="mt-0.5 shrink-0 text-teal-700" />
            <p className="text-[11px] leading-[1.8] text-slate-600">{criterion.description}</p>
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-[115px_1fr]">
        <Field label="Skor">
          <select
            aria-label={`Skor ${aspect.code}`}
            disabled={!criterion}
            value={score.score ?? ""}
            onChange={(event) =>
              update({
                score: event.target.value === "" ? null : Number(event.target.value),
              })
            }
            className={`${inputClass} disabled:bg-slate-50`}
          >
            <option value="">Pilih skor</option>
            {criterion &&
              Array.from(
                { length: criterion.max - criterion.min + 1 },
                (_, index) => criterion.min + index,
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Catatan asisten">
          <input
            maxLength={5000}
            value={score.note}
            onChange={(event) => update({ note: event.target.value })}
            placeholder="Tambahkan catatan jika diperlukan..."
            className={inputClass}
          />
        </Field>
      </div>
    </Card>
  );
}
export default function Assessment() {
  const loaded = useLoaderData() as AssessmentPageData;
  const { student, config, version, students } = loaded;
  const revalidator = useRevalidator();
  const [data, setData] = useState<AssessmentData>(student.assessment?.data ?? emptyData());
  const [revision, setRevision] = useState(student.assessment?.revision ?? 0);
  const [saved, setSaved] = useState(JSON.stringify(data));
  const [state, setState] = useState(student.assessment?.state ?? "draft");
  const [tab, setTab] = useState("Administrasi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [logs, setLogs] = useState<LogItem[] | null>(null);
  const result = useMemo(
    () => calculate(data, config, state === "verified" && JSON.stringify(data) === saved),
    [data, config, state, saved],
  );
  const dirty = JSON.stringify(data) !== saved;
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("apapsi-assessment-state", { detail: { npm: student.npm, dirty } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("apapsi-assessment-state", { detail: { npm: student.npm, dirty: false } }),
      );
    };
  }, [student.npm, dirty]);
  useEffect(() => {
    const receive = (event: Event) => {
      const updated = (
        event as CustomEvent<{
          student_id: string;
          data: AssessmentData;
          revision: number;
          state: "draft" | "verified";
        }>
      ).detail;
      if (updated.student_id !== student.id || dirty) return;
      setData(updated.data);
      setSaved(JSON.stringify(updated.data));
      setRevision(updated.revision);
      setState(updated.state);
      setReason("");
    };
    window.addEventListener("apapsi-ai-saved", receive);
    return () => window.removeEventListener("apapsi-ai-saved", receive);
  }, [student.id, dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    const next = student.assessment?.data ?? emptyData();
    setData(next);
    setSaved(JSON.stringify(next));
    setRevision(student.assessment?.revision ?? 0);
    setState(student.assessment?.state ?? "draft");
    setReason("");
    setError("");
  }, [student.id]);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const meetings = config.meetings.filter((meeting) => meeting.active);
  const aspects = config.aspects.filter((aspect) => aspect.active);
  const averageAspect = aspects.find(aspect => aspect.kind === "average");
  const deductionAspect = aspects.find(aspect => aspect.kind === "deduction");
  const classmates = students.filter((item) => item.rombel_id === student.rombel_id);
  const position = classmates.findIndex((item) => item.id === student.id);
  async function save(verify: boolean) {
    setError("");
    setBusy(true);
    try {
      validateAssessment(data, config);
      const updated = await api<Student["assessment"] & { result: unknown }>(
        `/students/${student.id}/assessment`,
        { method: "PUT", body: json({ data, revision, verify, reason }) },
      );
      if (updated) {
        setData(updated.data);
        setSaved(JSON.stringify(updated.data));
        setRevision(updated.revision);
        setState(updated.state);
      }
      setReason("");
      toast.success(verify ? "Penilaian disimpan dan disahkan" : "Draft penilaian tersimpan");
      revalidator.revalidate();
    } catch (error) {
      setError((error as Error).message);
      toast.error("Penilaian belum tersimpan");
    } finally {
      setBusy(false);
    }
  }
  function submission(meeting: string, slot: string, field: "time" | "content", value: string) {
    const key = slotKey(meeting, slot);
    const current = data.submissions[key] ?? { time: "", content: "" };
    const next = { ...current, [field]: value };
    if (value === "missing") {
      next.time = "missing";
      next.content = "missing";
    } else if (current.time === "missing" || current.content === "missing") {
      if (field === "time") next.content = "";
      else next.time = "";
    }
    setData({ ...data, submissions: { ...data.submissions, [key]: next } });
  }
  async function history() {
    try {
      setLogs(await api<LogItem[]>(`/logs?student=${student.id}`));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  const counts = {
    time: Object.values(data.submissions).filter((item) => item.time).length,
    content: Object.values(data.submissions).filter((item) => item.content).length,
    d1: meetings.filter(
      (meeting) => data.meetings[meeting.id]?.score != null || data.meetings[meeting.id]?.excused,
    ).length,
  };
  return (
    <>
      <Link
        to={`/penilaian?rombel=${student.rombel_id}`}
        className="mb-5 inline-flex items-center gap-2 text-[11px] font-medium text-slate-500 hover:text-teal-700"
      >
        <ArrowLeft size={13} />
        Kembali ke penilaian
      </Link>
      <PageHeading
        title="Penilaian mahasiswa"
        description="Nilai dengan rubrik yang jelas. Perhitungan berjalan otomatis."
        action={
          <Button variant="secondary" onClick={history}>
            <Clock3 size={14} />
            Riwayat perubahan
          </Button>
        }
      />
      <Card className="mb-6 flex flex-wrap items-center gap-5 p-5">
        <span className="flex size-12 items-center justify-center rounded-xl bg-[#edf3f0] font-display text-xl text-teal-800">
          {student.name
            .split(" ")
            .slice(0, 2)
            .map((word) => word[0])
            .join("")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">{student.name}</h2>
            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-500">
              Rombel {student.rombel_id}
            </span>
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-slate-400">{student.npm}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {student.study_case || "Studi kasus belum diisi"}
          </p>
        </div>
        <Status result={result} />
      </Card>
      {data.legacy && (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-blue-800">
            <Info size={15} />
            Draft hasil migrasi Excel
          </p>
          {data.warnings.map((warning, index) => (
            <p key={index} className="mt-2 text-[11px] leading-relaxed text-blue-700">
              {warning}
            </p>
          ))}
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] font-medium text-blue-900">
            <input
              type="checkbox"
              checked={data.legacyReviewed}
              onChange={(event) => setData({ ...data, legacyReviewed: event.target.checked })}
              className="mt-0.5 accent-blue-700"
            />
            Saya sudah memeriksa input lama, termasuk nilai yang diberi label contoh.
          </label>
        </div>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div className="min-w-0">
          <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-white p-1">
            {groupTabs.map((group) => (
              <button
                key={group}
                onClick={() => setTab(group)}
                className={`flex-1 whitespace-nowrap rounded-md px-3 py-2.5 text-[11px] font-medium transition ${
                  tab === group ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {group}
              </button>
            ))}
          </div>
          <div className="space-y-5">
            {tab === "Administrasi" && (
              <Card className="overflow-hidden">
                <div className="border-b border-border p-5">
                  <h3 className="text-sm font-semibold">Administrasi pengumpulan</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    {meetings.length} pertemuan × {config.slots.length} slot. Setiap status
                    bermasalah mengurangi {config.penalty} poin. Tidak mengumpulkan dihitung pada A1
                    dan A2.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {aspects
                      .filter((item) => item.group === "Administrasi")
                      .map((aspect) => (
                        <span
                          key={aspect.code}
                          className="rounded-lg border border-border px-3 py-2 text-[11px]"
                        >
                          <strong>{aspect.code}</strong>
                          <span className="ml-2 text-teal-700">
                            {formatScore(result.scores[aspect.code])}
                          </span>
                          <span className="text-slate-400"> / {aspect.max}</span>
                        </span>
                      ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[530px] text-left">
                    <thead>
                      <tr className="border-b border-border bg-slate-50 text-[10px] text-slate-500">
                        <th className="px-5 py-3 font-medium">Pertemuan / slot</th>
                        <th className="px-3 py-3 font-medium">
                          {aspects.find(aspect => aspect.kind === "submission-time")?.code ?? "Waktu"} · Waktu ({counts.time}/{meetings.length * config.slots.length})
                        </th>
                        <th className="px-3 py-3 font-medium">
                          {aspects.find(aspect => aspect.kind === "submission-content")?.code ?? "Isi"} · Isi ({counts.content}/{meetings.length * config.slots.length})
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {meetings.flatMap((meeting) =>
                        config.slots.map((slot, index) => {
                          const entry = data.submissions[slotKey(meeting.id, slot)] ?? {
                            time: "",
                            content: "",
                          };
                          return (
                            <tr key={`${meeting.id}-${slot}`}>
                              <td className="px-5 py-3">
                                <p className="text-[11px] font-medium">{meeting.name}</p>
                                <p className="mt-1 text-[10px] capitalize text-slate-400">
                                  {slot === "lab" ? "Di lab" : slot === "rumah" ? "Di rumah" : slot}
                                </p>
                              </td>
                              <td className="px-3 py-3">
                                <select
                                  aria-label={`${meeting.name} ${slot} waktu`}
                                  value={entry.time}
                                  onChange={(event) =>
                                    submission(meeting.id, slot, "time", event.target.value)
                                  }
                                  className={`${inputClass} min-w-36 text-[11px]`}
                                >
                                  <option value="">Belum diisi</option>
                                  <option value="on-time">Tepat waktu</option>
                                  <option value="late">Terlambat</option>
                                  <option value="missing">Tidak mengumpulkan</option>
                                </select>
                              </td>
                              <td className="px-3 py-3">
                                <select
                                  aria-label={`${meeting.name} ${slot} isi`}
                                  value={entry.content}
                                  onChange={(event) =>
                                    submission(meeting.id, slot, "content", event.target.value)
                                  }
                                  className={`${inputClass} min-w-36 text-[11px]`}
                                >
                                  <option value="">Belum diisi</option>
                                  <option value="suitable">Sesuai</option>
                                  <option value="lacking">Masih kurang</option>
                                  <option value="unreadable">Tidak bisa dibuka</option>
                                  <option value="missing">Tidak mengumpulkan</option>
                                </select>
                              </td>
                            </tr>
                          );
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            {(tab === "Substansi" || tab === "Tata Tulis") &&
              aspects
                .filter((aspect) => aspect.group === tab)
                .map((aspect) => (
                  <CriterionInput
                    key={aspect.code}
                    aspect={aspect}
                    data={data}
                    onChange={setData}
                  />
                ))}
            {tab === "Sikap" && (
              <>
                {averageAspect && <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{averageAspect.code} · {averageAspect.name}</h3>
                    <span className="text-xs font-semibold text-teal-700">
                      {formatScore(
                        result.scores[
                          aspects.find((item) => item.kind === "average")?.code ?? "D1"
                        ],
                      )}{" "}
                      / {aspects.find((item) => item.kind === "average")?.max ?? 10}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Skor 0–10 tiap pertemuan. Izin sah menggunakan rata-rata pertemuan lain yang
                    diikuti; tidak dikenai P8.
                  </p>
                  <details className="mt-4 rounded-lg bg-slate-50 p-3 text-[11px]">
                    <summary className="cursor-pointer font-medium text-teal-700">
                      Lihat rubrik D1
                    </summary>
                    <div className="mt-3 space-y-3">
                      {aspects
                        .find((item) => item.kind === "average")
                        ?.criteria.filter((criterion) => criterion.active !== false)
                        .map((criterion) => (
                          <div key={criterion.level}>
                            <p className="font-semibold">
                              {criterion.level} · {criterion.min}–{criterion.max}
                            </p>
                            <p className="mt-1 leading-relaxed text-slate-500">
                              {criterion.description}
                            </p>
                          </div>
                        ))}
                    </div>
                  </details>
                  <div className="mt-5 divide-y divide-border">
                    {meetings.map((meeting) => {
                      const entry = data.meetings[meeting.id] ?? {
                        score: null,
                        excused: false,
                      };
                      return (
                        <div key={meeting.id} className="flex flex-wrap items-center gap-4 py-3">
                          <span className="flex-1 text-xs font-medium">{meeting.name}</span>
                          <select
                            aria-label={`D1 ${meeting.name}`}
                            disabled={entry.excused}
                            value={entry.score ?? ""}
                            onChange={(event) =>
                              setData({
                                ...data,
                                meetings: {
                                  ...data.meetings,
                                  [meeting.id]: {
                                    ...entry,
                                    score:
                                      event.target.value === "" ? null : Number(event.target.value),
                                  },
                                },
                              })
                            }
                            className={`${inputClass} w-32! text-xs disabled:bg-slate-50`}
                          >
                            <option value="">{entry.excused ? "Rata-rata" : "Pilih skor"}</option>
                            {Array.from({ length: 11 }, (_, score) => (
                              <option key={score} value={score}>
                                {score}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-[11px] text-slate-500">
                            <input
                              type="checkbox"
                              checked={entry.excused}
                              onChange={(event) =>
                                setData({
                                  ...data,
                                  meetings: {
                                    ...data.meetings,
                                    [meeting.id]: {
                                      score: null,
                                      excused: event.target.checked,
                                    },
                                  },
                                })
                              }
                              className="accent-teal-700"
                            />
                            Izin sah
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[10px] text-slate-400">
                    Terisi {counts.d1}/{meetings.length} pertemuan. Nilai dihitung setelah tersedia
                    seluruh skor wajib.
                  </p>
                </Card>}
                {deductionAspect && <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{deductionAspect.code} · {deductionAspect.name}</h3>
                    <span className="text-xs font-semibold text-teal-700">
                      {formatScore(
                        result.scores[
                          aspects.find((item) => item.kind === "deduction")?.code ?? "D2"
                        ],
                      )}{" "}
                      / {aspects.find((item) => item.kind === "deduction")?.max ?? 10}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Catat tiap kejadian. Pengulangan setelah teguran dapat dicatat sebagai
                    pelanggaran baru. Penggunaan perangkat untuk praktikum dengan izin tidak
                    dihitung.
                  </p>
                  <div className="mt-5 divide-y divide-border">
                    {config.violations
                      .filter((item) => item.active)
                      .map((violation) => (
                        <div key={violation.code} className="flex items-center gap-3 py-4">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                            {violation.code}
                          </span>
                          <div className="flex-1">
                            <p className="text-[11px] leading-relaxed text-slate-600">
                              {violation.name}
                            </p>
                            <p className="mt-1 text-[9px] text-slate-400">
                              −{violation.penalty} poin / kejadian
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center rounded-lg border border-border">
                            <button
                              aria-label={`Kurangi ${violation.code}`}
                              disabled={!(data.violations[violation.code] ?? 0)}
                              onClick={() =>
                                setData({
                                  ...data,
                                  violations: {
                                    ...data.violations,
                                    [violation.code]: Math.max(
                                      0,
                                      (data.violations[violation.code] ?? 0) - 1,
                                    ),
                                  },
                                })
                              }
                              className="p-2 text-slate-500 disabled:opacity-30"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="min-w-6 text-center text-xs tabular-nums">
                              {data.violations[violation.code] ?? 0}
                            </span>
                            <button
                              aria-label={`Tambah ${violation.code}`}
                              disabled={(data.violations[violation.code] ?? 0) >= 10000}
                              onClick={() =>
                                setData({
                                  ...data,
                                  violations: {
                                    ...data.violations,
                                    [violation.code]: (data.violations[violation.code] ?? 0) + 1,
                                  },
                                })
                              }
                              className="p-2 text-slate-500"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="mt-3 flex justify-between rounded-lg bg-slate-50 p-3 text-xs">
                    <span className="text-slate-500">Total pengurangan</span>
                    <strong>
                      {config.violations
                        .filter((item) => item.active)
                        .reduce(
                          (total, item) => total + (data.violations[item.code] ?? 0) * item.penalty,
                          0,
                        )}{" "}
                      poin
                    </strong>
                  </div>
                  <label className="mt-4 flex items-start gap-2 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={data.d2Reviewed}
                      onChange={(event) => setData({ ...data, d2Reviewed: event.target.checked })}
                      className="mt-0.5 accent-teal-700"
                    />
                    Saya telah memeriksa catatan pelanggaran, termasuk jika tidak ada pelanggaran.
                  </label>
                </Card>}
              </>
            )}
            {tab === "Ringkasan" && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold">Ringkasan seluruh komponen</h3>
                <p className="mt-2 text-[11px] text-slate-500">
                  Nilai akhir adalah jumlah poin komponen, tanpa pembobotan ulang.
                </p>
                <div className="mt-5 divide-y divide-border">
                  {aspects.map((aspect) => (
                    <div key={aspect.code} className="flex items-center gap-3 py-3">
                      <span className="w-7 text-[11px] font-semibold text-slate-500">
                        {aspect.code}
                      </span>
                      <span className="flex-1 text-xs">{aspect.name}</span>
                      <span className="text-xs font-semibold tabular-nums text-teal-700">
                        {formatScore(result.scores[aspect.code])}
                        <span className="ml-1 font-normal text-slate-400">/ {aspect.max}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <Field label="Alasan koreksi / catatan penyimpanan">
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Opsional, dicatat pada riwayat perubahan..."
                    className={inputClass}
                  />
                </Field>
              </Card>
            )}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setTab(groupTabs[Math.max(0, groupTabs.indexOf(tab) - 1)])}
              disabled={tab === groupTabs[0]}
            >
              <ArrowLeft size={13} />
              Bagian sebelumnya
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                setTab(groupTabs[Math.min(groupTabs.length - 1, groupTabs.indexOf(tab) + 1)])
              }
              disabled={tab === "Ringkasan"}
            >
              Bagian berikutnya
              <ArrowRight size={13} />
            </Button>
          </div>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-[100px]">
          <Card className="overflow-hidden">
            <div className="bg-[#203b52] px-5 py-5 text-white">
              <p className="text-[9px] font-semibold uppercase tracking-[1.6px] text-[#abc6b9]">
                {result.status === "complete" ? "Nilai akhir resmi" : "Nilai sementara"}
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-[46px] leading-none">
                  {formatScore(result.total)}
                </span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-300">
                {result.status === "complete"
                  ? "Seluruh komponen lengkap dan disahkan."
                  : "Belum sah sampai lengkap dan disimpan."}
              </p>
            </div>
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-semibold">Progres penilaian</span>
                <span className="text-[10px] text-slate-400">
                  {result.completed}/{result.required}
                </span>
              </div>
              <Progress value={result.completed} total={result.required} />
              <div className="mt-5 space-y-2.5">
                {aspects.map((aspect) => (
                  <button
                    key={aspect.code}
                    onClick={() => setTab(aspect.group)}
                    className="flex w-full items-center gap-2 text-[11px]"
                  >
                    <span
                      className={`flex size-4 items-center justify-center rounded-full ${
                        result.scores[aspect.code] != null
                          ? "bg-teal-50 text-teal-700"
                          : "bg-slate-100 text-slate-300"
                      }`}
                    >
                      {result.scores[aspect.code] != null ? (
                        <Check size={10} />
                      ) : (
                        <span className="size-1 rounded-full bg-slate-300" />
                      )}
                    </span>
                    <span className="text-slate-500">{aspect.code}</span>
                    <span className="ml-auto font-medium tabular-nums">
                      {formatScore(result.scores[aspect.code])}
                    </span>
                    <span className="text-slate-300">/ {aspect.max}</span>
                  </button>
                ))}
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p
                  className={`mb-3 flex items-center gap-1.5 text-[10px] ${
                    dirty ? "text-amber-600" : "text-slate-400"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${dirty ? "bg-amber-500" : "bg-slate-300"}`}
                  />
                  {dirty ? "Ada perubahan belum tersimpan" : `Tersimpan · revisi ${revision}`}
                </p>
                <Button className="w-full" onClick={() => save(result.complete)} disabled={busy}>
                  {busy ? <Spinner /> : <Save size={14} />}Simpan penilaian
                </Button>
                {result.complete && (
                  <Button
                    variant="ghost"
                    className="mt-1 w-full text-[10px]"
                    disabled={busy}
                    onClick={() => save(false)}
                  >
                    Simpan sebagai draft saja
                  </Button>
                )}
                {error && (
                  <p role="alert" className="mt-3 text-[11px] leading-relaxed text-red-600">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </Card>
          <div className="flex items-start gap-2 px-1 text-[10px] leading-relaxed text-slate-400">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <span>
              Versi penilaian: {config.label}. Perubahan konfigurasi baru tidak mengubah aturan ini.
            </span>
          </div>
          <div className="flex gap-2">
            {position > 0 && (
              <Link
                to={`/penilaian/rombel-${student.rombel_id}/${classmates[position - 1].npm}`}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-white p-2.5 text-[10px] text-slate-500"
              >
                <ArrowLeft size={12} />
                Sebelumnya
              </Link>
            )}
            {position < classmates.length - 1 && (
              <Link
                to={`/penilaian/rombel-${student.rombel_id}/${classmates[position + 1].npm}`}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-white p-2.5 text-[10px] text-slate-500"
              >
                Berikutnya
                <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </aside>
      </div>
      {logs && (
        <Modal title={`Riwayat · ${student.name}`} onClose={() => setLogs(null)} wide>
          <Logs items={logs} />
        </Modal>
      )}
      {blocker.state === "blocked" && (
        <Modal title="Perubahan belum tersimpan" onClose={() => blocker.reset?.()}>
          <p className="text-sm leading-relaxed text-slate-500">
            Jika meninggalkan halaman, perubahan yang belum disimpan akan hilang. Tetap di sini
            untuk menyimpan penilaian terlebih dahulu.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Tetap di halaman
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Tinggalkan perubahan
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
