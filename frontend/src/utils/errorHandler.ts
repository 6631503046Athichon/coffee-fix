/**
 * Utility functions for handling API errors consistently across services
 */

export interface ErrorHandlerOptions {
  operation: string;
  fallbackValue?: any;
  showAlert?: boolean;
}

/**
 * Handle API errors with consistent error messages
 * @param error - The error object
 * @param operation - Description of the operation that failed (e.g., "fetch farms", "create user")
 * @returns Formatted error message
 */
export function handleApiError(error: unknown, operation: string): string {
  let errorMessage = `Failed to ${operation}`;

  if (error instanceof Error) {
    errorMessage = error.message;

    // Provide more specific error messages based on error type
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return `Authentication required. Please log in again to ${operation}.`;
    }

    if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      return `You don't have permission to ${operation}.`;
    }

    if (errorMessage.includes('404') || errorMessage.includes('Not found') || errorMessage.includes('not found')) {
      return `Resource not found while trying to ${operation}.`;
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      return `Request timeout while trying to ${operation}. Please try again.`;
    }

    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network') || errorMessage.includes('Network')) {
      return `Network error. Unable to ${operation}. Please check your connection.`;
    }

    if (errorMessage.includes('Backend server is not available') || errorMessage.includes('Cannot connect')) {
      return `Server unavailable. Unable to ${operation}. Please ensure the backend is running.`;
    }
  }

  return errorMessage;
}

/**
 * Handle API errors and log to console
 * @param error - The error object
 * @param options - Error handling options
 * @returns Fallback value if provided, otherwise throws
 */
export function handleApiErrorWithFallback<T>(
  error: unknown,
  options: ErrorHandlerOptions
): T {
  const errorMessage = handleApiError(error, options.operation);
  console.error(errorMessage, error);

  if (options.fallbackValue !== undefined) {
    return options.fallbackValue;
  }

  throw new Error(errorMessage);
}

/**
 * Wrap async operations with consistent error handling
 * @param fn - The async function to execute
 * @param options - Error handling options
 * @returns The result of the function or fallback value
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options: ErrorHandlerOptions
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return handleApiErrorWithFallback<T>(error, options);
  }
}
