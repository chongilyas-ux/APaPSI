import { createFileRoute } from "@tanstack/react-router";
import Rubric from "@/app/Rubric";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/rubrik")({
  head: () => pageHead("Rubrik Penilaian", "Rubrik aspek A1–D2 yang berlaku untuk penilaian praktikum."),
  loader: () => protect(() => api("/config")),
  component: Rubric,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
