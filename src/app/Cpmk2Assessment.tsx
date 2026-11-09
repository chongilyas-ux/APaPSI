// @ts-nocheck -- mengikuti konvensi halaman lain di proyek ini.
import { useEffect, useMemo, useState } from "react";
import { Link, useBlocker, useLoaderData, useRevalidator } from "@/lib/rr";
import { ArrowLeft, ArrowRight, Check, Clock3, Info, Minus, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, json } from "./api";
import { Button, Card, Field, Modal, PageHeading, Progress, Spinner, inputClass } from "./components";
import {
  CPMK2_ASPECTS,
  CPMK2_VIOLATIONS,
  CPMK2_WEEKS,
  CPMK2_LABEL,
  calculateCpmk2,
  emptyCpmk2Data,
  formatScore2,
  validateCpmk2,
  deductionByCode,
  type Cpmk2Data,
  type ViolationCode,
} from "@/lib/cpmk2/domain";
import type { Cpmk2Student } from "@/lib/cpmk2/server";
import { Logs, type LogItem } from "./Shell";

const WEEK_NAMES: Record<string, string> = {
  "6": "Minggu 6 · Perancangan tabel dari ERD",
  "7": "Minggu 7 · Normalisasi & relasi antartabel",
  "9": "Minggu 9 · Pengisian data",
};

const TIME_OPTIONS = [
  ["", "Belum diisi"],
  ["on-time", "Tepat waktu"],
  ["late", "Terlambat"],
  ["missing", "Tidak mengumpulkan"],
] as const;

const CONTENT_OPTIONS = [
  ["", "Belum diisi"],
  ["suitable", "Sesuai"],
  ["lacking", "Masih kurang"],
  ["unreadable", "Tidak bisa dibuka"],
  ["missing", "Tidak mengumpulkan"],
] as const;

const GROUP_TABS = [
  ["Administrasi", "a"],
  ["Substansi", "sub"],
  ["Tata Tulis", "c"],
  ["Sikap", "d"],
  ["Ringkasan", "ring"],
] as const;

