export interface ServerEnvironment {
  readonly port: number;
  readonly appOrigin: string;
}

export function readServerEnvironment(env: NodeJS.ProcessEnv): ServerEnvironment {
  const port = Number(env['PORT'] ?? '3000');

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }

  return { port, appOrigin: env['APP_ORIGIN'] ?? 'http://localhost:4200' };
}
