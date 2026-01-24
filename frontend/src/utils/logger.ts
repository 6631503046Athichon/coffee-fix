/**
 * Centralized logging utility for the Coffee Lab application
 * Provides structured logging with different severity levels
 * and can be integrated with external monitoring services (Sentry, LogRocket, etc.)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private isDevelopment: boolean;
  private isEnabled: boolean;

  constructor() {
    this.isDevelopment = import.meta.env.DEV;
    this.isEnabled = true;
  }

  /**
   * Format log message with timestamp and context
   */
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    if (context) {
      return `${prefix} ${message}\nContext: ${JSON.stringify(context, null, 2)}`;
    }

    return `${prefix} ${message}`;
  }

  /**
   * Send logs to external monitoring service (placeholder)
   */
  private sendToMonitoring(level: LogLevel, message: string, error?: Error, context?: LogContext) {
    // TODO: Integrate with Sentry, LogRocket, or other monitoring services
    // Example for Sentry:
    // if (level === 'error' && error) {
    //   Sentry.captureException(error, { extra: context });
    // }
  }

  /**
   * Debug level logging - only in development
   */
  debug(message: string, context?: LogContext): void {
    if (!this.isEnabled || !this.isDevelopment) return;

    console.debug(this.formatMessage('debug', message, context));
  }

  /**
   * Info level logging
   */
  info(message: string, context?: LogContext): void {
    if (!this.isEnabled) return;

    if (this.isDevelopment) {
      console.info(this.formatMessage('info', message, context));
    }

    this.sendToMonitoring('info', message, undefined, context);
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext): void {
    if (!this.isEnabled) return;

    console.warn(this.formatMessage('warn', message, context));
    this.sendToMonitoring('warn', message, undefined, context);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (!this.isEnabled) return;

    const errorObj = error instanceof Error ? error : undefined;
    const errorMessage = this.formatMessage('error', message, context);

    console.error(errorMessage);
    if (errorObj) {
      console.error('Error details:', errorObj);
    } else if (error) {
      console.error('Error details:', error);
    }

    this.sendToMonitoring('error', message, errorObj, context);
  }

  /**
   * Disable logging (useful for tests)
   */
  disable(): void {
    this.isEnabled = false;
  }

  /**
   * Enable logging
   */
  enable(): void {
    this.isEnabled = true;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for external use
export type { LogLevel, LogContext };
