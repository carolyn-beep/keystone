import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Lazy load pages for code splitting
const Home = lazy(() => import("@/pages/Home"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Login = lazy(() => import("@/pages/Login"));
const NotFound = lazy(() => import("@/pages/not-found"));
const DevImportAgentTest = lazy(() => import("@/pages/DevImportAgentTest"));

// Loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dev/import-agent">
        <ProtectedRoute>
          <DevImportAgentTest />
        </ProtectedRoute>
      </Route>
      <Route path="/">
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      </Route>
      <Route path="/brainlifts/:slug">
        {(params) => (
          <ProtectedRoute>
            <Dashboard slug={params.slug} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/grading/:slug">
        {(params) => (
          <ProtectedRoute>
            <Dashboard slug={params.slug} />
          </ProtectedRoute>
        )}
      </Route>
<Route path="/view/:slug">
        {(params) => <Dashboard slug={params.slug} isSharedView={true} />}
      </Route>
      <Route path="/:slug">
        {(params) => (
          <ProtectedRoute>
            <Dashboard slug={params.slug} />
          </ProtectedRoute>
        )}
      </Route>
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
