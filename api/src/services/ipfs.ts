import { PinataSDK } from 'pinata';
import { config } from '../config/index.js';
import { articleContentSchema, type ArticleContent } from '../types/index.js';

const pinata = new PinataSDK({
  pinataJwt: config.PINATA_JWT,
  pinataGateway: config.PINATA_GATEWAY,
});

const FETCH_TIMEOUT = 10000; // 10 seconds

class IpfsService {
  /**
   * Upload article content to IPFS via Pinata
   * @returns The IPFS CID (content identifier)
   */
  async uploadContent(content: ArticleContent): Promise<string> {
    // Validate content structure
    const validated = articleContentSchema.parse(content);

    const result = await pinata.upload.json(validated).addMetadata({
      name: `reef-article-${Date.now()}`,
    });

    return result.cid;
  }

  /**
   * Fetch and parse article content from IPFS
   * @returns Parsed article content or null if fetch fails
   */
  async fetchContent(ipfsHash: string): Promise<ArticleContent | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const url = `https://${config.PINATA_GATEWAY}/ipfs/${ipfsHash}`;
      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`IPFS fetch failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const json = await response.json();

      // Validate the content structure
      const parsed = articleContentSchema.safeParse(json);
      if (!parsed.success) {
        console.error('Invalid article content structure:', parsed.error);
        return null;
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`IPFS fetch timeout for ${ipfsHash}`);
      } else {
        console.error(`IPFS fetch error for ${ipfsHash}:`, error);
      }
      return null;
    }
  }

  /**
   * Check if content exists on IPFS (HEAD request)
   */
  async contentExists(ipfsHash: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const url = `https://${config.PINATA_GATEWAY}/ipfs/${ipfsHash}`;
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Unpin content from Pinata (for cleanup/moderation)
   */
  async unpinContent(ipfsHash: string): Promise<boolean> {
    try {
      await pinata.files.delete([ipfsHash]);
      return true;
    } catch (error) {
      console.error(`Failed to unpin ${ipfsHash}:`, error);
      return false;
    }
  }

  /**
   * Get pinned files list (for admin/debugging)
   */
  async listPinnedFiles(limit = 100) {
    return pinata.files.list().limit(limit);
  }
}

export const ipfsService = new IpfsService();
