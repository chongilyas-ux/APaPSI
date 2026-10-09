import { createFileRoute } from "@tanstack/react-router";
import Settings from "@/app/Settings";
import ErrorPage from "@/app/ErrorPage";
import { api } from "@/app/api";
import { pageHead, protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated/pengaturan")({
  head: () => pageHead("Pengaturan", "Pengaturan akun, rubrik, import dan konfigurasi AI APaPSI."),
  loader: () => protect(() => api("/config")),
  component: Settings,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
});
