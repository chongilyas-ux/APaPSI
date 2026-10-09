// Small compatibility layer: the original APaPSI pages were written against React Router.
// These helpers expose the same hooks/components on top of TanStack Router so the
// ported pages keep their original behaviour unchanged.
import {
  Outlet,
  useBlocker as useTanBlocker,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

export { Outlet };

function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function useNavigate() {
  const router = useRouter();
  return (to: string | number, options?: { replace?: boolean | undefined }) => {
    if (typeof to === "number") return router.history.go(to);
    if (options?.replace) router.history.replace(to);
    else router.history.push(to);
  };
}

export function useLocation() {
  return useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.searchStr ?? "",
      hash: s.location.hash ?? "",
    }),
    structuralSharing: true,
  });
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  replace?: boolean;
  children?: ReactNode;
};
export function Link({ to, replace, onClick, target, ...rest }: LinkProps) {
  const navigate = useNavigate();
  return (
    <a
      {...rest}
      href={to}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || target === "_blank" || !isPlainClick(event)) return;
        event.preventDefault();
        navigate(to, replace ? { replace: true } : undefined);
      }}
    />
  );
}

type NavLinkProps = Omit<LinkProps, "className"> & {
  className?: string | ((state: { isActive: boolean }) => string);
};
export function NavLink({ className, to, ...rest }: NavLinkProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = pathname === to || pathname.startsWith(to + "/");
  return (
    <Link
      {...rest}
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={typeof className === "function" ? className({ isActive }) : className}
    />
  );
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams) => void] {
  const router = useRouter();
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  return [
    params,
    (next) => {
      const query = next.toString();
      router.history.replace(pathname + (query ? `?${query}` : ""));
    },
  ];
}

/** Loader data of the deepest matched route (the page). */
export function useLoaderData(): unknown {
  return useRouterState({
    select: (s) => s.matches[s.matches.length - 1]?.loaderData,
  });
}

const routeIds: Record<string, string> = { internal: "/_authenticated" };
export function useRouteLoaderData(id: string): unknown {
  const routeId = routeIds[id] ?? id;
  return useRouterState({
    select: (s) => s.matches.find((m) => m.routeId === routeId)?.loaderData,
  });
}

export function useRevalidator() {
  const router = useRouter();
  const loading = useRouterState({ select: (s) => s.isLoading });
  return {
    state: loading ? ("loading" as const) : ("idle" as const),
    revalidate: () => router.invalidate(),
  };
}

export function useNavigation() {
  const loading = useRouterState({ select: (s) => s.isLoading || s.status === "pending" });
  return { state: loading ? ("loading" as const) : ("idle" as const) };
}

type BlockArgs = {
  currentLocation: { pathname: string };
  nextLocation: { pathname: string };
};
export function useBlocker(should: boolean | ((args: BlockArgs) => boolean)) {
  const blocker = useTanBlocker({
    shouldBlockFn: ({ current, next }) =>
      typeof should === "function"
        ? should({
            currentLocation: { pathname: current.pathname },
            nextLocation: { pathname: next.pathname },
          })
        : should,
    withResolver: true,
  });
  return {
    state: blocker.status === "blocked" ? ("blocked" as const) : ("unblocked" as const),
    proceed: blocker.status === "blocked" ? blocker.proceed : undefined,
    reset: blocker.status === "blocked" ? blocker.reset : undefined,
  };
}
