export type ClientLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const noop = () => undefined;

const createLogger = (): ClientLogger => {
  const isProdBuild = import.meta.env.PROD;

  if (isProdBuild) {
    return {
      debug: noop,
      info: noop,
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
    };
  }

  return {
    debug: (...args) => console.debug(...args),
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  };
};

export const clientLogger = createLogger();
