import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  GraduationCap,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { Link } from "@/lib/rr";
import type { Calculation } from "@/lib/domain";

export const inputClass =
  "w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-foreground transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/10";
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition ${
        variant === "primary"
          ? "bg-primary text-white hover:bg-[#2d4f68] shadow-sm"
          : variant === "secondary"
            ? "border border-border bg-white text-slate-600 hover:bg-slate-50"
            : variant === "danger"
              ? "bg-red-600 text-white hover:bg-red-700"
              : "text-slate-500 hover:bg-slate-100"
      } ${className}`}
    >
      {children}
    </button>
  );
}
export function Brand({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="APaPSI beranda"
      className={`inline-flex items-center gap-3 ${dark ? "text-white" : "text-primary"}`}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          dark ? "bg-white/10 text-[#b4d7cc]" : "bg-primary text-white"
        }`}
      >
        <GraduationCap size={23} strokeWidth={1.5} />
      </span>
      <span>
        <span className="block text-[23px] font-bold leading-none tracking-[-0.6px]">
          APaPSI<span className="text-teal-500">.</span>
        </span>
        {!compact && (
          <span
            className={`mt-1.5 block whitespace-nowrap font-medium ${
              dark
                ? "text-[7px] tracking-[1.1px] text-slate-400"
                : "text-[9px] tracking-[1.7px] text-slate-500"
            }`}
          >
            ASISTEN PRAKTIKUM APSI
          </span>
        )}
      </span>
    </Link>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      {" "}
      <div>
        {eyebrow && (
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[2px] text-teal-700">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.5px] md:text-[30px]">
          {title}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-white ${className}`}>
      {children}
    </section>
  );
}
export function Status({ result }: { result?: Calculation }) {
  const status = result?.status ?? "empty";
  const labels = {
    empty: "Belum dinilai",
    partial: "Belum lengkap",
    complete: "Sudah lengkap",
    draft: "Draft Excel",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold ${
        status === "complete"
          ? "bg-teal-50 text-teal-700"
          : status === "empty"
            ? "bg-slate-100 text-slate-500"
            : status === "draft"
              ? "bg-blue-50 text-blue-700"
              : "bg-amber-50 text-amber-700"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          status === "complete"
            ? "bg-teal-500"
            : status === "empty"
              ? "bg-slate-400"
              : status === "draft"
                ? "bg-blue-400"
                : "bg-amber-500"
        }`}
      />
      {labels[status]}
    </span>
  );
}
export function Progress({ value, total }: { value: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 w-2 rounded-[2px] ${index < value ? "bg-teal-600" : "bg-slate-200"}`}
          />
        ))}
      </div>
      <span className="text-[10px] tabular-nums text-slate-500">
        {value}/{total}
      </span>
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Cari NPM, nama, atau studi kasus...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="relative block w-full md:max-w-sm">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${inputClass} pl-10 text-xs`}
      />
    </label>
  );
}
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <Search className="mx-auto mb-4 text-slate-300" size={28} />
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto max-h-[88vh] w-[calc(100%-2rem)] ${
        wide ? "max-w-3xl" : "max-w-lg"
      } overflow-y-auto rounded-2xl border border-border bg-white p-0 text-foreground shadow-2xl backdrop:bg-slate-950/40 backdrop:backdrop-blur-sm`}
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Tutup"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
        >
          <X size={20} />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
export function Spinner() {
  return <LoaderCircle size={16} className="animate-spin" />;
}
export function ActionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
    >
      {children}
      <ChevronRight size={14} />
    </Link>
  );
}
export function StepIcon({ number, done = false }: { number: number; done?: boolean }) {
  return (
    <span
      className={`inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ${
        done ? "bg-teal-50 text-teal-600" : "bg-slate-100 text-slate-400"
      }`}
    >
      {done ? <Check size={12} /> : number}
    </span>
  );
}
export function ExternalArrow() {
  return <ArrowUpRight size={16} />;
}
