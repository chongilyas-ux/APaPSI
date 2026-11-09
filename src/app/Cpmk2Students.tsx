// @ts-nocheck -- mengikuti konvensi halaman lain di proyek ini.
import { useMemo, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "@/lib/rr";
import { Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { download } from "./api";
import { Button, Card, Empty, PageHeading, Progress, SearchInput, Spinner } from "./components";
import { CPMK2_LABEL, formatScore2, type Cpmk2Result } from "@/lib/cpmk2/domain";
import type { Cpmk2Student } from "@/lib/cpmk2/server";

const statusLabel: Record<Cpmk2Result["status"], string> = {
  empty: "Belum dinilai",
  partial: "Sebagian",
  complete: "Lengkap",
  "manual-review": "Perlu tinjauan manual",
};

export default function Cpmk2Students() {
  const students = useLoaderData() as Cpmk2Student[];
  const [params, setParams] = useSearchParams();
  const rombel = params.get("rombel") ?? "all";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => {
    const counts = { complete: 0, partial: 0, empty: 0, "manual-review": 0 } as Record<string, number>;
    students.forEach((s) => (counts[s.result.status] += 1));
    return counts;
  }, [students]);

  async function exportScores() {
    setBusy(true);
    try {
      await download(`/cpmk2/export${rombel !== "all" ? `?rombel=${rombel}` : ""}`, "APaPSI-Nilai-CPMK2.xlsx");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rombels = [1, 2, 3, 4];
  const filtered = students.filter(
    (s) =>
      (rombel === "all" || s.rombel_id === Number(rombel)) &&
      (!query.trim() ||
        s.npm.includes(query.trim()) ||
        s.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        s.study_case.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <>
      <PageHeading
        title="Penilaian CPMK 2"
        description="Tahap II — Perancangan dan implementasi basis data (minggu 6, 7, dan 9)."
        action={
          <Button variant="secondary" onClick={exportScores} disabled={busy || !students.length}>
            {busy ? <Spinner /> : <Download size={14} />}Unduh Excel
          </Button>
        }
      />
      <Card className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[1.6px] text-slate-400">Rubrik aktif</p>
          <p className="mt-1 text-xs font-medium">{CPMK2_LABEL}</p>
        </div>
        {[["Lengkap", summary.complete], ["Sebagian", summary.partial], ["Perlu tinjauan", summary["manual-review"]], ["Belum dinilai", summary.empty]].map(
          ([label, value]) => (
            <div key={String(label)}>
              <p className="text-[9px] font-semibold uppercase tracking-[1.6px] text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
            </div>
          ),
        )}
      </Card>
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="flex gap-1 rounded-lg border border-border bg-white p-1">
          <button
            onClick={() => setParams({ rombel: "all", q: query })}
            className={`rounded-md px-3 py-2 text-[11px] font-medium transition ${
              rombel === "all" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Semua
          </button>
          {rombels.map((r) => (
            <button
              key={r}
              onClick={() => setParams({ rombel: String(r), q: query })}
              className={`rounded-md px-3 py-2 text-[11px] font-medium transition ${
                rombel === String(r) ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Rombel {r}
            </button>
          ))}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Cari NPM atau nama mahasiswa..." />
      </Card>
      {filtered.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-[10px] text-slate-500">
                <th className="px-5 py-3 font-medium">NPM</th>
                <th className="px-3 py-3 font-medium">Nama</th>
                <th className="px-3 py-3 font-medium">Rombel</th>
                <th className="px-3 py-3 font-medium">Progres</th>
                <th className="px-3 py-3 font-medium">Nilai</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 text-[11px] tabular-nums text-slate-500">{s.npm}</td>
                  <td className="px-3 py-3 text-[11px] font-medium">{s.name}</td>
                  <td className="px-3 py-3 text-[10px] text-slate-400">Rombel {s.rombel_id}</td>
                  <td className="px-3 py-3">
                    <Progress value={s.result.completed} total={s.result.required} />
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold tabular-nums text-teal-700">
                    {formatScore2(s.result.total || null)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                        s.result.status === "complete"
                          ? "bg-teal-50 text-teal-700"
                          : s.result.status === "manual-review"
                            ? "bg-amber-50 text-amber-700"
                            : s.result.status === "partial"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {statusLabel[s.result.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/cpmk2/rombel-${s.rombel_id}/${s.npm}`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-teal-700 hover:underline"
                    >
                      <Pencil size={12} />
                      Nilai
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty title="Tidak ada mahasiswa" description="Predikat pencarian/filter tidak cocok dengan daftar mahasiswa aktif." />
      )}
      <p className="mt-4 text-[10px] text-slate-400">
        Nilai CPMK 2 tersimpan terpisah dari penilaian Tahap I dan tidak menimpa data lama.
      </p>
    </>
  );
}
