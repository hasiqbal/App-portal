/**
 * SectionHeader — lightweight section divider with title, subtitle, and optional right action
 */
import React from 'react';

interface SectionHeaderProps {
  icon?: React.ElementType;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}

const SectionHeader = ({ icon: Icon, title, sub, action }: SectionHeaderProps) => (
  <div className="flex items-center gap-3 mb-3">
    <div className="flex items-center gap-2">
      {Icon && <Icon size={15} className="text-[hsl(142_60%_35%)]" />}
      <h2 className="text-sm font-bold text-[hsl(150_30%_12%)]">{title}</h2>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
    <div className="flex-1 h-px bg-[hsl(140_20%_88%)]" />
    {action}
  </div>
);

export default SectionHeader;
