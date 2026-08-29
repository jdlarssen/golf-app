import { describe, it, expect, vi } from 'vitest'
import { expectOneOrClaim } from './claimFallback'
import { NoRowsAffectedError } from './affectedRows'

/**
 * #1790 — Type A tests for the 42501-fallback decision (edge-case table in the
 * task notes): only an RLS refusal (code 42501) routes to the claim RPC; every
 * other outcome keeps the expectOne semantics untouched.
 */

const row = { id: 'r1' }
const ok = (data: unknown[] | null) => ({ data, error: null }) as {
  data: { id: string }[] | null
  error: { message: string; code?: string } | null
}
const err = (message: string, code?: string) => ({ data: null, error: { message, code } })

describe('expectOneOrClaim', () => {
  it('success with one row → resolves, claim never called', async () => {
    const claim = vi.fn()
    await expect(expectOneOrClaim(ok([row]), 'ctx', claim)).resolves.toBeUndefined()
    expect(claim).not.toHaveBeenCalled()
  })

  it('42501 → claim called once; claim success resolves', async () => {
    const claim = vi.fn().mockResolvedValue({ error: null })
    await expect(
      expectOneOrClaim(err('row-level security', '42501'), 'ctx', claim),
    ).resolves.toBeUndefined()
    expect(claim).toHaveBeenCalledTimes(1)
  })

  it('42501 → claim error throws with context', async () => {
    const claim = vi.fn().mockResolvedValue({ error: { message: 'nope' } })
    await expect(
      expectOneOrClaim(err('row-level security', '42501'), 'registerApnsToken', claim),
    ).rejects.toThrow('registerApnsToken: claim failed: nope')
  })

  it('other error code (23505) → throws via expectOne, claim never called', async () => {
    const claim = vi.fn()
    await expect(
      expectOneOrClaim(err('duplicate key', '23505'), 'ctx', claim),
    ).rejects.toThrow('ctx: duplicate key')
    expect(claim).not.toHaveBeenCalled()
  })

  it('error without a code → throws via expectOne, claim never called', async () => {
    const claim = vi.fn()
    await expect(expectOneOrClaim(err('boom'), 'ctx', claim)).rejects.toThrow('ctx: boom')
    expect(claim).not.toHaveBeenCalled()
  })

  it('0 rows without error → NoRowsAffectedError, claim never called', async () => {
    const claim = vi.fn()
    await expect(expectOneOrClaim(ok([]), 'ctx', claim)).rejects.toBeInstanceOf(
      NoRowsAffectedError,
    )
    expect(claim).not.toHaveBeenCalled()
  })

  it('2+ rows → expectOne throws, claim never called', async () => {
    const claim = vi.fn()
    await expect(expectOneOrClaim(ok([row, row]), 'ctx', claim)).rejects.toThrow(
      'expected exactly 1 row, got 2',
    )
    expect(claim).not.toHaveBeenCalled()
  })
})
