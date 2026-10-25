interface LogMeta {
  action: string;
  [key: string]: unknown;
}

function log(level: 'INFO' | 'WARN' | 'ERROR', meta: LogMeta): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, ...meta }));
}

export const logger = {
  info: (meta: LogMeta) => log('INFO', meta),
  warn: (meta: LogMeta) => log('WARN', meta),
  error: (meta: LogMeta) => log('ERROR', meta),
};
