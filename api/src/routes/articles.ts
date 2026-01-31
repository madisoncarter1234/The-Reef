import { Router } from 'express';
import * as db from '../db/index.js';
import { blockchainService } from '../services/blockchain.js';
import { ipfsService } from '../services/ipfs.js';
import { ApiError } from '../middleware/error.js';

export const articlesRouter = Router();

// GET /articles/:id
articlesRouter.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1) throw ApiError.badRequest('Invalid article ID');

    // Try database first
    const article = await db.getArticleById(id);

    if (article) {
      const tags = await db.getArticleTags(id);
      const citationsReceived = await db.getCitationsReceived(id);
      const citationsGiven = await db.getCitationsGiven(id);

      res.json({
        ...article,
        tags,
        citedBy: citationsReceived.map((c) => c.citingArticleId),
        cites: citationsGiven.map((c) => c.articleId),
      });
      return;
    }

    // Fallback to on-chain
    const onChain = await blockchainService.getArticle(id);
    if (onChain.author === '0x0000000000000000000000000000000000000000') {
      throw ApiError.notFound('Article not found');
    }

    const citedBy = await blockchainService.getCitedBy(id);

    res.json({
      id,
      author: onChain.author,
      ipfsHash: onChain.ipfsHash,
      stakedAmount: onChain.stakedAmount.toString(),
      citationCount: Number(onChain.citationCount),
      publishedAt: new Date(Number(onChain.publishedAt) * 1000).toISOString(),
      pendingRewards: onChain.pendingRewards.toString(),
      slashed: onChain.slashed,
      stakeWithdrawn: onChain.stakeWithdrawn,
      tags: [],
      citedBy: citedBy.map(Number),
      cites: [],
    });
  } catch (error) {
    next(error);
  }
});

// GET /articles/search
articlesRouter.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q as string || '';
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const articles = await db.searchArticles(q, limit, offset);

    res.json({
      articles,
      query: q,
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
});

// POST /articles - Upload to IPFS and return publish transaction
articlesRouter.post('/', async (req, res, next) => {
  try {
    const { title, content, tags = [] } = req.body;

    if (!title || !content) {
      throw ApiError.badRequest('Title and content required');
    }

    const ipfsHash = await ipfsService.uploadContent({
      title,
      content,
      author: req.body.author || 'unknown',
      createdAt: new Date().toISOString(),
    });

    const tx = blockchainService.encodePublishArticle(ipfsHash, tags);

    res.status(201).json({
      ipfsHash,
      transaction: { to: tx.to, data: tx.data },
    });
  } catch (error) {
    next(error);
  }
});

// GET /articles/:id/citations
articlesRouter.get('/:id/citations', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw ApiError.badRequest('Invalid article ID');

    const [received, given] = await Promise.all([
      db.getCitationsReceived(id),
      db.getCitationsGiven(id),
    ]);

    res.json({ received, given });
  } catch (error) {
    next(error);
  }
});
