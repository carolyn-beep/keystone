import { Suspense, lazy, type ReactNode } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RootLayout } from "@/components/layout";
import { CHAT_HOME_ROUTE_PATH, LIBRARY_ROUTE_PATH } from "@/components/chat/chat-home-helpers";

// Lazy load pages for code splitting
const ChatHome = lazy(() => import("@/pages/ChatHome"));
const Home = lazy(() => import("@/pages/Home"));
const Skills = lazy(() => import("@/pages/Skills"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const AdminProviders = lazy(() => import("@/pages/AdminProviders"));
const Login = lazy(() => import("@/pages/Login"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/**
 * Helper that wraps a page in the shelled-auth chain (ProtectedRoute +
 * RootLayout). Each shelled `<Route>` in the outer Switch renders the SAME
 * outer structure (ProtectedRoute → RootLayout), and only the leaf page
 * differs. React reconciles the identical ancestor types across route
 * transitions, so RootLayout (and therefore the single AppShell instance,
 * sidebar collapse state, and drawer state) survives shelled navigation.
 */
function Shelled({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <RootLayout>{children}</RootLayout>
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      {/* Outside-shell routes -- no auth gate, no RootLayout, no AppShell. */}
      <Route path="/login" component={Login} />
      <Route path="/view/:slug">
        {(params) => <Dashboard slug={params.slug} isSharedView={true} />}
      </Route>

      {/* Shelled-authenticated routes. Each Route shares the same Shelled
          wrapper so React reconciles ProtectedRoute + RootLayout across
          navigation and AppShell stays mounted. Order matters: more specific
          paths first so /:slug doesn't swallow /library, /skills, /analytics,
          /admin/providers, or /grading/:slug. */}
      <Route path={LIBRARY_ROUTE_PATH}>
        <Shelled><Home /></Shelled>
      </Route>
      <Route path="/skills">
        <Shelled><Skills /></Shelled>
      </Route>
      <Route path="/analytics">
        <Shelled><Analytics /></Shelled>
      </Route>
      <Route path="/admin/providers">
        <Shelled><AdminProviders /></Shelled>
      </Route>
      <Route path="/grading/:slug">
        {(params) => (
          <Shelled><Dashboard slug={params.slug} /></Shelled>
        )}
      </Route>
      <Route path={CHAT_HOME_ROUTE_PATH}>
        <Shelled><ChatHome /></Shelled>
      </Route>
      <Route path="/:slug">
        {(params) => (
          <Shelled><Dashboard slug={params.slug} /></Shelled>
        )}
      </Route>

      {/* 404 catchall -- outside the shell. */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Suspense fallback={<PageLoader />}>
          <Router />
        </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
