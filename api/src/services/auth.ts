import { verifyTypedData, type Address, type Hex } from 'viem';
import * as db from '../db/index.js';
import { config } from '../config/index.js';

const domain = {
  name: config.EIP712_DOMAIN_NAME,
  version: config.EIP712_DOMAIN_VERSION,
  chainId: config.CHAIN_ID,
  verifyingContract: config.REGISTRY_ADDRESS as Address,
} as const;

const types = {
  PublishRequest: [
    { name: 'ipfsHash', type: 'string' },
    { name: 'tags', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'deadline', type: 'uint256' },
  ],
  CiteRequest: [
    { name: 'articleId', type: 'uint256' },
    { name: 'citingArticleId', type: 'uint256' },
    { name: 'nonce', type: 'string' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export type RequestType = keyof typeof types;

class AuthService {
  async verifySignature(
    requestType: RequestType,
    message: Record<string, unknown>,
    signature: Hex,
    expectedSigner: Address
  ) {
    try {
      const deadline = message.deadline as number;
      if (Date.now() > deadline * 1000) {
        return { valid: false, error: 'Request deadline expired' };
      }

      const nonce = message.nonce as string;
      if (await db.isNonceUsed(expectedSigner, nonce)) {
        return { valid: false, error: 'Nonce already used' };
      }

      const valid = await verifyTypedData({
        address: expectedSigner,
        domain,
        types: { [requestType]: types[requestType] },
        primaryType: requestType,
        message,
        signature,
      });

      if (!valid) {
        return { valid: false, error: 'Invalid signature' };
      }

      await db.markNonceUsed(
        expectedSigner,
        nonce,
        new Date(deadline * 1000 + 24 * 60 * 60 * 1000)
      );

      return { valid: true, signer: expectedSigner };
    } catch (error) {
      console.error('Signature verification error:', error);
      return { valid: false, error: 'Signature verification failed' };
    }
  }

  generateNonce(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  getDomain() {
    return domain;
  }

  getTypes(requestType: RequestType) {
    return { [requestType]: types[requestType] };
  }
}

export const authService = new AuthService();

// Cleanup job
setInterval(() => db.cleanExpiredNonces().catch(console.error), 60 * 60 * 1000);
