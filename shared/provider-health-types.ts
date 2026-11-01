export type ProviderHealthProvider = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'fireworks';

export type ProviderHealthSnapshot = {
  provider: ProviderHealthProvider;
  state: 'closed' | 'open' | 'half-open';
  failoversLast24h: number;
};

export type ProviderFailoverEvent = {
  timestamp: string;
  caller: string;
  originalModel: string;
  actualModel: string;
  failedProvider: ProviderHealthProvider;
  failoverProvider: ProviderHealthProvider;
  reason: string;
};

export type ProviderHealthResponse = {
  providers: ProviderHealthSnapshot[];
  recentFailovers: ProviderFailoverEvent[];
  generatedAt: string;
};
