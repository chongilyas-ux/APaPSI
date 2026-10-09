import { createFileRoute } from "@tanstack/react-router";
import Students from "@/app/Students";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/mahasiswa")({
  head: () => pageHead("Mahasiswa", "Daftar mahasiswa praktikum APSI per rombel."),
  loader: () => protect(() => api("/students")),
  component: () => <Students mode="students" />,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
