export type PublicAuthMode = 'login' | 'signup';
export type SignupPlan = 'standard' | 'enterprise';

export type AuthSource =
  | 'header'
  | 'hero'
  | 'pricing_solo'
  | 'pricing_pro'
  | 'final_cta'
  | 'demo'
  | 'auth_switch'
  | 'reset_password'
  | 'direct';

export interface AuthIntent {
  mode: PublicAuthMode;
  source: AuthSource;
  plan?: SignupPlan;
}

/** Parse a public auth deep link while preserving the legacy `?auth=1` login URL. */
export function authIntentFromSearch(search: string): AuthIntent | null {
  const params = new URLSearchParams(search);
  const auth = params.get('auth');
  if (!auth) return null;

  const mode: PublicAuthMode = auth === 'signup' ? 'signup' : 'login';
  const planParam = params.get('plan');
  const plan: SignupPlan | undefined =
    mode === 'signup' && (planParam === 'standard' || planParam === 'enterprise')
      ? planParam
      : undefined;
  const sourceParam = params.get('source');
  const sources: AuthSource[] = [
    'header',
    'hero',
    'pricing_solo',
    'pricing_pro',
    'final_cta',
    'demo',
    'auth_switch',
    'reset_password',
    'direct',
  ];
  const source = sources.includes(sourceParam as AuthSource)
    ? (sourceParam as AuthSource)
    : 'direct';

  return { mode, source, ...(plan ? { plan } : {}) };
}

export function authIntentHref(intent: AuthIntent): string {
  const params = new URLSearchParams({ auth: intent.mode, source: intent.source });
  if (intent.plan) params.set('plan', intent.plan);
  return `/?${params.toString()}`;
}
