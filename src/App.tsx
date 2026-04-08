import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Main portal */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/prayer-times" element={<PrayerTimes />} />
          <Route path="/adhkar" element={<Adhkar />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/sunnah-reminders" element={<SunnahReminders />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/cloud-data" element={<CloudData />} />
          <Route path="/excel-converter" element={<ExcelConverter />} />

          {/* Legacy redirects */}
          <Route path="/index" element={<Navigate to="/" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
