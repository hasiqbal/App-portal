import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import PrayerTimes from "./pages/PrayerTimes";
import Adhkar from "./pages/Adhkar";
import CloudData from "./pages/CloudData";
import Announcements from "./pages/Announcements";
import ExcelConverter from "./pages/ExcelConverter";
import SunnahReminders from "./pages/SunnahReminders";
import NotFound from "./pages/NotFound";
import MigrateData from "./pages/MigrateData";

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
          <Route path="/" element={<Dashboard />} />
          <Route path="/prayer-times" element={<PrayerTimes />} />
          <Route path="/adhkar" element={<Adhkar />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/cloud-data" element={<CloudData />} />
          <Route path="/sunnah-reminders" element={<SunnahReminders />} />
          <Route path="/excel-converter" element={<ExcelConverter />} />
          <Route path="/migrate" element={<MigrateData />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