export default function Cpmk2Assessment() {
  const loaded = useLoaderData() as { student: Cpmk2Student; students: Cpmk2Student[] };
  const { student, students } = loaded;
  const revalidator = useRevalidator();
  const [data, setData] = useState<Cpmk2Data>(student.assessment?.data ?? emptyCpmk2Data());
  const [revision, setRevision] = useState(student.assessment?.revision ?? 0);
  const [saved, setSaved] = useState(JSON.stringify(data));
  const [state, setState] = useState(student.assessment?.state ?? "draft");
  const [tab, setTab] = useState("Administrasi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [logs, setLogs] = useState<LogItem[] | null>(null);

  const dirty = JSON.stringify(data) !== saved;
  const result = useMemo(() => calculateCpmk2(data), [data]);
  useEffect(() => {
    const next = student.assessment?.data ?? emptyCpmk2Data();
    setData(next);
    setSaved(JSON.stringify(next));
    setRevision(student.assessment?.revision ?? 0);
    setState(student.assessment?.state ?? "draft");
    setError("");
    setReason("");
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

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  async function save(verify: boolean) {
    setError("");
    setBusy(true);
    try {
      validateCpmk2(data);
      const updated = await api(`/cpmk2/students/${student.id}/assessment`, {
        method: "PUT",
        body: json({ data, revision, verify, reason }),
      });
      if (updated?.data) {
        setData(updated.data);
        setSaved(JSON.stringify(updated.data));
        setRevision(updated.revision);
        setState(updated.state);
      }
      setReason("");
      toast.success(verify ? "Penilaian disimpan dan disahkan" : "Draft penilaian tersimpan");
      revalidator.revalidate();
    } catch (e) {
      setError((e as Error).message);
      toast.error("Penilaian belum tersimpan");
    } finally {
      setBusy(false);
    }
  }

  const classmates = students.filter((item) => item.rombel_id === student.rombel_id);
  const position = classmates.findIndex((item) => item.id === student.id);
  const deductions = deductionByCode(data);
  const totalDeduction = Object.values(deductions).reduce((a, b) => a + b, 0);
  const bAspects = CPMK2_ASPECTS.filter((a) => a.code !== "D1");

  return (
    <>
      <Link
        to={`/cpmk2?rombel=${student.rombel_id}`}
        className="mb-5 inline-flex items-center gap-2 text-[11px] font-medium text-slate-500 hover:text-teal-700"
      >
        <ArrowLeft size={13} />
        Kembali ke penilaian CPMK 2
      </Link>
      <PageHeading
        title="Penilaian CPMK 2"
        description="Tahap II · Perancangan dan implementasi basis data. Perhitungan otomatis dari rubrik."
        action={
          <Button variant="secondary" onClick={() => api(`/logs?student=${student.id}`).then(setLogs).catch((e) => toast.error(e.message))}>
            <Clock3 size={14} />
            Riwayat perubahan
          </Button>
        }
      />
      <Card className="mb-6 flex flex-wrap items-center gap-5 p-5">
        <span className="flex size-12 items-center justify-center rounded-xl bg-[#edf3f0] font-display text-xl text-teal-800">
          {student.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">{student.name}</h2>
            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-500">Rombel {student.rombel_id}</span>
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-slate-400">{student.npm}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-[1.6px] text-slate-400">Nilai sementara</p>
          <p className="text-2xl font-display tabular-nums text-teal-800">
            {formatScore2(result.total)}
            <span className="text-xs text-slate-400"> / 100</span>
          </p>
          <div className="mt-1 flex justify-end">
            <Progress value={result.completed} total={result.required} />
          </div>
        </div>
      </Card>

      {result.manualReview && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-800">
            <Info size={15} /> Perlu tinjauan manual
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
            Tidak ada pertemuan yang diikuti, sehingga D1 (kesungguhan) tidak dapat dihitung otomatis.
            Nilainya tidak dikarang oleh sistem — tentukan bersama dosen pengampu, lalu catat hasil
            keputusannya di kolom catatan penyimpanan.
          </p>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div className="min-w-0">
          <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-white p-1">
            {GROUP_TABS.map(([group]) => (
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
                    Tiga minggu pengumpulan (6, 7, 9). Setiap status bermasalah mengurangi 2 poin.
                    "Tidak mengumpulkan" dihitung pada A1 dan A2 sekaligus.
                  </p>
                  <div className="mt-4 flex gap-3">
                    {(["A1", "A2"] as const).map((code) => (
                      <span key={code} className="rounded-lg border border-border px-3 py-2 text-[11px]">
                        <strong>{code}</strong>
                        <span className="ml-2 text-teal-700">{formatScore2(result.scores[code])}</span>
                        <span className="text-slate-400"> / 10</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[530px] text-left">
                    <thead>
                      <tr className="border-b border-border bg-slate-50 text-[10px] text-slate-500">
                        <th className="px-5 py-3 font-medium">Minggu</th>
                        <th className="px-3 py-3 font-medium">A1 · Waktu</th>
                        <th className="px-3 py-3 font-medium">A2 · Isi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {CPMK2_WEEKS.map((week) => {
                        const entry = data.a[week] ?? { time: "", content: "" };
                        return (
                          <tr key={week}>
                            <td className="px-5 py-3">
                              <p className="text-[11px] font-medium">Minggu {week}</p>
                              <p className="mt-0.5 text-[10px] text-slate-400">{WEEK_NAMES[week]?.split(" · ")[1]}</p>
                            </td>
                            <td className="px-3 py-3">
                              <select
                                aria-label={`Minggu ${week} waktu`}
                                value={entry.time}
                                onChange={(e) =>
                                  setData({
                                    ...data,
                                    a: {
                                      ...data.a,
                                      [week]: {
                                        ...(e.target.value === "missing" ? { time: "missing", content: "missing" } : { ...entry, time: e.target.value, ...(entry.content === "missing" ? { content: "" } : {}) }),
                                      },
                                    },
                                  })
                                }
                                className={`${inputClass} min-w-36 text-[11px]`}
                              >
                                {TIME_OPTIONS.map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-3">
                              <select
                                aria-label={`Minggu ${week} isi`}
                                value={entry.content}
                                onChange={(e) =>
                                  setData({
                                    ...data,
                                    a: {
                                      ...data.a,
                                      [week]: {
                                        ...(e.target.value === "missing" ? { time: "missing", content: "missing" } : { ...entry, content: e.target.value, ...(entry.time === "missing" ? { time: "" } : {}) }),
                                      },
                                    },
                                  })
                                }
                                className={`${inputClass} min-w-36 text-[11px]`}
                              >
                                {CONTENT_OPTIONS.map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            {(tab === "Substansi" || tab === "Tata Tulis") &&
              bAspects
                .filter((aspect) => (tab === "Substansi" ? aspect.group === "Substansi" : aspect.code === "C"))
                .map((aspect) => {
                  const score = data.b[aspect.code] ?? { level: "", score: null, note: "" };
                  const criterion = aspect.criteria.find((item) => item.level === score.level);
                  function update(value: Partial<typeof score>) {
                    setData({ ...data, b: { ...data.b, [aspect.code]: { ...score, ...value } } });
                  }
                  return (
                    <Card key={aspect.code} className="p-5 md:p-6">
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-primary">
                            {aspect.code}
                          </span>
                          <h3 className="text-sm font-semibold">{aspect.name}</h3>
                        </div>
                        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] text-slate-500">
                          Maks. {aspect.max}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {aspect.criteria.map((item) => (
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
                                name={`cpmk2-${aspect.code}`}
                                checked={score.level === item.level}
                                onChange={() => update({ level: item.level, score: item.min })}
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
                          <p className="text-[11px] leading-[1.8] text-slate-600">{criterion.description}</p>
                        </div>
                      )}
                      <div className="mt-4 grid gap-4 sm:grid-cols-[115px_1fr]">
                        <Field label="Skor">
                          <select
                            aria-label={`Skor ${aspect.code}`}
                            disabled={!criterion}
                            value={score.score ?? ""}
                            onChange={(e) => update({ score: e.target.value === "" ? null : Number(e.target.value) })}
                            className={`${inputClass} disabled:bg-slate-50`}
                          >
                            <option value="">Pilih skor</option>
                            {criterion &&
                              Array.from({ length: criterion.max - criterion.min + 1 }, (_, i) => criterion.min + i).map((v) => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Catatan asisten">
                          <input
                            maxLength={5000}
                            value={score.note}
                            onChange={(e) => update({ note: e.target.value })}
                            placeholder="Tambahkan catatan jika diperlukan..."
                            className={inputClass}
                          />
                        </Field>
                      </div>
                    </Card>
                  );
                })}
            {tab === "Sikap" && (
              <>
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">D1 · Kesungguhan dan keaktifan</h3>
                    <span className="text-xs font-semibold text-teal-700">
                      {formatScore2(result.scores.D1)} / 10
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Skor 0–10 tiap pertemuan yang diikuti; izin sah memakai rata-rata pertemuan lain
                    dan tidak dikenai P8. Alpa dicatat sebagai pelanggaran P8 pada D2.
                  </p>
                  <div className="mt-5 divide-y divide-border">
                    {CPMK2_WEEKS.map((week) => {
                      const entry = data.d1[week] ?? { status: "", score: null };
                      return (
                        <div key={week} className="flex flex-wrap items-center gap-4 py-3">
                          <span className="flex-1 text-xs font-medium">Minggu {week}</span>
                          <select
                            aria-label={`Kehadiran minggu ${week}`}
                            value={entry.status}
                            onChange={(e) =>
                              setData({
                                ...data,
                                d1: {
                                  ...data.d1,
                                  [week]: e.target.value === "hadir" ? { status: "hadir", score: entry.score ?? 0 } : { status: e.target.value, score: null },
                                },
                              })
                            }
                            className={`${inputClass} w-36 text-xs`}
                          >
                            <option value="">Belum diisi</option>
                            <option value="hadir">Hadir</option>
                            <option value="izin">Izin sah</option>
                            <option value="alpa">Alpa (P8)</option>
                          </select>
                          <select
                            aria-label={`D1 minggu ${week}`}
                            disabled={entry.status !== "hadir"}
                            value={entry.score ?? ""}
                            onChange={(e) =>
                              setData({
                                ...data,
                                d1: { ...data.d1, [week]: { ...entry, score: e.target.value === "" ? null : Number(e.target.value) } },
                              })
                            }
                            className={`${inputClass} w-32 text-xs disabled:bg-slate-50`}
                          >
                            <option value="">{entry.status === "izin" ? "Rata-rata" : "Skor 0–10"}</option>
                            {Array.from({ length: 11 }, (_, v) => v).map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </Card>
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">D2 · Kepatuhan tata tertib</h3>
                    <span className="text-xs font-semibold text-teal-700">
                      {formatScore2(result.scores.D2)} / 10
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Catat tiap kejadian satu baris. Pengulangan setelah teguran dicatat sebagai
                    pelanggaran baru. Penggunaan perangkat untuk praktikum dengan izin tidak dihitung.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {CPMK2_VIOLATIONS.map((violation) => (
                      <div key={violation.code} className="flex items-start gap-2 rounded-lg border border-border p-3">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                          {violation.code}
                        </span>
                        <div className="flex-1">
                          <p className="text-[10px] leading-relaxed text-slate-600">{violation.name}</p>
                          <p className="mt-1 text-[9px] text-slate-400">
                            −{violation.penalty} poin{deductions[violation.code] ? <> · {data.d2.filter((e) => e.code === violation.code).length}× dicatat</> : null}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 divide-y divide-border border-t border-border pt-3">
                    {data.d2.map((entry, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2 py-2.5">
                        <select
                          aria-label={`Minggu pelanggaran ${index + 1}`}
                          value={entry.week}
                          onChange={(e) =>
                            setData({ ...data, d2: data.d2.map((item, i) => (i === index ? { ...item, week: e.target.value } : item)) })
                          }
                          className={`${inputClass} w-28 text-[11px]`}
                        >
                          {CPMK2_WEEKS.map((w) => (
                            <option key={w} value={w}>Minggu {w}</option>
                          ))}
                        </select>
                        <select
                          aria-label={`Kode pelanggaran ${index + 1}`}
                          value={entry.code}
                          onChange={(e) =>
                            setData({ ...data, d2: data.d2.map((item, i) => (i === index ? { ...item, code: e.target.value as ViolationCode } : item)) })
                          }
                          className={`${inputClass} w-20 text-[11px]`}
                        >
                          {CPMK2_VIOLATIONS.map((v) => (
                            <option key={v.code} value={v.code}>{v.code}</option>
                          ))}
                        </select>
                        <input
                          maxLength={1000}
                          value={entry.note}
                          onChange={(e) =>
                            setData({ ...data, d2: data.d2.map((item, i) => (i === index ? { ...item, note: e.target.value } : item)) })
                          }
                          placeholder="Catatan singkat (opsional)"
                          className={`${inputClass} min-w-40 flex-1 text-[11px]`}
                        />
                        <button
                          aria-label={`Hapus pelanggaran ${index + 1}`}
                          onClick={() => setData({ ...data, d2: data.d2.filter((_, i) => i !== index) })}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <Button variant="secondary" className="mt-3" onClick={() => setData({ ...data, d2: [...data.d2, { week: "6", code: "P1", note: "" }] })}>
                      <Plus size={13} /> Catat pelanggaran
                    </Button>
                  </div>
                  <div className="mt-3 flex justify-between rounded-lg bg-slate-50 p-3 text-xs">
                    <span className="text-slate-500">Total pengurangan</span>
                    <strong className="tabular-nums">{totalDeduction} poin</strong>
                  </div>
                  <label className="mt-4 flex items-start gap-2 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={data.d2Reviewed}
                      onChange={(e) => setData({ ...data, d2Reviewed: e.target.checked })}
                      className="mt-0.5 accent-teal-700"
                    />
                    Saya telah memeriksa catatan pelanggaran, termasuk jika tidak ada pelanggaran.
                  </label>
                  <button
                    aria-label="Kurangi pelanggaran terakhir"
                    className="sr-only"
                    onClick={() => setData({ ...data, d2: data.d2.slice(0, -1) })}
                    disabled={!data.d2.length}
                  >
                    <Minus size={0} />
                  </button>
                </Card>
              </>
            )}
            {tab === "Ringkasan" && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold">Ringkasan seluruh komponen</h3>
                <p className="mt-2 text-[11px] text-slate-500">
                  Nilai akhir = jumlah skor aspek, maksimal 100.
                </p>
                <div className="mt-5 divide-y divide-border">
                  {(["A1", "A2"] as const).map((code) => (
                    <div key={code} className="flex items-center gap-3 py-3">
                      <span className="w-7 text-[11px] font-semibold text-slate-500">{code}</span>
                      <span className="flex-1 text-xs">{code === "A1" ? "Ketepatan waktu pengumpulan" : "Kondisi isi saat pengumpulan"}</span>
                      <span className="text-xs font-semibold tabular-nums text-teal-700">
                        {formatScore2(result.scores[code])}
                        <span className="ml-1 font-normal text-slate-400">/ 10</span>
                      </span>
                    </div>
                  ))}
                  {CPMK2_ASPECTS.map((aspect) => (
                    <div key={aspect.code} className="flex items-center gap-3 py-3">
                      <span className="w-7 text-[11px] font-semibold text-slate-500">{aspect.code}</span>
                      <span className="flex-1 text-xs">{aspect.name}</span>
                      <span className="text-xs font-semibold tabular-nums text-teal-700">
                        {formatScore2(result.scores[aspect.code as "B1"])}
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
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Opsional, dicatat pada riwayat perubahan..."
                    className={inputClass}
                  />
                </Field>
              </Card>
            )}
          </div>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-[100px]">
          <Card className="overflow-hidden">
            <div className="bg-[#203b52] px-5 py-5 text-white">
              <p className="text-[9px] font-semibold uppercase tracking-[1.6px] text-[#abc6b9]">
                {result.complete ? "Nilai akhir resmi" : "Nilai sementara"}
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-[46px] leading-none">{formatScore2(result.total)}</span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-300">
                {CPMK2_LABEL}
              </p>
            </div>
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-semibold">Progres penilaian</span>
                <span className="text-[10px] text-slate-400">{result.completed}/{result.required}</span>
              </div>
              <Progress value={result.completed} total={result.required} />
              <div className="mt-5 space-y-2.5">
                {(["A1", "A2"] as const).concat(CPMK2_ASPECTS.map((a) => a.code)).map((code, i) => (
                  <div key={code + i} className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`flex size-4 items-center justify-center rounded-full ${
                        result.scores[code as "A1"] != null ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-300"
                      }`}
                    >
                      {result.scores[code as "A1"] != null ? <Check size={10} /> : <span className="size-1 rounded-full bg-slate-300" />}
                    </span>
                    <span className="text-slate-500">{code}</span>
                    <span className="ml-auto font-medium tabular-nums">{formatScore2(result.scores[code as "A1"])}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className={`mb-3 flex items-center gap-1.5 text-[10px] ${dirty ? "text-amber-600" : "text-slate-400"}`}>
                  <span className={`size-1.5 rounded-full ${dirty ? "bg-amber-500" : "bg-slate-300"}`} />
                  {dirty ? "Ada perubahan belum tersimpan" : `Tersimpan · revisi ${revision}`}
                </p>
                <Button className="w-full" onClick={() => save(result.complete)} disabled={busy}>
                  {busy ? <Spinner /> : <Save size={14} />}Simpan penilaian
                </Button>
                {result.complete && (
                  <Button variant="ghost" className="mt-1 w-full text-[10px]" disabled={busy} onClick={() => save(false)}>
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
              Rubrik tetap (Tahap II − basis data). Perubahan konfigurasi Tahap I tidak memengaruhi rumus ini.
            </span>
          </div>
          <div className="flex gap-2">
            {position > 0 && (
              <Link
                to={`/cpmk2/rombel-${student.rombel_id}/${classmates[position - 1].npm}`}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-white p-2.5 text-[10px] text-slate-500"
              >
                <ArrowLeft size={12} /> Sebelumnya
              </Link>
            )}
            {position < classmates.length - 1 && (
              <Link
                to={`/cpmk2/rombel-${student.rombel_id}/${classmates[position + 1].npm}`}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-white p-2.5 text-[10px] text-slate-500"
              >
                Berikutnya <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </aside>
      </div>
      {logs && (
        <Modal title={`Riwayat · ${student.name}`} onClose={() => setLogs(null)} wide>
          <Logs items={logs.filter((log) => log.component.startsWith("CPMK2") || true)} />
        </Modal>
      )}
      {blocker.state === "blocked" && (
        <Modal title="Perubahan belum tersimpan" onClose={() => blocker.reset?.()}>
          <p className="text-sm leading-relaxed text-slate-500">
            Jika meninggalkan halaman, perubahan yang belum disimpan akan hilang. Tetap di sini untuk menyimpan penilaian dahulu.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => blocker.reset?.()}>Tetap di halaman</Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>Tinggalkan perubahan</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
