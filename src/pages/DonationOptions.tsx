import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import Sidebar from '#/components/layout/Sidebar';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import DonationOptionModal from '#/components/features/DonationOptionModal';
import { donationOptionsService } from '#/services';
import type { DonationFrequency, DonationOption, DonationOptionAudit } from '#/types';
import { usePermissions } from '#/hooks/usePermissions';
import { toast } from 'sonner';

const DONATION_QUERY_KEY = ['donation-options'];
const DONATION_AUDIT_QUERY_KEY = ['donation-option-audit'];

const formatAmount = (option: DonationOption): string => {
  if (option.is_custom || option.amount_minor === null) return 'Custom';
  const pounds = option.amount_minor / 100;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: option.currency || 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(pounds);
};

const sortForDisplay = (options: DonationOption[]): DonationOption[] => {
  return [...options].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (a.pin_order !== b.pin_order) return a.pin_order - b.pin_order;
    if (a.global_order !== b.global_order) return a.global_order - b.global_order;
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    return a.title.localeCompare(b.title);
  });
};

const formatAuditTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const DonationOptionRow = ({
  option,
  canDelete,
  onEdit,
  onDelete,
  onToggleFeatured,
  onTogglePinned,
  onMove,
  onUpdateGlobalOrder,
}: {
  option: DonationOption;
  canDelete: boolean;
  onEdit: (option: DonationOption) => void;
  onDelete: (option: DonationOption) => void;
  onToggleFeatured: (option: DonationOption) => void;
  onTogglePinned: (option: DonationOption) => void;
  onMove: (option: DonationOption, direction: -1 | 1) => void;
  onUpdateGlobalOrder: (option: DonationOption, nextGlobalOrder: number) => void;
}) => {
  return (
    <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[hsl(150_30%_18%)] truncate">{option.title}</p>
            <Badge variant={option.is_active ? 'default' : 'secondary'}>
              {option.is_active ? 'Active' : 'Inactive'}
            </Badge>
            {option.is_featured && (
              <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Featured</Badge>
            )}
            {option.is_pinned && (
              <Badge className="bg-blue-100 text-blue-700 border border-blue-200">Pinned</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{option.subtitle || 'No subtitle set.'}</p>
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span>{formatAmount(option)}</span>
            <span>Frequency: {option.frequency}</span>
            <span>Slot: {option.price_slot ?? 'none'}</span>
            <span>Global: {option.global_order}</span>
            <span>Section: {option.display_order}</span>
            {option.tags.length > 0 && <span>Tags: {option.tags.join(', ')}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            title="Move up"
            onClick={() => onMove(option, -1)}
          >
            <ArrowUp size={13} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            title="Move down"
            onClick={() => onMove(option, 1)}
          >
            <ArrowDown size={13} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            title="Toggle featured"
            onClick={() => onToggleFeatured(option)}
          >
            <Star size={13} className={option.is_featured ? 'text-amber-500 fill-amber-300' : ''} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            title="Toggle pinned"
            onClick={() => onTogglePinned(option)}
          >
            <Pin size={13} className={option.is_pinned ? 'text-blue-600 fill-blue-200' : ''} />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onEdit(option)}>
            <Pencil size={13} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            disabled={!canDelete}
            onClick={() => onDelete(option)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-[hsl(140_20%_90%)] flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Global Order</label>
        <Input
          type="number"
          min={0}
          defaultValue={option.global_order}
          className="h-8 w-24"
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (!Number.isFinite(next) || next < 0 || next === option.global_order) return;
            onUpdateGlobalOrder(option, next);
          }}
        />
      </div>
    </div>
  );
};

const DonationOptions = () => {
  const queryClient = useQueryClient();
  const { canEdit, canDelete } = usePermissions();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DonationOption | null>(null);

  const {
    data: options = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: DONATION_QUERY_KEY,
    queryFn: () => donationOptionsService.getAll({ includeInactive: true }),
  });

  const { data: auditRows = [] } = useQuery({
    queryKey: DONATION_AUDIT_QUERY_KEY,
    queryFn: () => donationOptionsService.getAudit(40),
  });

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = sortForDisplay(options);
    if (!term) return source;

    return source.filter((option) => {
      const haystack = [
        option.title,
        option.subtitle ?? '',
        option.frequency,
        option.tags.join(' '),
        option.campaign_label ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [options, search]);

  const grouped = useMemo(() => {
    const oneOff = filteredOptions.filter((option) => option.frequency === 'one-off');
    const monthly = filteredOptions.filter((option) => option.frequency === 'monthly');
    return { oneOff, monthly };
  }, [filteredOptions]);

  const refreshAll = async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: DONATION_AUDIT_QUERY_KEY }),
    ]);
  };

  const handleModalSaved = async () => {
    setModalOpen(false);
    setEditing(null);
    await refreshAll();
  };

  const withMutationGuard = async (action: () => Promise<void>, successMessage: string) => {
    try {
      await action();
      toast.success(successMessage);
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed.';
      toast.error(message);
    }
  };

  const reorderWithinSection = async (
    option: DonationOption,
    direction: -1 | 1,
  ) => {
    const section = sortForDisplay(options).filter((entry) => entry.frequency === option.frequency);
    const index = section.findIndex((entry) => entry.id === option.id);
    if (index === -1) return;

    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= section.length) return;

    const current = section[index];
    const target = section[swapIndex];

    await withMutationGuard(async () => {
      await donationOptionsService.reorder([
        {
          id: current.id,
          pin_order: current.pin_order,
          display_order: target.display_order,
          global_order: current.global_order,
        },
        {
          id: target.id,
          pin_order: target.pin_order,
          display_order: current.display_order,
          global_order: target.global_order,
        },
      ]);
    }, 'Section order updated.');
  };

  const toggleFeatured = async (option: DonationOption) => {
    await withMutationGuard(
      () => donationOptionsService.update(option.id, { is_featured: !option.is_featured }).then(() => undefined),
      option.is_featured ? 'Featured removed.' : 'Marked as featured.'
    );
  };

  const togglePinned = async (option: DonationOption) => {
    await withMutationGuard(
      () => donationOptionsService.update(option.id, { is_pinned: !option.is_pinned }).then(() => undefined),
      option.is_pinned ? 'Pinned removed.' : 'Option pinned.'
    );
  };

  const updateGlobalOrder = async (option: DonationOption, nextGlobalOrder: number) => {
    await withMutationGuard(
      () => donationOptionsService.update(option.id, { global_order: nextGlobalOrder }).then(() => undefined),
      'Global order updated.'
    );
  };

  const handleDelete = async (option: DonationOption) => {
    if (!canDelete) {
      toast.error('Only admins can delete donation options.');
      return;
    }

    if (!window.confirm(`Delete donation option \"${option.title}\" permanently?`)) {
      return;
    }

    await withMutationGuard(
      () => donationOptionsService.delete(option.id),
      'Donation option deleted.'
    );
  };

  const renderSection = (title: string, frequency: DonationFrequency, rows: DonationOption[]) => {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[hsl(150_32%_20%)]">{title}</h2>
          <Badge variant="secondary">{rows.length} items</Badge>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[hsl(140_20%_86%)] px-4 py-6 text-sm text-muted-foreground bg-white">
            No {frequency} donation options found for this filter.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((option) => (
              <DonationOptionRow
                key={option.id}
                option={option}
                canDelete={canDelete}
                onEdit={(selected) => {
                  setEditing(selected);
                  setModalOpen(true);
                }}
                onDelete={handleDelete}
                onToggleFeatured={toggleFeatured}
                onTogglePinned={togglePinned}
                onMove={reorderWithinSection}
                onUpdateGlobalOrder={updateGlobalOrder}
              />
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderAudit = (rows: DonationOptionAudit[]) => {
    return (
      <section className="rounded-2xl border border-[hsl(140_20%_88%)] bg-white">
        <div className="px-4 py-3 border-b border-[hsl(140_20%_90%)]">
          <h3 className="font-semibold text-[hsl(150_30%_18%)]">Recent Audit Activity</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Create, edit, and delete events with before/after snapshots.</p>
        </div>
        <div className="max-h-80 overflow-auto divide-y divide-[hsl(140_20%_92%)]">
          {rows.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            rows.map((row) => {
              const beforeTitle = (row.before_data as DonationOption | null)?.title ?? '-';
              const afterTitle = (row.after_data as DonationOption | null)?.title ?? '-';
              return (
                <div key={row.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-[hsl(150_30%_18%)]">{row.action.toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground">{formatAuditTime(row.created_at)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Before: {beforeTitle} | After: {afterTitle}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="flex min-h-screen bg-[hsl(140_30%_97%)]">
      <Sidebar />

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="bg-white border-b border-[hsl(140_20%_88%)] px-4 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[hsl(150_30%_18%)]">Donation Options</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage one-off and monthly options, promotions, and ordering used by the app.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-9" onClick={() => refreshAll()}>
                <RefreshCw size={14} className="mr-1.5" /> Refresh
              </Button>
              <Button
                className="h-9"
                disabled={!canEdit}
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <Plus size={14} className="mr-1.5" /> New Option
              </Button>
            </div>
          </div>

          <div className="mt-4 max-w-md">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title, tag, frequency, or campaign label"
              className="bg-white"
            />
          </div>
        </div>

        <div className="px-4 sm:px-8 py-6 space-y-6">
          {!canEdit ? (
            <div className="rounded-xl border border-[hsl(40_70%_70%)] bg-[hsl(45_80%_95%)] px-4 py-3 text-sm text-[hsl(35_65%_26%)]">
              You do not have edit permissions for donation management. Ask an admin for editor or admin access.
            </div>
          ) : isLoading ? (
            <div className="rounded-xl border border-[hsl(140_20%_88%)] bg-white px-4 py-6 text-sm text-muted-foreground">
              Loading donation options...
            </div>
          ) : (
            <>
              {renderSection('One-off Donations', 'one-off', grouped.oneOff)}
              {renderSection('Monthly Subscriptions', 'monthly', grouped.monthly)}
              {renderAudit(auditRows)}
            </>
          )}
        </div>
      </main>

      <DonationOptionModal
        open={modalOpen}
        option={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          await handleModalSaved();
        }}
      />
    </div>
  );
};

export default DonationOptions;
