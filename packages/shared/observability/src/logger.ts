// ============================================================================
// Logger - Simple structured logging for Yukie services
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  requestId?: string;
  userId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

interface LoggerOptions {
  service: string;
  minLevel?: LogLevel;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatError(err: unknown): LogEntry['error'] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return {
    name: 'UnknownError',
    message: String(err),
  };
}

export class Logger {
  private service: string;
  private minLevel: LogLevel;
  private requestId?: string;
  private userId?: string;

  constructor(options: LoggerOptions) {
    this.service = options.service;
    this.minLevel = options.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info';
  }

  withContext(context: { requestId?: string; userId?: string }): Logger {
    const child = new Logger({ service: this.service, minLevel: this.minLevel });
    child.requestId = context.requestId ?? this.requestId;
    child.userId = context.userId ?? this.userId;
    return child;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: unknown): void {
    if (!shouldLog(level, this.minLevel)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      requestId: this.requestId,
      userId: this.userId,
      data,
      error: formatError(error),
    };

    // Remove undefined fields
    Object.keys(entry).forEach((key) => {
      if (entry[key as keyof LogEntry] === undefined) {
        delete entry[key as keyof LogEntry];
      }
    });

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>, error?: unknown): void {
    this.log('warn', message, data, error);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    this.log('error', message, data, error);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createLogger(service: string): Logger {
  return new Logger({ service });
}

// Pre-configured loggers for common services
export const yukieCoreLogger = createLogger('yukie-core');
export const habitTrackerLogger = createLogger('habit-tracker');

// ============================================================================
// Request Timing
// ============================================================================

export interface TimingResult {
  durationMs: number;
  start: number;
  end: number;
}

export function startTimer(): () => TimingResult {
  const start = Date.now();
  return () => {
    const end = Date.now();
    return {
      durationMs: end - start,
      start,
      end,
    };
  };
}

// ============================================================================
// Metric Types (for future observability expansion)
// ============================================================================

export interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: number;
}

export function recordMetric(metric: Metric): void {
  // For now, just log metrics - can be extended to send to a metrics backend
  console.log(
    JSON.stringify({
      type: 'metric',
      timestamp: metric.timestamp ?? Date.now(),
      name: metric.name,
      value: metric.value,
      tags: metric.tags,
    })
  );
}
