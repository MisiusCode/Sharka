import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinGate } from '../../src/ui/components/PinGate.js';
import * as api from '../../src/ui/api.js';

describe('PinGate', () => {
  it('antraštėje programos vardas pagal kalbą', () => {
    const { unmount } = render(<PinGate onUnlocked={vi.fn()} locale="en" />);
    expect(screen.getByRole('heading', { name: 'Sharka' })).toBeInTheDocument();
    unmount();

    render(<PinGate onUnlocked={vi.fn()} locale="lt" />);
    expect(screen.getByRole('heading', { name: 'Šarka' })).toBeInTheDocument();
  });

  it('teisingas PIN praneša tėvui', async () => {
    vi.spyOn(api, 'login').mockResolvedValue();
    const onUnlocked = vi.fn();
    render(<PinGate onUnlocked={onUnlocked} locale="lt" />);

    await userEvent.type(screen.getByLabelText('PIN kodas'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    expect(api.login).toHaveBeenCalledWith('1234');
    expect(onUnlocked).toHaveBeenCalled();
  });

  it('neteisingas PIN parodo lietuvišką klaidą pagal kodą ir tėvo nekviečia', async () => {
    // Serveris nuo šiol grąžina tik anglišką `message` —
    // `ApiClientError` su kodu `invalid_pin`, ne pliktas `Error` su lietuvišku
    // tekstu. Lietuvišką „Neteisingas PIN" parenka `errorText` pagal kodą.
    vi.spyOn(api, 'login').mockRejectedValue(new api.ApiClientError('invalid_pin', 'Wrong PIN'));
    const onUnlocked = vi.fn();
    render(<PinGate onUnlocked={onUnlocked} locale="lt" />);

    await userEvent.type(screen.getByLabelText('PIN kodas'), '9999');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    expect(await screen.findByText('Neteisingas PIN')).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('anglišką PIN ekraną rodo pagal kodą, lietuviška — pagal savo raktus', async () => {
    // `ApiClientError` (ne pliktas `Error`) — errorText verčia pagal
    // `error.code`, ne tik perduoda serverio žinutę, žr. ui/errorText.ts.
    vi.spyOn(api, 'login').mockRejectedValue(new api.ApiClientError('invalid_pin', 'Wrong PIN'));
    const onUnlocked = vi.fn();
    render(<PinGate onUnlocked={onUnlocked} locale="en" />);

    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('PIN'), '9999');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Wrong PIN')).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('lietuvišką PIN ekraną rodo su „Prisijungti“ ir „Neteisingas PIN“', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new api.ApiClientError('invalid_pin', 'Wrong PIN'));
    const onUnlocked = vi.fn();
    render(<PinGate onUnlocked={onUnlocked} locale="lt" />);

    expect(screen.getByLabelText('PIN kodas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prisijungti' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('PIN kodas'), '9999');
    await userEvent.click(screen.getByRole('button', { name: 'Prisijungti' }));

    expect(await screen.findByText('Neteisingas PIN')).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});
