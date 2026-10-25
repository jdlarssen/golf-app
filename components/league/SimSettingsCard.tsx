import { Card } from '@/components/ui/Card';
import { SettingsDisclosure } from './SettingsDisclosure';
import type { SimSettingGroup } from '@/lib/league/simSettings';

/**
 * The round's settings in a simulator league (#2638, artboards 7a/7b, revision
 * 2): Trackman's two groups «Game» and «Course», label left and value right,
 * «Endret denne runden» under a value the organiser overrode for this round
 * (against the frozen default once the round has started, roundSimSettings),
 * and the tee from the course selection under a divider. The groups come from
 * `simSettingGroups` over the round's effective settings (the snapshot), so the
 * card never merges default and override itself and writes no setting text.
 * The values fold behind one line (SettingsDisclosure, the owner 25.10):
 * closed on the league page, open on the round start.
 */
export function SimSettingsCard({
  summary,
  defaultOpen,
  groups,
  overriddenLabel,
  tee,
}: {
  /** The folded line, «Rundeinnstillinger · Trackman». */
  summary: string;
  defaultOpen: boolean;
  groups: SimSettingGroup[];
  overriddenLabel: string;
  /** The round's tee from the course selection; null when none is set. */
  tee: { label: string; value: string } | null;
}) {
  if (groups.length === 0 && !tee) return null;
  const changed = groups.some((group) => group.rows.some((row) => row.overridden));
  return (
    <Card data-testid="sim-settings-card">
      <SettingsDisclosure
        summary={summary}
        changedLabel={changed ? overriddenLabel : null}
        defaultOpen={defaultOpen}
        testId="sim-settings-disclosure"
      >
        {groups.map((group, gi) => (
          <div key={group.key} className={gi === 0 ? '' : 'mt-3'}>
            <p className="font-sans text-[10px] leading-[15px] font-semibold uppercase tracking-[0.14em] text-muted">
              {group.label}
            </p>
            <dl className="mt-2 space-y-2 font-sans text-[13px] leading-[19.5px]">
              {group.rows.map((row) => (
                <div key={row.key} className="flex justify-between gap-2" data-testid={`sim-setting-${row.key}`}>
                  <dt className="text-muted">{row.label}</dt>
                  <dd
                    className={`min-w-0 text-right font-medium text-text ${
                      row.overridden ? 'flex flex-col items-end' : ''
                    }`}
                  >
                    <span>{row.value}</span>
                    {row.overridden && (
                      <span
                        data-testid="sim-setting-overridden"
                        className="mt-1 inline-block whitespace-nowrap rounded-full bg-accent/15 px-2 py-0.5 font-sans text-[10px] leading-[15px] font-semibold uppercase tracking-[0.14em] text-accent-text"
                      >
                        {overriddenLabel}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {tee && (
          <dl className="mt-3 border-t border-border pt-3 font-sans text-[13px] leading-[19.5px]">
            <div className="flex justify-between gap-2" data-testid="sim-setting-tee">
              <dt className="text-muted">{tee.label}</dt>
              <dd className="min-w-0 text-right font-medium text-text">{tee.value}</dd>
            </div>
          </dl>
        )}
      </SettingsDisclosure>
    </Card>
  );
}
