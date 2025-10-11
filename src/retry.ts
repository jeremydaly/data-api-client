'use strict'

/**
 * Retry logic for handling scale-to-zero cluster wake-ups
 */

export interface RetryConfig {
  enabled?: boolean
  maxRetries?: number
  baseDelay?: number
  retryableErrors?: string[]
}

// Optimized retry delays for DatabaseResumingException (cluster wake-up)
// Cluster typically takes up to 30 seconds to wake up
// Sequence: 0s, 2s, 5s, 10s, 15s, 20s, 25s, 30s, 35s, 40s
const RESUMING_RETRY_DELAYS = [0, 2000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000]

// Quick retry delays for transient connection errors
// Exponential backoff: 0s, 2s, 4s (3 retries total)
const CONNECTION_RETRY_DELAYS = [0, 2000, 4000]

// Error patterns that indicate transient connection failures
const CONNECTION_ERROR_PATTERNS = [
  'Communications link failure',
  'Connection is not available',
  'currently unavailable',
  'Database cluster is not available',
  "Can't connect to",
  'Connection timed out'
]

/**
 * Check if error is DatabaseResumingException
 */
export function isDatabaseResuming(error: any): boolean {
  if (!error) return false
  const code = error.code || error.Code || error.name || ''
  const message = error.message || error.Message || ''

  return code === 'DatabaseResumingException' || message.includes('is resuming after being auto-paused')
}

/**
 * Check if error is a transient connection error
 */
export function isConnectionError(error: any): boolean {
  if (!error) return false

  const message = error.message || error.Message || ''
  const code = error.code || error.Code || error.name || ''

  // Check for specific error codes
  if (code === 'BadRequestException' || code === 'StatementTimeoutException') {
    return true
  }

  // Check for error message patterns
  return CONNECTION_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

/**
 * Check if an error is retryable (either resuming or connection error)
 */
export function isRetryableError(error: any): boolean {
  return isDatabaseResuming(error) || isConnectionError(error)
}

/**
 * Execute a function with retry logic for scale-to-zero cluster wake-ups
 *
 * Strategy:
 * - DatabaseResumingException: Use configured maxRetries (default 9) with optimized delays for cluster wake-up
 * - Connection errors: Use 3 retries with exponential backoff (0s, 2s, 4s)
 * - Custom retryable errors: Use configured maxRetries with optimized delays
 */
export async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig = {}): Promise<T> {
  const { enabled = true, maxRetries = 9, retryableErrors = [] } = config

  // If retries are disabled, just execute once
  if (!enabled) {
    return fn()
  }

  let attempt = 0
  let retryDelays: number[] = []
  let maxAttempts = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // First attempt has no delay (0ms)
      if (attempt > 0 && retryDelays.length > 0) {
        const delay = retryDelays[attempt] || retryDelays[retryDelays.length - 1]
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      return await fn()
    } catch (error: any) {
      // Determine retry strategy based on error type
      let shouldRetry = false

      if (isDatabaseResuming(error)) {
        // DatabaseResumingException: use optimized delays for cluster wake-up
        retryDelays = RESUMING_RETRY_DELAYS
        maxAttempts = Math.min(maxRetries, retryDelays.length - 1)
        shouldRetry = attempt < maxAttempts
      } else if (isConnectionError(error)) {
        // Connection errors: quick exponential backoff (3 retries)
        retryDelays = CONNECTION_RETRY_DELAYS
        maxAttempts = CONNECTION_RETRY_DELAYS.length - 1
        shouldRetry = attempt < maxAttempts
      } else if (retryableErrors.length > 0 && retryableErrors.includes(error.code || error.name)) {
        // Custom retryable errors: use configured retries with optimized delays
        retryDelays = RESUMING_RETRY_DELAYS
        maxAttempts = Math.min(maxRetries, retryDelays.length - 1)
        shouldRetry = attempt < maxAttempts
      }

      // If not retryable or max attempts reached, throw
      if (!shouldRetry) {
        throw error
      }

      // Increment attempt counter for next retry
      attempt++
    }
  }
}
