import { CircleAlert, RefreshCw } from "lucide-react";
import { Link, useRevalidator } from "@/lib/rr";
import { Button } from "./components";

export default function ErrorPage({ error }: { error?: unknown }) {
  const revalidator = useRevalidator();
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <CircleAlert size={34} className="mb-5 text-amber-600" />
      <h1 className="text-xl font-semibold">Halaman belum dapat dimuat</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">
        {error instanceof Error ? error.message : "Halaman tidak ditemukan atau server belum tersedia."}
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" onClick={() => revalidator.revalidate()}>
          <RefreshCw size={14} />
          Coba lagi
        </Button>
        <Link to="/login" className="rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-white">
          Ke halaman login
        </Link>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Halaman tidak ditemukan</h1>
      <Link to="/dashboard" className="mt-4 inline-block text-sm text-teal-700">
        Kembali ke dashboard
      </Link>
    </div>
  );
}
