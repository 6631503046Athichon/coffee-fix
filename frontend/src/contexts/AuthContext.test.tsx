import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User, UserRole } from '../types';
import { authService } from '../services/auth/authService';
import { AUTH_RESTORE_TIMEOUT_MS, AuthProvider, useAuth } from './AuthContext';

// F41: a backend waking from idle can take several seconds to answer
// /auth/me. A 2-second cap treated every signed-in user as signed out on a
// cold start; the session check now waits up to AUTH_RESTORE_TIMEOUT_MS, a
// late answer still signs the user in, and a late answer never undoes a
// sign-in the user made by hand in the meantime.

vi.mock('../services/auth/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(async () => {}),
  },
}));

const farmer: User = { id: 'u-farmer', name: 'Fern Farmer', username: 'fern', roles: [UserRole.Farmer] };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const Probe: React.FC = () => {
  const { isAuthLoading, isAuthenticated, currentUser, login } = useAuth();
  return (
    <div>
      <p data-testid="state">
        {isAuthLoading ? 'loading' : isAuthenticated ? `signed in as ${currentUser?.name}` : 'signed out'}
      </p>
      <button onClick={() => void login('fern', 'Secret123')}>sign in</button>
    </div>
  );
};

const state = () => screen.getByTestId('state').textContent;

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session restore on a slow (cold) backend', () => {
  it('keeps waiting well past 2 seconds instead of signing the user out', async () => {
    const me = deferred<User | null>();
    vi.mocked(authService.getCurrentUser).mockReturnValue(me.promise);

    render(<AuthProvider><Probe /></AuthProvider>);
    expect(state()).toBe('loading');

    await advance(5000);
    expect(state()).toBe('loading');

    me.resolve(farmer);
    await settle();
    expect(state()).toBe('signed in as Fern Farmer');
  });

  it('gives up after the cap, and still signs the user in when the answer comes later', async () => {
    const me = deferred<User | null>();
    vi.mocked(authService.getCurrentUser).mockReturnValue(me.promise);

    render(<AuthProvider><Probe /></AuthProvider>);

    await advance(AUTH_RESTORE_TIMEOUT_MS - 1);
    expect(state()).toBe('loading');
    await advance(1);
    expect(state()).toBe('signed out');

    me.resolve(farmer);
    await settle();
    expect(state()).toBe('signed in as Fern Farmer');
  });

  it('does not let a late "not signed in" answer undo a sign-in made meanwhile', async () => {
    const me = deferred<User | null>();
    vi.mocked(authService.getCurrentUser).mockReturnValue(me.promise);
    vi.mocked(authService.login).mockResolvedValue(farmer);

    render(<AuthProvider><Probe /></AuthProvider>);
    await advance(AUTH_RESTORE_TIMEOUT_MS);
    expect(state()).toBe('signed out');

    await act(async () => {
      screen.getByRole('button', { name: 'sign in' }).click();
    });
    expect(state()).toBe('signed in as Fern Farmer');

    me.resolve(null);
    await settle();
    expect(state()).toBe('signed in as Fern Farmer');
  });

  it('ends the loading state when the user signs in before the check answers', async () => {
    const me = deferred<User | null>();
    vi.mocked(authService.getCurrentUser).mockReturnValue(me.promise);
    vi.mocked(authService.login).mockResolvedValue(farmer);

    render(<AuthProvider><Probe /></AuthProvider>);
    expect(state()).toBe('loading');

    await act(async () => {
      screen.getByRole('button', { name: 'sign in' }).click();
    });
    expect(state()).toBe('signed in as Fern Farmer');

    me.resolve(null);
    await settle();
    await advance(AUTH_RESTORE_TIMEOUT_MS);
    expect(state()).toBe('signed in as Fern Farmer');
  });
});
