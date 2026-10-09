import { useState } from "react";
import { Link, useLoaderData } from "@/lib/rr";
import { BookOpen, FileCheck2, Settings2, ShieldCheck } from "lucide-react";
import { Card, PageHeading } from "./components";
import type { Configuration } from "@/lib/domain";
export default function Rubric() {
  const { active } = useLoaderData() as {
    active: { config: Configuration; number: number };
  };
  const config = active.config;
  const [group, setGroup] = useState("Administrasi");
  return (
    <>
      <PageHeading
        eyebrow="Panduan penilaian"
        title="Rubrik penilaian"
        description="Kriteria yang konsisten untuk penilaian yang dapat dipertanggungjawabkan."
        action={
          <Link
            to="/pengaturan"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-xs font-semibold text-slate-600"
          >
            <Settings2 size={14} />
            Kelola rubrik
          </Link>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-4">
        <BookOpen size={18} className="text-teal-700" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-teal-900">
            {config.label} · Versi {active.number}
          </p>
          <p className="mt-1 text-[11px] text-teal-700">
            Versi awal mengikuti PDF; A1/A2 disesuaikan dengan keputusan 10 slot lab/rumah.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-teal-800">
          100 poin
        </span>
      </div>
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {["Administrasi", "Substansi", "Tata Tulis", "Sikap"].map((item) => (
          <button
            key={item}
            onClick={() => setGroup(item)}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-medium ${
              item === group
                ? "bg-primary text-white"
                : "border border-border bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="space-y-5">
        {config.aspects
          .filter((aspect) => aspect.active && aspect.group === group)
          .map((aspect) => (
            <Card key={aspect.code} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border p-5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-primary">
                  {aspect.code}
                </span>
                <h2 className="flex-1 text-sm font-semibold">{aspect.name}</h2>
                <span className="text-xs text-slate-500">
                  Maksimum <strong className="ml-1 text-primary">{aspect.max}</strong>
                </span>
              </div>
              {aspect.description && (
                <p className="border-b border-border px-5 py-4 text-xs leading-relaxed text-slate-500">
                  {aspect.description}
                </p>
              )}
              {aspect.criteria.length > 0 ? (
                <div className="grid divide-y divide-border md:grid-cols-2 md:divide-y-0">
                  {aspect.criteria
                    .filter((criterion) => criterion.active !== false)
                    .map((criterion, index) => (
                      <div
                        key={criterion.level}
                        className="p-5 md:odd:border-r md:[&:nth-child(-n+2)]:border-b md:[&:nth-child(-n+2)]:border-border"
                      >
                        <div className="flex justify-between gap-3">
                          <span className="text-xs font-semibold">{criterion.level}</span>
                          <span
                            className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                              index === 0
                                ? "bg-teal-50 text-teal-700"
                                : index === 1
                                  ? "bg-blue-50 text-blue-700"
                                  : index === 2
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-red-50 text-red-700"
                            }`}
                          >
                            {criterion.min === criterion.max
                              ? criterion.max
                              : `${criterion.min}–${criterion.max}`}{" "}
                            poin
                          </span>
                        </div>
                        <p className="mt-3 text-[11px] leading-[1.9] text-slate-500">
                          {criterion.description}
                        </p>
                      </div>
                    ))}
                </div>
              ) : aspect.kind === "deduction" ? (
                <div className="p-5">
                  <p className="mb-4 text-xs leading-relaxed text-slate-500">
                    Mulai dari {aspect.max}, dikurangi jumlah kejadian × penalti. Nilai minimum 0.
                  </p>
                  <div className="divide-y divide-border">
                    {config.violations
                      .filter((item) => item.active)
                      .map((item) => (
                        <div key={item.code} className="flex gap-3 py-3">
                          <span className="text-[11px] font-semibold text-slate-500">
                            {item.code}
                          </span>
                          <p className="flex-1 text-[11px] leading-relaxed text-slate-500">
                            {item.name}
                          </p>
                          <span className="text-xs font-semibold text-red-600">
                            −{item.penalty}
                          </span>
                        </div>
                      ))}
                  </div>
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
                    Pengulangan setelah teguran dicatat sebagai kejadian baru. Penggunaan perangkat
                    untuk praktikum dengan izin tidak dihitung. Izin sah tidak dikenai P8.
                  </p>
                </div>
              ) : (
                <div className="p-5">
                  <p className="text-xs leading-relaxed text-slate-500">
                    {config.meetings.filter((item) => item.active).length} pertemuan ×{" "}
                    {config.slots.length} slot pengumpulan. Skor = maksimum − ({config.penalty} ×
                    jumlah slot bermasalah), minimum 0.
                  </p>
                  <div className="mt-4 space-y-3">
                    {(aspect.kind === "submission-time"
                      ? [
                          [
                            "Tepat waktu",
                            "Dikumpulkan sebelum atau tepat pada batas waktu. Tidak dihitung sebagai keterlambatan.",
                          ],
                          [
                            "Terlambat",
                            "Dikumpulkan melewati batas waktu. Dihitung 1 kali terlambat.",
                          ],
                          [
                            "Tidak mengumpulkan",
                            "Tidak ada pengumpulan pada slot tersebut. Dihitung 1 kali terlambat dan 1 kali kurang.",
                          ],
                        ]
                      : [
                          [
                            "Sesuai",
                            "File dapat dibuka dan isi sesuai tugas minggu tersebut. Tidak dihitung sebagai kekurangan.",
                          ],
                          [
                            "Masih kurang",
                            "File dapat dibuka, tetapi ada bagian tugas minggu tersebut yang belum ada atau belum lengkap. Dihitung 1 kali kurang.",
                          ],
                          [
                            "Tidak bisa dibuka",
                            "File rusak, format salah, atau akses tautan ditolak. Dihitung 1 kali kurang.",
                          ],
                          ["Tidak mengumpulkan", "Dihitung 1 kali terlambat dan 1 kali kurang."],
                        ]
                    ).map(([label, description]) => (
                      <div key={label} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold">{label}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          {description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aspect.kind === "average" && (
                <div className="border-t border-border bg-slate-50 px-5 py-4 text-[11px] leading-relaxed text-slate-500">
                  Rata-rata skor pertemuan yang diikuti, dengan imputasi rata-rata untuk izin sah.
                  Skala input 0–10; hasil dikonversi ke maksimum {aspect.max} poin. Jika tidak ada
                  skor pembanding, nilai belum dapat ditentukan.
                </div>
              )}
            </Card>
          ))}
      </div>
      <p className="mt-5 flex items-center gap-2 text-[10px] text-slate-400">
        <ShieldCheck size={13} />
        Penilaian lama tetap menggunakan versi rubrik asalnya.
      </p>
    </>
  );
}
