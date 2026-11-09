// @ts-nocheck -- mengikuti konvensi halaman lain di proyek ini.
import { useEffect, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "@/lib/rr";
import { Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { download } from "./api";
import { Button, Card, Empty, PageHeading, SearchInput, Spinner } from "./components";
import Students from "./Students";
import { CPMK2_LABEL, formatScore2, type Cpmk2Result } from "@/lib/cpmk2/domain";
import type { Cpmk2Student } from "@/lib/cpmk2/server";
import type { Student } from "@/lib/domain";

const CPMK2_CODES = ["A1", "A2", "B1", "B2", "B3", "B4", "B5", "C", "D1", "D2"] as const;

const statusLabel: Record<Cpmk2Result["status"], string> = {
  empty: "Belum dinilai",
  partial: "Sebagian",
  complete: "Lengkap",
  "manual-review": "Perlu tinjauan manual",
};

/** Rekap nilai akhir dengan tab per CPMK — penilaian Tahap I dan CPMK 2 tidak dicampur. */
export default function FinalScores() {
  const { students, cpmk2 } = useLoaderData() as { students: Student[]; cpmk2: Cpmk2Student[] };
  const [params, setParams] = useSearchParams();
  const tab = params.get("tahap") === "2" ? "2" : "1";
  const rombel = params.get("rombel") ?? "all";
  const query = params.get("q") ?? "";
  const [busy, setBusy] = useState(false);

  function setTab(next: string) {
    setParams(new URLSearchParams({ tahap: next, rombel, q: query }));
  }
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.set("tahap", tab);
    setParams(next);
  }
  async function exportCpmk2() {
    setBusy(true);
    try {
      await download(`/cpmk2/export${rombel !== "all" ? `?rombel=${rombel}` : ""}`, "APaPSI-Nilai-CPMK2.xlsx");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("apapsi-assessment-state", { detail: { npm: "__students__", dirty: false } }));
  }, []);

  const filtered = cpmk2.filter(
    (s) =>
      (rombel === "all" || s.rombel_id === Number(rombel)) &&
      (!query.trim() ||
        s.npm.includes(query.trim()) ||
        s.name.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <>
      <PageHeading
        eyebrow="Praktikum APSI"
        title="Nilai akhir"
        description="Rekap per CPMK. Pilih tab penilaian — Tahap I dan CPMK 2 dihitung dari rubrik masing-masing."
        action={
          tab === "2" ? (
            <Button variant="secondary" onClick={exportCpmk2} disabled={busy || !filtered.length}>
              {busy ? <Spinner /> : <Download size={15} />}Export Excel
            </Button>
          ) : undefined
        }
      />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-white p-1">
        {[
          ["1", "CPMK 1"],
          ["2", "CPMK 2 · Basis Data"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-xs font-medium transition ${
              tab === value ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "1" ? (
        <Students mode="final" data={students} />
      ) : (
        <>
          <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
            <div className="flex gap-1 rounded-lg border border-border bg-white p-1">
              {["all", "1", "2", "3", "4"].map((value) => (
                <button
                  key={value}
                  onClick={() => update("rombel", value)}
                  className={`rounded-md px-3 py-2 text-[11px] font-medium transition ${
                    rombel === value ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {value === "all" ? "Semua" : `Rombel ${value}`}
                </button>
              ))}
            </div>
            <SearchInput value={query} onChange={(value) => update("q", value)} placeholder="Cari NPM atau nama mahasiswa..." />
            <span className="hidden whitespace-nowrap text-[11px] text-slate-400 md:block">{filtered.length} mahasiswa</span>
          </Card>
          {filtered.length ? (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[1150px] text-left">
                <thead>
                  <tr className="border-y border-border bg-[#f8fafb] text-[9px] font-semibold uppercase tracking-[1px] text-slate-500">
                    <th className="px-3 py-3">NPM</th>
                    <th className="px-3 py-3">Nama mahasiswa</th>
                    {CPMK2_CODES.map((code) => (
                      <th key={code} className="px-2 py-3 text-center">{code}</th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-3 text-right">Nilai akhir</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((s) => (
                    <tr key={s.id} className="transition hover:bg-slate-50/70">
                      <td className="px-3 py-5 text-[11px] tabular-nums text-slate-500">{s.npm}</td>
                      <td className="min-w-44 px-3 py-5">
                        <Link
                          to={`/cpmk2/rombel-${s.rombel_id}/${s.npm}`}
                          className="text-xs font-semibold hover:text-teal-700"
                        >
                          {s.name}
                        </Link>
                        {rombel === "all" && <p className="mt-1 text-[10px] text-slate-400">Rombel {s.rombel_id}</p>}
                      </td>
                      {CPMK2_CODES.map((code) => (
                        <td key={code} className="px-2 py-5 text-center text-[11px] tabular-nums text-slate-500">
                          {formatScore2(s.result.scores[code])}
                        </td>
                      ))}
                      <td className="px-3 py-5 text-right">
                        <span
                          className={`text-[13px] font-semibold tabular-nums ${
                            s.result.status === "complete" ? "text-teal-700" : "text-slate-500"
                          }`}
                        >
                          {s.result.status === "empty" ? "—" : formatScore2(s.result.total)}
                        </span>
                        {s.result.status === "partial" && (
                          <p className="mt-1 text-[8px] text-slate-400">Sementara</p>
                        )}
                      </td>
                      <td className="px-3 py-5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                            s.result.status === "complete"
                              ? "bg-teal-50 text-teal-700"
                              : s.result.status === "manual-review"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {statusLabel[s.result.status]}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-right">
                        <Link
                          to={`/cpmk2/rombel-${s.rombel_id}/${s.npm}`}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-teal-700 hover:underline"
                        >
                          <Pencil size={12} />
                          Periksa
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <Empty title="Mahasiswa tidak ditemukan" description="Coba kata pencarian lain atau ubah filter rombel." />
          )}
          <p className="mt-4 text-[11px] text-slate-400">
            {CPMK2_LABEL}. Nilai sementara bukan nilai final yang sah — status "Lengkap" berarti seluruh 10 komponen terisi.
          </p>
        </>
      )}
    </>
  );
}
