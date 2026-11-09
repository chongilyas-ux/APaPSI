import { createFileRoute } from "@tanstack/react-router";
import Cpmk2Students from "@/app/Cpmk2Students";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/cpmk2/")({
  head: () =>
    pageHead(
      "Penilaian CPMK 2",
      "Daftar penilaian Tahap II: perancangan dan implementasi basis data.",
    ),
  loader: () => protect(() => api("/cpmk2/students")),
  component: () => <Cpmk2Students />,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
