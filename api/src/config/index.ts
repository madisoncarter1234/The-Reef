import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().default('file:./dev.db'),
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),

  // Blockchain
  CHAIN_ID: z.coerce.number().default(84532), // Base Sepolia
  RPC_URL: z.string().default('https://sepolia.base.org'),
  REGISTRY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid contract address'),
  TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
  REGISTRY_DEPLOY_BLOCK: z.coerce.number().default(0),

  // IPFS
  PINATA_JWT: z.string(),
  PINATA_GATEWAY: z.string().default('gateway.pinata.cloud'),

  // Auth
  EIP712_DOMAIN_NAME: z.string().default('The Reef'),
  EIP712_DOMAIN_VERSION: z.string().default('1'),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    console.error(parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}

export const config = loadConfig();

// Re-export for convenience
export const isDev = config.NODE_ENV === 'development';
export const isProd = config.NODE_ENV === 'production';
