import type { Env } from './email';
import type { SessionUser } from './auth';

export type AppEnv = {
  Bindings: Env;
  Variables: { user: SessionUser | null; ip: string };
};
