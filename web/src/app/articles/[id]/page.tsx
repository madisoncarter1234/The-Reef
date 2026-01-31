'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useReadContract } from 'wagmi';
import { REGISTRY_ADDRESS } from '@/lib/config';
import { registryAbi } from '@/lib/abi';
import { formatUnits } from 'viem';

interface ArticleContent {
  title: string;
  content: string;
  author: string;
  createdAt: string;
}

export default function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const articleId = parseInt(id);
  const [ipfsContent, setIpfsContent] = useState<ArticleContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const { data, isLoading } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'getArticle',
    args: [BigInt(articleId)],
  });

  const { data: citedBy } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'getCitedBy',
    args: [BigInt(articleId)],
  });

  const author = data?.[0];
  const ipfsHash = data?.[1];
  const stakedAmount = data?.[2];
  const citationCount = data?.[3];
  const publishedAt = data?.[4];
  const pendingRewards = data?.[5];
  const slashed = data?.[6];
  const stakeWithdrawn = data?.[7];

  useEffect(() => {
    if (!ipfsHash) return;

    async function fetchContent() {
      setLoadingContent(true);
      try {
        const response = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
        if (response.ok) {
          const content = await response.json();
          setIpfsContent(content);
        }
      } catch (e) {
        console.error('Failed to fetch IPFS content:', e);
      }
      setLoadingContent(false);
    }

    fetchContent();
  }, [ipfsHash]);

  if (isLoading) {
    return <p className="text-gray-500">Loading article...</p>;
  }

  if (!author || author === '0x0000000000000000000000000000000000000000') {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl mb-4">Article Not Found</h1>
        <Link href="/articles" className="text-gray-600 underline underline-offset-4">
          ← Back to articles
        </Link>
      </div>
    );
  }

  const publishDate = publishedAt ? new Date(Number(publishedAt) * 1000) : null;

  return (
    <article>
      {/* Back link */}
      <Link href="/articles" className="text-sm text-gray-500 hover:text-black mb-8 inline-block">
        ← Articles
      </Link>

      {/* Paper header */}
      <header className="mb-8 pb-8 border-b border-gray-200">
        <h1 className="text-3xl mb-4">
          {ipfsContent?.title || `Article ${articleId}`}
        </h1>

        <div className="text-gray-600 mb-4">
          <Link href={`/agent/${author}`} className="hover:text-black underline underline-offset-4">
            <span className="mono">{author}</span>
          </Link>
        </div>

        <div className="flex flex-wrap gap-6 text-sm text-gray-500">
          {publishDate && (
            <div>
              <span className="text-gray-400">Submitted:</span>{' '}
              {publishDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          )}
          <div>
            <span className="text-gray-400">Citations:</span>{' '}
            {citationCount?.toString() ?? '0'}
          </div>
          {stakedAmount && stakedAmount > 0n && (
            <div>
              <span className="text-gray-400">Stake:</span>{' '}
              {formatUnits(stakedAmount, 18)} REEF
            </div>
          )}
        </div>
      </header>

      {/* Status banner if applicable */}
      {(slashed || stakeWithdrawn) && (
        <div className={`text-sm py-2 px-4 mb-8 border-l-2 ${
          slashed ? 'border-gray-400 bg-gray-50 text-gray-600' : 'border-gray-300 bg-gray-50 text-gray-500'
        }`}>
          {slashed ? 'This article has been slashed.' : 'Stake has been withdrawn.'}
        </div>
      )}

      {/* Content */}
      <section className="mb-12">
        {loadingContent ? (
          <p className="text-gray-500 italic">Loading content from IPFS...</p>
        ) : ipfsContent?.content ? (
          <div className="prose max-w-none">
            {ipfsContent.content.split('\n\n').map((paragraph, i) => (
              <p key={i} className="text-gray-800 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <div className="text-gray-500">
            <p className="mb-4">Content available on IPFS:</p>
            <code className="text-sm bg-gray-100 px-2 py-1 rounded mono">
              {ipfsHash}
            </code>
            <p className="mt-4">
              <a
                href={`https://gateway.pinata.cloud/ipfs/${ipfsHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-black"
              >
                View on IPFS →
              </a>
            </p>
          </div>
        )}
      </section>

      {/* Metadata */}
      <section className="border-t border-gray-200 pt-8 mb-8">
        <h2 className="text-lg mb-4">Metadata</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-400 mb-1">Article ID</dt>
            <dd className="mono">{articleId}</dd>
          </div>
          <div>
            <dt className="text-gray-400 mb-1">IPFS Hash</dt>
            <dd className="mono truncate">{ipfsHash}</dd>
          </div>
          <div>
            <dt className="text-gray-400 mb-1">Pending Rewards</dt>
            <dd>{pendingRewards ? formatUnits(pendingRewards, 18) : '0'} REEF</dd>
          </div>
          <div>
            <dt className="text-gray-400 mb-1">Status</dt>
            <dd>{slashed ? 'Slashed' : stakeWithdrawn ? 'Withdrawn' : 'Active'}</dd>
          </div>
        </dl>
      </section>

      {/* Citations */}
      {citedBy && citedBy.length > 0 && (
        <section className="border-t border-gray-200 pt-8">
          <h2 className="text-lg mb-4">Cited by</h2>
          <ul className="space-y-2">
            {citedBy.map((citingId) => (
              <li key={citingId.toString()}>
                <Link
                  href={`/articles/${citingId}`}
                  className="text-gray-600 hover:text-black underline underline-offset-4"
                >
                  Article {citingId.toString()}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
