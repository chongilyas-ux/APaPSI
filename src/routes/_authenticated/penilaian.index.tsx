import { createFileRoute } from "@tanstack/react-router";
import Students from "@/app/Students";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/penilaian/")({
  head: () => pageHead("Penilaian", "Pilih mahasiswa untuk mengisi atau memeriksa penilaian praktikum."),
  loader: () => protect(() => api("/students")),
  component: () => <Students mode="assessment" />,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
