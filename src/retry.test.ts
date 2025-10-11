import { describe, test, expect, vi, beforeEach } from 'vitest'
import { withRetry, isDatabaseResuming, isConnectionError, isRetryableError } from './retry'

describe('Retry Logic', () => {
  beforeEach(() => {
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  describe('isDatabaseResuming', () => {
    test('should detect DatabaseResumingException code', () => {
      const error = { code: 'DatabaseResumingException', message: 'Error' }
      expect(isDatabaseResuming(error)).toBe(true)
    })

    test('should detect resuming message pattern', () => {
      const error = { message: 'The Aurora DB instance is resuming after being auto-paused' }
      expect(isDatabaseResuming(error)).toBe(true)
    })

    test('should return false for non-resuming errors', () => {
      const error = { code: 'BadRequestException', message: 'Error' }
      expect(isDatabaseResuming(error)).toBe(false)
    })

    test('should return false for null/undefined', () => {
      expect(isDatabaseResuming(null)).toBe(false)
      expect(isDatabaseResuming(undefined)).toBe(false)
    })
  })

  describe('isConnectionError', () => {
    test('should detect BadRequestException', () => {
      const error = { code: 'BadRequestException', message: 'Error' }
      expect(isConnectionError(error)).toBe(true)
    })

    test('should detect StatementTimeoutException', () => {
      const error = { code: 'StatementTimeoutException', message: 'Timeout' }
      expect(isConnectionError(error)).toBe(true)
    })

    test('should detect Communications link failure message', () => {
      const error = { message: 'Communications link failure' }
      expect(isConnectionError(error)).toBe(true)
    })

    test('should detect Connection is not available message', () => {
      const error = { message: 'Connection is not available' }
      expect(isConnectionError(error)).toBe(true)
    })

    test('should not detect non-connection errors', () => {
      const error = { code: 'ValidationException', message: 'Invalid input' }
      expect(isConnectionError(error)).toBe(false)
    })
  })

  describe('isRetryableError', () => {
    test('should return true for DatabaseResumingException', () => {
      const error = { code: 'DatabaseResumingException' }
      expect(isRetryableError(error)).toBe(true)
    })

    test('should return true for connection errors', () => {
      const error = { code: 'BadRequestException' }
      expect(isRetryableError(error)).toBe(true)
    })

    test('should return false for non-retryable errors', () => {
      const error = { code: 'ValidationException' }
      expect(isRetryableError(error)).toBe(false)
    })
  })

  describe('withRetry', () => {
    test('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await withRetry(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    test('should not retry on non-retryable errors', async () => {
      const error = { code: 'ValidationException', message: 'Invalid' }
      const fn = vi.fn().mockRejectedValue(error)

      await expect(withRetry(fn)).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    test('should retry DatabaseResumingException with optimized delays', async () => {
      const error = { code: 'DatabaseResumingException', message: 'Resuming' }
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')

      const promise = withRetry(fn, { maxRetries: 5 })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    test('should retry connection errors with quick backoff (3 retries max)', async () => {
      const error = { code: 'BadRequestException', message: 'Communications link failure' }
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')

      const promise = withRetry(fn, { maxRetries: 5 })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    test('should stop after 3 retries for connection errors even with higher maxRetries', async () => {
      const error = { code: 'BadRequestException', message: 'Connection failed' }
      const fn = vi.fn().mockRejectedValue(error)

      const promise = withRetry(fn, { maxRetries: 10 })

      promise.catch(() => {})
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow()
      // 1 initial + 2 retries = 3 total (connection errors limited to 3 attempts)
      expect(fn).toHaveBeenCalledTimes(3)
    })

    test('should use connection error delays (0s, 2s, 4s)', async () => {
      const error = { code: 'BadRequestException', message: 'Connection failed' }
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')

      const delays: number[] = []
      const originalSetTimeout = global.setTimeout

      vi.spyOn(global, 'setTimeout').mockImplementation(((callback: any, ms: number) => {
        delays.push(ms)
        return originalSetTimeout(callback, 0)
      }) as any)

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()
      await promise

      // Connection errors use: 2000ms, 4000ms
      expect(delays).toEqual([2000, 4000])
    })

    test('should use resuming delays for DatabaseResumingException', async () => {
      const error = { code: 'DatabaseResumingException' }
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')

      const delays: number[] = []
      const originalSetTimeout = global.setTimeout

      vi.spyOn(global, 'setTimeout').mockImplementation(((callback: any, ms: number) => {
        delays.push(ms)
        return originalSetTimeout(callback, 0)
      }) as any)

      const promise = withRetry(fn, { maxRetries: 5 })
      await vi.runAllTimersAsync()
      await promise

      // Resuming errors use optimized delays: 2000ms, 5000ms, 10000ms
      expect(delays).toEqual([2000, 5000, 10000])
    })

    test('should not retry when disabled', async () => {
      const error = { code: 'DatabaseResumingException' }
      const fn = vi.fn().mockRejectedValue(error)

      await expect(withRetry(fn, { enabled: false })).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    test('should retry on custom retryable errors', async () => {
      const error = { code: 'CustomError', message: 'Custom error' }
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')

      const promise = withRetry(fn, { retryableErrors: ['CustomError'] })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    test('should respect maxRetries for DatabaseResumingException', async () => {
      const error = { code: 'DatabaseResumingException' }
      const fn = vi.fn().mockRejectedValue(error)

      const promise = withRetry(fn, { maxRetries: 2 })

      promise.catch(() => {})
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })
  })
})
