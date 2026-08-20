import type {
  Env
} from "../env";

export type LogLevel =
  | "debug"
  | "info"
  | "warn"
  | "error";

export interface LogContext {
  requestId?: string;
  operation?: string;
  route?: string;
  method?: string;
  city?: string;
  raceDate?: string;
  raceNumber?: number;
  [key: string]: unknown;
}

const ORDER:
Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function configuredLevel(
  env: Env
): LogLevel {
  const raw =
    String(
      env.LOG_LEVEL ??
      "info"
    )
      .trim()
      .toLowerCase();

  if (
    raw === "debug" ||
    raw === "info" ||
    raw === "warn" ||
    raw === "error"
  ) {
    return raw;
  }

  return "info";
}

function debugSampleRate(
  env: Env
): number {
  const value =
    Number(
      env.LOG_DEBUG_SAMPLE_RATE ??
      "0.10"
    );

  if (!Number.isFinite(value)) {
    return 0.10;
  }

  return Math.max(
    0,
    Math.min(
      1,
      value
    )
  );
}

function sanitize(
  value: unknown,
  depth = 0
): unknown {
  if (depth > 4) {
    return "[max-depth]";
  }

  if (value == null) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name:
        value.name,
      message:
        value.message
          .slice(
            0,
            1200
          ),
      stack:
        value.stack
          ?.slice(
            0,
            2000
          ) ??
        null
    };
  }

  if (
    typeof value ===
    "string"
  ) {
    return value.slice(
      0,
      2000
    );
  }

  if (
    typeof value !==
    "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(
        0,
        30
      )
      .map(
        item =>
          sanitize(
            item,
            depth + 1
          )
      );
  }

  const output:
    Record<string, unknown> =
    {};

  for (
    const [key, item] of
    Object.entries(
      value as
        Record<string, unknown>
    )
  ) {
    if (
      /token|secret|password|authorization|cookie|credential/i
        .test(
          key
        )
    ) {
      output[key] =
        "[redacted]";
    } else {
      output[key] =
        sanitize(
          item,
          depth + 1
        );
    }
  }

  return output;
}

function shouldLog(
  env: Env,
  level: LogLevel
): boolean {
  if (
    ORDER[level] <
    ORDER[
      configuredLevel(
        env
      )
    ]
  ) {
    return false;
  }

  if (
    level === "debug" &&
    Math.random() >
      debugSampleRate(
        env
      )
  ) {
    return false;
  }

  return true;
}

export function logEvent(
  env: Env,
  level: LogLevel,
  message: string,
  context:
    LogContext =
    {}
): void {
  if (
    !shouldLog(
      env,
      level
    )
  ) {
    return;
  }

  const line =
    JSON.stringify({
      timestamp:
        new Date()
          .toISOString(),
      level,
      message,
      app:
        env.APP_NAME,
      version:
        env.APP_VERSION,
      ...sanitize(
        context
      ) as
        Record<string, unknown>
    });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  if (level === "debug") {
    console.debug(line);
    return;
  }

  console.info(line);
}

export const logger = {
  debug(
    env: Env,
    message: string,
    context?: LogContext
  ) {
    logEvent(
      env,
      "debug",
      message,
      context
    );
  },

  info(
    env: Env,
    message: string,
    context?: LogContext
  ) {
    logEvent(
      env,
      "info",
      message,
      context
    );
  },

  warn(
    env: Env,
    message: string,
    context?: LogContext
  ) {
    logEvent(
      env,
      "warn",
      message,
      context
    );
  },

  error(
    env: Env,
    message: string,
    context?: LogContext
  ) {
    logEvent(
      env,
      "error",
      message,
      context
    );
  }
};

export async function observed<T>(
  env: Env,
  operation: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  const started =
    Date.now();

  try {
    const result =
      await fn();

    const durationMs =
      Date.now() -
      started;

    if (
      durationMs >
      10000
    ) {
      logger.warn(
        env,
        "operation.slow",
        {
          operation,
          durationMs
        }
      );
    } else {
      logger.debug(
        env,
        "operation.ok",
        {
          operation,
          durationMs
        }
      );
    }

    return result;

  } catch (error) {
    logger.error(
      env,
      "operation.failed",
      {
        operation,
        durationMs:
          Date.now() -
          started,
        error
      }
    );

    return undefined;
  }
}
