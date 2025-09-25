import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

const severityLookup: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL'
};

const logger = pino({
  level,
  base: {
    service: process.env.SERVICE_NAME ?? 'services-opportunity-tracker'
  },
  messageKey: 'message',
  formatters: {
    level(label) {
      return { severity: severityLookup[label] ?? label.toUpperCase() };
    }
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          singleLine: false
        }
      }
});

export default logger;
