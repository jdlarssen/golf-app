import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ArchivedTeesSection,
  type ArchivedTeeRow,
} from './ArchivedTeesSection';

// restoreTee is a server-action — mock it so the form's `action` prop has a
// concrete reference. The render-tests don't invoke it; we just need the
// import to resolve.
vi.mock('./actions', () => ({
  restoreTee: vi.fn(),
}));

const courseId = '11111111-1111-1111-1111-111111111111';

function row(overrides: Partial<ArchivedTeeRow> = {}): ArchivedTeeRow {
  return {
    id: 'tee-1',
    name: 'Gul',
    archived_at: '2026-05-20T10:00:00.000Z',
    length_meters: 5670,
    has_active_name_conflict: false,
    ...overrides,
  };
}

describe('ArchivedTeesSection', () => {
  it('renders null when there are no archived tees', () => {
    const { container } = render(
      <ArchivedTeesSection courseId={courseId} archivedTees={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a details element with the count in the summary', () => {
    render(
      <ArchivedTeesSection
        courseId={courseId}
        archivedTees={[row(), row({ id: 'tee-2', name: 'Hvit' })]}
      />,
    );
    expect(screen.getByText('Arkiverte tees (2)')).toBeInTheDocument();
  });

  it('shows tee name + archived date + length per row', () => {
    render(
      <ArchivedTeesSection
        courseId={courseId}
        archivedTees={[row({ name: 'Gul', length_meters: 5670 })]}
      />,
    );
    expect(screen.getByText('Gul')).toBeInTheDocument();
    // Match the row's archived-date kicker explicitly; the summary contains
    // a substring "Arkivert" too (in "Arkiverte tees"), so we anchor on
    // the trailing "20" from formatShortDateNb's "20. mai 2026" output.
    expect(screen.getByText(/Arkivert 20\./)).toBeInTheDocument();
    expect(screen.getByText(/5670 m/)).toBeInTheDocument();
  });

  it('omits length suffix when length_meters is null', () => {
    render(
      <ArchivedTeesSection
        courseId={courseId}
        archivedTees={[row({ length_meters: null })]}
      />,
    );
    expect(screen.queryByText(/ m\b/)).not.toBeInTheDocument();
  });

  it('shows name-conflict chip only when has_active_name_conflict is true', () => {
    const { rerender } = render(
      <ArchivedTeesSection
        courseId={courseId}
        archivedTees={[row({ has_active_name_conflict: false })]}
      />,
    );
    expect(
      screen.queryByText(/Navnekollisjon/),
    ).not.toBeInTheDocument();

    rerender(
      <ArchivedTeesSection
        courseId={courseId}
        archivedTees={[row({ has_active_name_conflict: true })]}
      />,
    );
    expect(screen.getByText(/Navnekollisjon/)).toBeInTheDocument();
  });

  it('renders one Gjenåpne-button per archived tee', () => {
    render(
      <ArchivedTeesSection
        courseId={courseId}
        archivedTees={[
          row({ id: 'tee-1', name: 'Gul' }),
          row({ id: 'tee-2', name: 'Hvit' }),
          row({ id: 'tee-3', name: 'Rød' }),
        ]}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: /Gjenåpne/ });
    expect(buttons).toHaveLength(3);
  });
});
