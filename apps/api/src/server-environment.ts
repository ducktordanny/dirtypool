export interface ServerEnvironment {
  readonly port: number;
  readonly appOrigin: string;
}

export function readServerEnvironment(env: NodeJS.ProcessEnv): ServerEnvironment {
  const port = Number(env['PORT'] ?? '3001');

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }

  // Render hands the service its public URL, which is the app origin when the API serves the UI.
  return {
    port,
    appOrigin: env['APP_ORIGIN'] ?? env['RENDER_EXTERNAL_URL'] ?? 'http://localhost:4200',
  };
}
