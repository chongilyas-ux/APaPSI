import { useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useRouteLoaderData,
  useNavigation,
} from "@/lib/rr";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Table2,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, type UserSession } from "./api";
import { Brand, Modal, Spinner, Button } from "./components";

import { AIEntry } from "./AIWorkspace";

const navigation = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/mahasiswa", label: "Mahasiswa", icon: UsersRound },
  { to: "/penilaian", label: "Penilaian", icon: ClipboardCheck },
  { to: "/nilai-akhir", label: "Nilai Akhir", icon: Table2 },
  { to: "/rubrik", label: "Rubrik Penilaian", icon: BookOpen },
  { to: "/pengaturan", label: "Pengaturan", icon: Settings2 },
];
export type LogItem = {
  id: number;
  username: string;
  name?: string;
  npm?: string;
  component: string;
  before_value: unknown;
  after_value: unknown;
  created_at: string;
  reason: string;
};
function logValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  const display = typeof value === "object" ? JSON.stringify(value) : String(value);
  return display.length > 150 ? display.slice(0, 150) + "…" : display;
}
export function Logs({ items }: { items: LogItem[] }) {
  return items.length ? (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <div key={item.id} className="py-4 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">{item.component}</p>
            <time className="text-[10px] text-slate-400">
              {new Date(item.created_at).toLocaleString("id-ID")}
            </time>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {item.username}
            {item.name ? ` · ${item.name} (${item.npm})` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="max-w-full break-words rounded bg-slate-100 px-2 py-1 text-slate-500">
              {logValue(item.before_value)}
            </span>
            <ChevronRight size={12} />
            <span className="max-w-full break-words rounded bg-teal-50 px-2 py-1 text-teal-700">
              {logValue(item.after_value)}
            </span>
          </div>
          {item.reason && <p className="mt-2 text-[11px] italic text-slate-500">{item.reason}</p>}
        </div>
      ))}
    </div>
  ) : (
    <p className="py-8 text-center text-xs text-slate-400">Belum ada perubahan yang tercatat.</p>
  );
}
export default function Shell() {
  const user = useRouteLoaderData("internal") as UserSession;
  const location = useLocation();
  const navigate = useNavigate();
  const pending = useNavigation();
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logs, setLogs] = useState<LogItem[] | null>(null);
  const current =
    navigation.find((item) => location.pathname.startsWith(item.to))?.label ?? "Ruang kerja";
  async function logout() {
    setLoggingOut(true);
    try {
      await api("/auth/logout", { method: "POST" });
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoggingOut(false);
    }
  }
  async function history() {
    try {
      setLogs(await api<LogItem[]>("/logs"));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function search(event: FormEvent) {
    event.preventDefault();
    navigate(`/penilaian?q=${encodeURIComponent(query)}`);
    setQuery("");
  }
  return (
    <div className="min-h-screen bg-background">
      {mobile && (
        <button
          aria-label="Tutup navigasi"
          onClick={() => setMobile(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[235px] flex-col bg-[#193449] px-5 py-7 text-white transition-transform lg:translate-x-0 ${
          mobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-1">
          <Brand dark />
          <button aria-label="Tutup menu" className="lg:hidden" onClick={() => setMobile(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="mx-1 mt-8 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-[#9dc5b7]" />
            <p className="text-[11px] font-medium text-slate-200">Praktikum APSI</p>
          </div>
          <p className="mt-1.5 pl-3.5 text-[10px] text-slate-400">Angkatan 2024 · Tahap I</p>
        </div>
        <p className="mb-3 mt-8 px-3 text-[9px] font-semibold uppercase tracking-[1.8px] text-[#738e9f]">
          Menu utama
        </p>
        <nav className="space-y-1.5">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobile(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-3 text-[12px] transition ${
                  isActive
                    ? "bg-[#2b4b60] font-semibold text-white"
                    : "text-[#a9bbc8] hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <item.icon size={18} strokeWidth={1.6} />
              {item.label}
              <span className="ml-auto text-[#92b9ac]">
                <ChevronRight size={12} />
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-12">
          <div className="mx-1 rounded-lg border border-white/10 px-3 py-4">
            <ShieldCheck size={19} className="mb-2 text-[#a7c7b9]" />
            <p className="text-[11px] font-medium text-slate-200">Ruang kerja internal</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[#8da4b3]">
              Data praktikan hanya untuk
              <br />
              asisten yang berwenang.
            </p>
          </div>
          <button
            disabled={loggingOut}
            onClick={logout}
            className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-xs text-[#a9bbc8] transition hover:bg-white/5 hover:text-white"
          >
            {loggingOut ? <Spinner /> : <LogOut size={17} />}Keluar dari akun
          </button>
          <p className="mt-4 px-3 text-[9px] text-[#648294]">APaPSI · Universitas Tidar</p>
        </div>
      </aside>
      <div className="lg:ml-[235px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between gap-4 border-b border-border bg-white/95 px-5 backdrop-blur-md md:px-9">
          <div className="flex items-center gap-3">
            <button
              aria-label="Buka navigasi"
              onClick={() => setMobile(true)}
              className="text-slate-500 lg:hidden"
            >
              <Menu size={22} />
            </button>
            <p className="hidden items-center gap-2 text-[11px] sm:flex">
              <span className="text-slate-400">Ruang kerja</span>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="font-medium text-slate-600">{current}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <AIEntry compact />
            <form onSubmit={search} className="relative hidden md:block">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                aria-label="Pencarian global mahasiswa"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari mahasiswa..."
                className="w-48 rounded-lg border border-border bg-slate-50 py-2 pl-9 pr-3 text-[11px] placeholder:text-slate-400 xl:w-56"
              />
            </form>
            <button
              onClick={history}
              aria-label="Riwayat perubahan"
              title="Riwayat perubahan"
              className="rounded-lg border border-border p-2 text-slate-500 hover:bg-slate-50"
            >
              <Clock3 size={16} />
            </button>
            <div className="h-7 w-px bg-border" />
            <Link to="/pengaturan" className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#e8efec] text-xs font-semibold text-teal-800">
                A
              </span>
              <div className="hidden sm:block">
                <p className="text-[11px] font-semibold capitalize">{user.username}</p>
                <p className="mt-0.5 text-[9px] text-slate-400">Asisten praktikum</p>
              </div>
              <ChevronDown size={12} className="text-slate-400" />
            </Link>
          </div>
          {pending.state !== "idle" && (
            <div className="absolute bottom-0 left-0 h-0.5 w-full animate-pulse bg-teal-600" />
          )}
        </header>
        <main id="main-content" className="mx-auto max-w-[1600px] px-5 py-8 md:px-9 md:py-9">
          <Outlet />
        </main>
        <footer className="mx-5 flex flex-wrap justify-between gap-2 border-t border-border py-5 text-[10px] text-slate-400 md:mx-9">
          <span>APaPSI — Asisten Praktikum APSI</span>
          <span>S1 Teknik Industri · Universitas Tidar</span>
        </footer>
      </div>
      {logs && (
        <Modal title="Riwayat perubahan" onClose={() => setLogs(null)} wide>
          <p className="mb-5 text-xs text-slate-500">
            300 aktivitas terbaru. Akun bersama dicatat sebagai Admin.
          </p>
          <Logs items={logs} />
          <Button variant="secondary" onClick={() => setLogs(null)} className="mt-5">
            Tutup riwayat
          </Button>
        </Modal>
      )}
    </div>
  );
}
