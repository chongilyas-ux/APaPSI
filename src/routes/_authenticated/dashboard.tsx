import { createFileRoute } from "@tanstack/react-router";
import Dashboard, { type DashboardData } from "@/app/Dashboard";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import type { Student } from "@/lib/domain";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageHead("Dashboard", "Ringkasan progres penilaian praktikum APSI per rombel."),
  loader: () =>
    protect(async () => ({
      summary: await api<DashboardData>("/dashboard"),
      students: await api<Student[]>("/students"),
    })),
  component: Dashboard,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
