/**
 * PageBanner — reusable page header banner component
 * Used across pages for consistent green-tinted headers with icon, title, subtitle, and optional actions.
 */
import React from 'react';

interface PageBannerProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

const PageBanner = ({ icon: Icon, title, subtitle, actions }: PageBannerProps) => (
  <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[hsl(142_50%_93%)] flex items-center justify-center shrink-0">
          <Icon size={20} className="text-[hsl(142_60%_32%)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[hsl(150_30%_12%)]">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  </div>
);

export default PageBanner;
