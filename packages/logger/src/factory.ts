import { Logger } from './logger';
import { LogLevel, LoggerConfig } from './types';

const loggerCache = new Map<string, Logger>();

export function createLogger(packageName: string, config: Omit<LoggerConfig, 'packageName'> = {}): Logger {
  const cacheKey = `${packageName}:${JSON.stringify(config)}`;
  
  if (loggerCache.has(cacheKey)) {
    return loggerCache.get(cacheKey)!;
  }

  const logger = new Logger({
    ...config,
    packageName,
  });

  loggerCache.set(cacheKey, logger);
  return logger;
}

export function getPackageLogger(packageName: string): Logger {
  return createLogger(packageName);
}

export function setGlobalLogLevel(level: LogLevel): void {
  for (const logger of loggerCache.values()) {
    logger.setLevel(level);
  }
}

export function clearLoggerCache(): void {
  loggerCache.clear();
}