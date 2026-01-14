import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserMenu } from "@/components/UserMenu";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
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
        <Router />
        <UserMenuWrapper />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function UserMenuWrapper() {
  const [location] = useLocation();
  // Don't show on login page
  if (location === "/login") return null;
  return <UserMenu />;
}

export default App;
