// @ts-nocheck -- ported verbatim from the original app, which was type-checked under its own (less strict) settings.
import { Link, useLoaderData } from "@/lib/rr";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCheck,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  Plus,
  UsersRound,
} from "lucide-react";
import { Card, PageHeading, Status, Progress, ActionLink } from "./components";
import { formatScore, type Student } from "@/lib/domain";
import { Logs, type LogItem } from "./Shell";
import { AICommandBox } from "./AIWorkspace";

export type DashboardData = {
  total: number;
  rombels: number[];
  complete: number;
  empty: number;
  partial: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  students: Student[];
  logs: LogItem[];
};
export default function Dashboard() {
  const { summary, students } = useLoaderData() as {
    summary: DashboardData;
    students: Student[];
  };
  const metrics = [
    {
      label: "Total mahasiswa",
      value: summary.total,
      subtitle: "Aktif dalam 4 rombel",
      icon: UsersRound,
      color: "bg-blue-50 text-blue-700",
      to: "/mahasiswa",
    },
    {
      label: "Sudah lengkap",
      value: summary.complete,
      subtitle: "Penilaian telah disahkan",
      icon: CheckCheck,
      color: "bg-teal-50 text-teal-700",
      to: "/penilaian?status=complete",
    },
    {
      label: "Perlu dilengkapi",
      value: summary.partial,
      subtitle: "Termasuk draft dari Excel",
      icon: ClipboardCheck,
      color: "bg-amber-50 text-amber-700",
      to: "/penilaian?status=partial",
    },
    {
      label: "Belum dinilai",
      value: summary.empty,
      subtitle: "Siap untuk mulai dinilai",
      icon: Clock3,
      color: "bg-slate-100 text-slate-600",
      to: "/penilaian?status=empty",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Dashboard"
        description="Gambaran praktikum hari ini. Semua data, dalam satu tempat."
        action={
          <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-[11px] text-slate-500">
            <CalendarDays size={14} />
            {new Date().toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        }
      />
      <AICommandBox />
      <section className="relative mb-6 flex flex-wrap items-center justify-between gap-5 overflow-hidden rounded-xl bg-[#203b52] px-7 py-7 text-white">
        <div className="absolute -right-12 -top-36 size-80 rounded-full border border-white/5" />
        <div className="relative">
          <p className="text-[9px] font-semibold uppercase tracking-[2px] text-[#b8d2c5]">
            Praktikum APSI · Tahap I
          </p>
          <h2 className="mt-2 font-display text-[29px]">Selamat bekerja, Asisten.</h2>
          <p className="mt-2 text-xs leading-relaxed text-[#aebfcb]">
            Penilaian yang terarah dimulai dari data yang tertata.
          </p>
        </div>
        <Link
          to="/penilaian"
          className="relative inline-flex items-center gap-3 rounded-lg bg-[#dce9e2] px-4 py-3 text-xs font-semibold text-[#203b52] transition hover:bg-white"
        >
          Mulai penilaian
          <ArrowRight size={15} />
        </Link>
      </section>
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Link key={metric.label} to={metric.to}>
            <Card className="h-full p-5 transition hover:border-slate-300 hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span
                  className={`flex size-9 items-center justify-center rounded-lg ${metric.color}`}
                >
                  <metric.icon size={17} strokeWidth={1.7} />
                </span>
                <ArrowUpRight size={15} className="text-slate-300" />
              </div>
              <p className="mt-4 text-[11px] font-medium text-slate-500">{metric.label}</p>
              <p className="mt-1.5 text-[30px] font-semibold leading-none tabular-nums">
                {metric.value}
              </p>
              <p className="mt-3 text-[10px] text-slate-400">{metric.subtitle}</p>
            </Card>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-5">
            <div>
              <h2 className="text-sm font-semibold">Progres per rombel</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Penilaian lengkap dan sudah disahkan
              </p>
            </div>
            <ActionLink to="/penilaian">Lihat penilaian</ActionLink>
          </div>
          <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
            {summary.rombels.map((count, index) => {
              const complete = students.filter(
                (student) =>
                  student.rombel_id === index + 1 && student.result?.status === "complete",
              ).length;
              return (
                <Link
                  key={index}
                  to={`/penilaian?rombel=${index + 1}`}
                  className="p-5 transition hover:bg-slate-50 sm:odd:border-r sm:[&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-border"
                >
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold">Rombel {index + 1}</span>
                    <span className="text-[10px] text-slate-400">{count} mahasiswa</span>
                  </div>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tabular-nums">{complete}</span>
                    <span className="text-xs text-slate-400">/ {count} lengkap</span>
                    <span className="ml-auto text-xs font-semibold text-teal-700">
                      {count ? Math.round((complete / count) * 100) : 0}%
                    </span>
                  </div>
                  <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                    {Array.from({ length: count }, (_, position) => (
                      <span
                        key={position}
                        className={`flex-1 ${position < complete ? "bg-teal-600" : "bg-slate-100"}`}
                      />
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex justify-between">
            <div>
              <h2 className="text-sm font-semibold">Ringkasan nilai akhir</h2>
              <p className="mt-1 text-[11px] text-slate-400">Hanya dari penilaian yang disahkan</p>
            </div>
            <span className="flex size-8 items-center justify-center rounded-lg bg-slate-50">
              <FileSpreadsheet size={16} className="text-slate-400" />
            </span>
          </div>
          <div className="mt-7 flex items-baseline gap-2">
            <span className="font-display text-5xl text-primary">
              {formatScore(summary.average)}
            </span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Nilai rata-rata</p>
          <div className="mt-6 grid grid-cols-2 divide-x divide-border border-t border-border pt-4">
            <div>
              <p className="text-[10px] text-slate-400">Nilai tertinggi</p>
              <p className="mt-1 text-lg font-semibold text-teal-700">
                {formatScore(summary.highest)}
              </p>
            </div>
            <div className="pl-5">
              <p className="text-[10px] text-slate-400">Nilai terendah</p>
              <p className="mt-1 text-lg font-semibold">{formatScore(summary.lowest)}</p>
            </div>
          </div>
          {summary.average === null && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
              Belum ada nilai resmi. Lengkapi dan sahkan penilaian untuk melihat ringkasan.
            </p>
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-5">
            <div>
              <h2 className="text-sm font-semibold">Lanjutkan penilaian</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Praktikan yang masih memerlukan pemeriksaan
              </p>
            </div>
            <ActionLink to="/penilaian">Lihat semua</ActionLink>
          </div>
          <div className="divide-y divide-border">
            {summary.students.map((student) => (
              <div key={student.id} className="flex items-center gap-3 px-5 py-4">
                <span className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 sm:flex">
                  {student.name
                    .split(" ")
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{student.name}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {student.npm} · Rombel {student.rombel_id}
                  </p>
                </div>
                <div className="hidden md:block">
                  <Status result={student.result} />
                </div>
                <Link
                  to={`/penilaian/rombel-${student.rombel_id}/${student.npm}`}
                  className="rounded-lg border border-border px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Nilai
                  <ArrowRight size={11} className="ml-2 inline" />
                </Link>
              </div>
            ))}
            {!summary.students.length && (
              <p className="py-10 text-center text-xs text-slate-400">
                Semua mahasiswa sudah selesai dinilai.
              </p>
            )}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Akses cepat</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { to: "/penilaian", label: "Input penilaian", icon: Plus },
                { to: "/mahasiswa", label: "Data mahasiswa", icon: UsersRound },
                { to: "/rubrik", label: "Rubrik penilaian", icon: BookOpen },
                {
                  to: "/nilai-akhir",
                  label: "Nilai akhir",
                  icon: FileSpreadsheet,
                },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-2 rounded-lg border border-border p-3 text-[10px] font-medium text-slate-600 hover:border-teal-200 hover:bg-teal-50"
                >
                  <item.icon size={14} className="text-teal-700" />
                  {item.label}
                </Link>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">Aktivitas terbaru</h2>
            <Logs items={summary.logs.slice(0, 2)} />
          </Card>
        </div>
      </div>
    </>
  );
}
