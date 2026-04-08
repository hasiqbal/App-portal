import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthContext, useAuthState, useAuth } from "@/hooks/useAuth";

// Pages
import Dashboard from "./pages/Dashboard";
import PrayerTimes from "./pages/PrayerTimes";
import Adhkar from "./pages/Adhkar";
import CloudData from "./pages/CloudData";
import Announcements from "./pages/Announcements";
import ExcelConverter from "./pages/ExcelConverter";
import SunnahReminders from "./pages/SunnahReminders";
import Notifications from "./pages/Notifications";
import Login from "./pages/Login";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

// ─── Protected Route ──────────────────────────────────────────────────────────
// Redirects unauthenticated users to /login
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(140_30%_97%)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[hsl(142_60%_35%)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">Loading portal…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Wrap the router with auth state so all pages can access useAuth()
const AppRoutes = () => {
  const auth = useAuthState();
  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected portal routes */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/prayer-times" element={<ProtectedRoute><PrayerTimes /></ProtectedRoute>} />
        <Route path="/adhkar" element={<ProtectedRoute><Adhkar /></ProtectedRoute>} />
        <Route path="/announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
        <Route path="/sunnah-reminders" element={<ProtectedRoute><SunnahReminders /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/cloud-data" element={<ProtectedRoute><CloudData /></ProtectedRoute>} />
        <Route path="/excel-converter" element={<ProtectedRoute><ExcelConverter /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        {/* Legacy redirects */}
        <Route path="/index" element={<Navigate to="/" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthContext.Provider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
