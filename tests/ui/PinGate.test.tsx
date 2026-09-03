import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinGate } from '../../src/ui/components/PinGate.js';
import * as api from '../../src/ui/api.js';

describe('PinGate', () => {
  it('teisingas PIN praneša tėvui', async () => {
    vi.spyOn(api, 'login').mockResolvedValue();
    const onUnlocked = vi.fn();
    render(<PinGate onUnlocked={onUnlocked} />);

    await userEvent.type(screen.getByLabelText('PIN kodas'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    expect(api.login).toHaveBeenCalledWith('1234');
    expect(onUnlocked).toHaveBeenCalled();
  });

  it('neteisingas PIN parodo serverio žinutę ir tėvo nekviečia', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new Error('Neteisingas PIN'));
    const onUnlocked = vi.fn();
    render(<PinGate onUnlocked={onUnlocked} />);

    await userEvent.type(screen.getByLabelText('PIN kodas'), '9999');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    expect(await screen.findByText('Neteisingas PIN')).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});
