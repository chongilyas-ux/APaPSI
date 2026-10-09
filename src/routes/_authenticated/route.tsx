import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { session } from "@/app/api";
import Shell from "@/app/Shell";
import AIWorkspaceProvider from "@/app/AIWorkspace";
import ErrorPage, { NotFoundPage } from "@/app/ErrorPage";
import { protect } from "@/lib/route-helpers";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  loader: ({ location }) =>
    protect(async () => {
      const user = await session();
      if (user.requirePasswordChange && location.pathname !== "/pengaturan")
        throw redirect({ to: "/pengaturan" });
      return user;
    }),
  component: InternalShell,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
  notFoundComponent: NotFoundPage,
});

function InternalShell() {
  return (
    <AIWorkspaceProvider>
      <Shell />
    </AIWorkspaceProvider>
  );
}
