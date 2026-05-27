import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowStatusChip } from './RowStatusChip';

describe('RowStatusChip', () => {
  it('rendrer riktig label per status og caller onClick', () => {
    const onClick = vi.fn();

    const { rerender } = render(
      <RowStatusChip status="aktiv" onClick={onClick} />,
    );
    expect(screen.getByRole('button')).toHaveTextContent(/aktiv/i);

    rerender(<RowStatusChip status="inaktiv" onClick={onClick} />);
    expect(screen.getByRole('button')).toHaveTextContent(/inaktiv/i);

    rerender(<RowStatusChip status="ny" onClick={onClick} />);
    const nyChip = screen.getByRole('button');
    expect(nyChip).toHaveTextContent(/ny/i);

    fireEvent.click(nyChip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
