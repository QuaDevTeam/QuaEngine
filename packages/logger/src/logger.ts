import { LogLevel, LoggerConfig, LoggerInstance } from './types';
import { 
  parseLogLevelFromEnv, 
  shouldLog, 
  formatLogPrefix,
  LOG_LEVEL_NAMES 
} from './utils';

export class Logger implements LoggerInstance {
  private packageName: string;
  private moduleName?: string;
  private level: LogLevel;
  private enableColors: boolean;
  private enableTimestamp: boolean;
  private additionalData: any[] = [];

  constructor(config: LoggerConfig = {}) {
    this.packageName = config.packageName || 'unknown';
    this.level = config.level ?? parseLogLevelFromEnv('LOG_LEVEL');
    this.enableColors = config.enableColors ?? this.detectColorSupport();
    this.enableTimestamp = config.enableTimestamp ?? true;
  }

  private detectColorSupport(): boolean {
    if (typeof process === 'undefined') return false;
    if (process.env.NO_COLOR || process.env.FORCE_NO_COLOR) return false;
    if (process.env.FORCE_COLOR) return true;
    
    return process.stdout?.isTTY ?? false;
  }

  private log(level: LogLevel, ...args: any[]): void {
    if (!shouldLog(this.level, level)) return;

    const timestamp = new Date();
    const prefix = formatLogPrefix(
      timestamp,
      level,
      this.packageName,
      this.moduleName,
      this.enableColors,
      this.enableTimestamp
    );

    const allArgs = [prefix, ...args, ...this.additionalData];
    
    switch (level) {
      case LogLevel.TRACE:
      case LogLevel.DEBUG:
        console.debug(...allArgs);
        break;
      case LogLevel.INFO:
        console.info(...allArgs);
        break;
      case LogLevel.WARN:
        console.warn(...allArgs);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(...allArgs);
        break;
    }
  }

  trace(...args: any[]): void {
    this.log(LogLevel.TRACE, ...args);
  }

  debug(...args: any[]): void {
    this.log(LogLevel.DEBUG, ...args);
  }

  info(...args: any[]): void {
    this.log(LogLevel.INFO, ...args);
  }

  warn(...args: any[]): void {
    this.log(LogLevel.WARN, ...args);
  }

  error(...args: any[]): void {
    this.log(LogLevel.ERROR, ...args);
  }

  fatal(...args: any[]): void {
    this.log(LogLevel.FATAL, ...args);
  }

  module(moduleName: string): LoggerInstance {
    const newLogger = new Logger({
      packageName: this.packageName,
      level: this.level,
      enableColors: this.enableColors,
      enableTimestamp: this.enableTimestamp,
    });
    newLogger.moduleName = moduleName;
    newLogger.additionalData = [...this.additionalData];
    return newLogger;
  }

  withData(...data: any[]): LoggerInstance {
    const newLogger = new Logger({
      packageName: this.packageName,
      level: this.level,
      enableColors: this.enableColors,
      enableTimestamp: this.enableTimestamp,
    });
    newLogger.moduleName = this.moduleName;
    newLogger.additionalData = [...this.additionalData, ...data];
    return newLogger;
  }

  isEnabled(level: LogLevel): boolean {
    return shouldLog(this.level, level);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  getLevelName(): string {
    return LOG_LEVEL_NAMES[this.level];
  }
}