import { describe, it, expect } from 'vitest'
import { expectAffected, expectOne, NoRowsAffectedError } from './affectedRows'

describe('expectAffected', () => {
  it('throws with context + message when result has an error', () => {
    const result = { data: null, error: { message: 'foreign key violation' } }
    expect(() => expectAffected(result, 'approveScorecard')).toThrow(
      'approveScorecard: foreign key violation',
    )
  })

  it('throws NoRowsAffectedError when data is an empty array', () => {
    const result = { data: [] as { id: string }[], error: null }
    expect(() => expectAffected(result, 'approveScorecard')).toThrow(NoRowsAffectedError)
    expect(() => expectAffected(result, 'approveScorecard')).toThrow(
      'approveScorecard: write affected 0 rows',
    )
  })

  it('throws NoRowsAffectedError when data is null', () => {
    const result = { data: null as { id: string }[] | null, error: null }
    expect(() => expectAffected(result, 'updateScore')).toThrow(NoRowsAffectedError)
    expect(() => expectAffected(result, 'updateScore')).toThrow(
      'updateScore: write affected 0 rows',
    )
  })

  it('returns the data array on the happy path', () => {
    const rows = [{ id: 'abc' }, { id: 'def' }]
    const result = { data: rows, error: null }
    expect(expectAffected(result, 'updateScore')).toBe(rows)
  })

  it('error takes precedence over null data', () => {
    const result = { data: null, error: { message: 'permission denied' } }
    expect(() => expectAffected(result, 'ctx')).toThrow('ctx: permission denied')
  })
})

describe('expectOne', () => {
  it('throws when more than 1 row is returned', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    const result = { data: rows, error: null }
    expect(() => expectOne(result, 'approveScorecard')).toThrow(
      'approveScorecard: expected exactly 1 row, got 2',
    )
  })

  it('throws when 0 rows are returned (delegates to expectAffected)', () => {
    const result = { data: [] as { id: string }[], error: null }
    expect(() => expectOne(result, 'approveScorecard')).toThrow(NoRowsAffectedError)
  })

  it('returns the single row when exactly 1 row is returned', () => {
    const row = { id: 'abc', status: 'approved' }
    const result = { data: [row], error: null }
    expect(expectOne(result, 'approveScorecard')).toBe(row)
  })

  it('propagates db errors via expectAffected', () => {
    const result = { data: null, error: { message: 'timeout' } }
    expect(() => expectOne(result, 'ctx')).toThrow('ctx: timeout')
  })
})

describe('NoRowsAffectedError', () => {
  it('has the correct name property', () => {
    const err = new NoRowsAffectedError('ctx')
    expect(err.name).toBe('NoRowsAffectedError')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(NoRowsAffectedError)
  })

  it('formats the message correctly', () => {
    const err = new NoRowsAffectedError('approveScorecard')
    expect(err.message).toBe('approveScorecard: write affected 0 rows')
  })
})
