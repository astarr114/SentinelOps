/**
 * SplunkContext unit tests
 *
 * Assertions:
 *  1. useSplunk() throws when called outside SplunkProvider
 *  2. useSplunk() returns the context value when called inside SplunkProvider
 *  3. config defaults have mode='demo' and splunkHost=''
 *  4. updateConfig merges partial updates correctly
 *  5. SplunkErrorBoundary renders a fallback UI instead of crashing on render error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import React, { type ReactNode } from 'react';

// ── Mock Supabase so it never makes real network calls ────────────────────────
vi.mock('@/db/supabase', () => ({
  supabase: {
    from:      () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    auth:      { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

// ── Mock AuthContext — return a stable anonymous user ─────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, signOut: vi.fn() }),
}));

import { SplunkProvider, useSplunk, SplunkErrorBoundary } from '@/contexts/SplunkContext';

// ── Helper wrapper ────────────────────────────────────────────────────────────
function Wrapper({ children }: { children: ReactNode }) {
  return <SplunkProvider>{children}</SplunkProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSplunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when called outside SplunkProvider', () => {
    // renderHook without a wrapper means no provider in tree
    expect(() => {
      renderHook(() => useSplunk());
    }).toThrow('useSplunk must be used within SplunkProvider');
  });

  it('returns context value when called inside SplunkProvider', () => {
    const { result } = renderHook(() => useSplunk(), { wrapper: Wrapper });
    expect(result.current).toBeDefined();
    expect(result.current.config).toBeDefined();
    expect(typeof result.current.updateConfig).toBe('function');
    expect(typeof result.current.saveConfig).toBe('function');
  });

  it('defaults to demo mode with empty splunkHost', () => {
    const { result } = renderHook(() => useSplunk(), { wrapper: Wrapper });
    expect(result.current.config.mode).toBe('demo');
    expect(result.current.config.splunkHost).toBe('');
    expect(result.current.isLive).toBe(false);
  });

  it('updateConfig merges partial updates without overwriting other fields', () => {
    const { result } = renderHook(() => useSplunk(), { wrapper: Wrapper });

    act(() => {
      result.current.updateConfig({ splunkHost: 'https://splunk.example.com' });
    });

    expect(result.current.config.splunkHost).toBe('https://splunk.example.com');
    // Other fields untouched
    expect(result.current.config.mode).toBe('demo');
    expect(result.current.config.splunkToken).toBe('');
  });

  it('isMcp is false when splunkMcpUrl is empty', () => {
    const { result } = renderHook(() => useSplunk(), { wrapper: Wrapper });
    expect(result.current.isMcp).toBe(false);
  });

  it('isMcp is true when splunkMcpUrl is set (bearer auth)', () => {
    const { result } = renderHook(() => useSplunk(), { wrapper: Wrapper });

    act(() => {
      result.current.updateConfig({ splunkMcpUrl: 'https://mcp.example.com', mcpAuthMethod: 'bearer' });
    });

    expect(result.current.isMcp).toBe(true);
  });
});

// ── SplunkErrorBoundary ───────────────────────────────────────────────────────

describe('SplunkErrorBoundary', () => {
  // Suppress React's console.error for expected boundary catches
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error is thrown', () => {
    const { getByText } = render(
      <SplunkErrorBoundary>
        <span>normal child</span>
      </SplunkErrorBoundary>,
    );
    expect(getByText('normal child')).toBeDefined();
  });

  it('renders fallback UI when a child throws during render', () => {
    const ThrowingChild = () => {
      throw new Error('Test render error');
    };

    const { getByText } = render(
      <SplunkErrorBoundary>
        <ThrowingChild />
      </SplunkErrorBoundary>,
    );

    expect(getByText('Splunk context error')).toBeDefined();
    expect(getByText('Test render error')).toBeDefined();
    expect(getByText('Retry')).toBeDefined();
  });
});
