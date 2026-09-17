import { describe, it, expect, vi } from 'vitest'
import { withTransientRetry } from './transientRetry'

type Res = { data: string | null; error: { message: string } | null; status: number }

const ok: Res = { data: 'rows', error: null, status: 200 }
const fail = (status: number, message = 'boom'): Res => ({ data: null, error: { message }, status })

function scripted(responses: Res[]) {
  let i = 0
  return vi.fn(async (_signal?: AbortSignal) => responses[Math.min(i++, responses.length - 1)])
}

function fakeSleep() {
  const waits: number[] = []
  const sleep = vi.fn(async (ms: number) => {
    waits.push(ms)
  })
  return { sleep, waits }
}

describe('withTransientRetry', () => {
  it('returns the OK response after 504, 504, OK with waits [500, 1500]', async () => {
    const fn = scripted([fail(504, 'Gateway Timeout'), fail(504, 'Gateway Timeout'), ok])
    const { sleep, waits } = fakeSleep()

    const result = await withTransientRetry(fn, sleep)

    expect(result).toBe(ok)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(waits).toEqual([500, 1500])
  })

  it.each([502, 503, 0])('treats status %i as transient', async (status) => {
    const fn = scripted([fail(status), ok])
    const { sleep, waits } = fakeSleep()

    const result = await withTransientRetry(fn, sleep)

    expect(result).toBe(ok)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(waits).toEqual([500])
  })

  it('returns the last 504 untouched after exactly 3 calls, never a 4th', async () => {
    const last = fail(504, 'third')
    const fn = scripted([fail(504, 'first'), fail(504, 'second'), last, ok])
    const { sleep, waits } = fakeSleep()

    const result = await withTransientRetry(fn, sleep)

    expect(result).toBe(last)
    expect(fn).toHaveBeenCalledTimes(3)
    expect(waits).toEqual([500, 1500])
  })

  it.each([400, 401, 404, 500])('does not retry status %i and returns it untouched', async (status) => {
    const response = fail(status)
    const fn = scripted([response, ok])
    const { sleep } = fakeSleep()

    const result = await withTransientRetry(fn, sleep)

    expect(result).toBe(response)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('does not retry a response without error, even with a transient-looking status', async () => {
    const response: Res = { data: 'rows', error: null, status: 504 }
    const fn = scripted([response, ok])
    const { sleep } = fakeSleep()

    const result = await withTransientRetry(fn, sleep)

    expect(result).toBe(response)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('hands every attempt its own AbortSignal so Next cannot replay a memoized response', async () => {
    const fn = scripted([fail(504), fail(504), ok])
    const { sleep } = fakeSleep()

    await withTransientRetry(fn, sleep)

    const signals = fn.mock.calls.map((call) => (call as unknown[])[0])
    expect(signals).toHaveLength(3)
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal)
    expect(new Set(signals).size).toBe(3)
  })

  it('calls once and never sleeps when the first call succeeds', async () => {
    const fn = scripted([ok])
    const { sleep } = fakeSleep()

    const result = await withTransientRetry(fn, sleep)

    expect(result).toBe(ok)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
