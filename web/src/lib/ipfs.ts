import { PinataSDK } from 'pinata';
import { z } from 'zod';

// Article content schema
export const articleContentSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  author: z.string(),
  createdAt: z.string(),
  citations: z.array(z.number()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ArticleContent = z.infer<typeof articleContentSchema>;

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'gateway.pinata.cloud';
const FETCH_TIMEOUT = 10000;

function getPinata(): PinataSDK {
  if (!PINATA_JWT) {
    throw new Error('PINATA_JWT required');
  }
  return new PinataSDK({
    pinataJwt: PINATA_JWT,
    pinataGateway: PINATA_GATEWAY,
  });
}

export async function uploadContent(content: ArticleContent): Promise<string> {
  const validated = articleContentSchema.parse(content);
  const pinata = getPinata();

  const result = await pinata.upload.json(validated).addMetadata({
    name: `reef-article-${Date.now()}`,
  });

  return result.cid;
}

export async function fetchContent(ipfsHash: string): Promise<ArticleContent | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const url = `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`;
    const response = await fetch(url, { signal: controller.signal });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`IPFS fetch failed: ${response.status}`);
      return null;
    }

    const json = await response.json();
    const parsed = articleContentSchema.safeParse(json);

    if (!parsed.success) {
      console.error('Invalid article content:', parsed.error);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error(`IPFS fetch error for ${ipfsHash}:`, error);
    return null;
  }
}
