export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  SILENT = 6,
}

export interface LoggerConfig {
  packageName?: string;
  level?: LogLevel;
  enableColors?: boolean;
  enableTimestamp?: boolean;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  packageName: string;
  moduleName?: string;
  message: string;
  data?: any[];
}

export interface LoggerInstance {
  trace: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  fatal: (...args: any[]) => void;
  module: (moduleName: string) => LoggerInstance;
  withData: (...data: any[]) => LoggerInstance;
  isEnabled: (level: LogLevel) => boolean;
}