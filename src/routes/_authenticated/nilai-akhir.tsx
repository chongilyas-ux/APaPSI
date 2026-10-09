import { createFileRoute } from "@tanstack/react-router";
import Students from "@/app/Students";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/nilai-akhir")({
  head: () => pageHead("Nilai Akhir", "Rekap nilai akhir praktikum APSI dan ekspor Excel."),
  loader: () => protect(() => api("/students")),
  component: () => <Students mode="final" />,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
