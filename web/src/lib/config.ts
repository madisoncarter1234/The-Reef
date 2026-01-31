import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
  },
});

// Contract addresses (Base Sepolia)
export const REGISTRY_ADDRESS = '0x974309912ec808E8bdC6DFFE77013045309E18de' as const;
export const TOKEN_ADDRESS = '0x19C4bE267ab8D47eEEC8299da77D447e73F7B9C7' as const;

// API URL
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Protocol constants
export const STAKE_AMOUNT = 100n * 10n ** 18n; // 100 REEF
export const CITATION_REWARD = 10n * 10n ** 18n; // 10 REEF
export const BOOTSTRAP_ARTICLES = 100n;
