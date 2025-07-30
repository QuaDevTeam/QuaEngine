import { LogLevel } from './types.js';

export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.TRACE]: 'TRACE',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
  [LogLevel.SILENT]: 'SILENT',
};

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.TRACE]: '\x1b[90m', // Gray
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m',  // Green
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
  [LogLevel.FATAL]: '\x1b[35m', // Magenta
  [LogLevel.SILENT]: '\x1b[0m', // Reset
};

export const RESET_COLOR = '\x1b[0m';

export function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

export function parseLogLevelFromEnv(envVar: string = 'LOG_LEVEL'): LogLevel {
  const level = process.env[envVar]?.toUpperCase();
  
  switch (level) {
    case 'TRACE': return LogLevel.TRACE;
    case 'DEBUG': return LogLevel.DEBUG;
    case 'INFO': return LogLevel.INFO;
    case 'WARN': return LogLevel.WARN;
    case 'ERROR': return LogLevel.ERROR;
    case 'FATAL': return LogLevel.FATAL;
    case 'SILENT': return LogLevel.SILENT;
    default: return LogLevel.INFO;
  }
}

export function shouldLog(currentLevel: LogLevel, targetLevel: LogLevel): boolean {
  return currentLevel !== LogLevel.SILENT && targetLevel >= currentLevel;
}

export function formatLogPrefix(
  timestamp: Date,
  level: LogLevel,
  packageName: string,
  moduleName?: string,
  enableColors: boolean = true,
  enableTimestamp: boolean = true
): string {
  const parts: string[] = [];
  
  if (enableTimestamp) {
    const timeStr = formatTimestamp(timestamp);
    parts.push(enableColors ? `\x1b[90m[${timeStr}]\x1b[0m` : `[${timeStr}]`);
  }
  
  const levelName = LOG_LEVEL_NAMES[level];
  const levelColor = enableColors ? LOG_LEVEL_COLORS[level] : '';
  const resetColor = enableColors ? RESET_COLOR : '';
  parts.push(`${levelColor}[${levelName}]${resetColor}`);
  
  parts.push(`[${packageName}]`);
  
  if (moduleName) {
    parts.push(`[${moduleName}]`);
  }
  
  return parts.join('');
}