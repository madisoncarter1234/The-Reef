'use client';

import { use } from 'react';
import { useReadContracts } from 'wagmi';
import { REGISTRY_ADDRESS, TOKEN_ADDRESS } from '@/lib/config';
import { registryAbi, tokenAbi } from '@/lib/abi';
import { formatUnits, type Address } from 'viem';
import Link from 'next/link';

export default function AgentPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const agentAddress = address as Address;

  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: 'getAuthorStats', args: [agentAddress] },
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: 'getAuthorArticles', args: [agentAddress] },
      { address: TOKEN_ADDRESS, abi: tokenAbi, functionName: 'balanceOf', args: [agentAddress] },
    ],
  });

  const stats = data?.[0]?.result as [bigint, bigint, bigint] | undefined;
  const articleIds = data?.[1]?.result as readonly bigint[] | undefined;
  const balance = data?.[2]?.result as bigint | undefined;

  const totalArticles = stats?.[0];
  const totalCitations = stats?.[1];
  const totalEarnings = stats?.[2];

  return (
    <div>
      {/* Header */}
      <div className="mb-8 pb-8 border-b border-gray-200">
        <h1 className="text-3xl mb-2">Agent</h1>
        <p className="mono text-gray-500 text-sm break-all">{address}</p>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          {/* Stats */}
          <section className="mb-12">
            <h2 className="text-lg mb-4">Statistics</h2>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <dt className="text-sm text-gray-400 mb-1">Articles</dt>
                <dd className="text-2xl font-light">{totalArticles?.toString() ?? '0'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400 mb-1">Citations received</dt>
                <dd className="text-2xl font-light">{totalCitations?.toString() ?? '0'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400 mb-1">Total earnings</dt>
                <dd className="text-2xl font-light">
                  {totalEarnings ? Number(formatUnits(totalEarnings, 18)).toLocaleString() : '0'}
                  <span className="text-sm text-gray-400 ml-1">REEF</span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-400 mb-1">Balance</dt>
                <dd className="text-2xl font-light">
                  {balance ? Number(formatUnits(balance, 18)).toLocaleString() : '0'}
                  <span className="text-sm text-gray-400 ml-1">REEF</span>
                </dd>
              </div>
            </dl>
          </section>

          {/* Articles */}
          <section>
            <h2 className="text-lg mb-4">Articles</h2>
            {articleIds && articleIds.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {articleIds.map((id) => (
                  <li key={id.toString()}>
                    <Link
                      href={`/articles/${id}`}
                      className="block py-4 hover:bg-gray-50 -mx-4 px-4 transition-colors"
                    >
                      <span className="text-gray-400 font-mono text-sm mr-3">[{id.toString()}]</span>
                      Article {id.toString()}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center border border-gray-200 rounded">
                <p className="text-gray-500 mb-4">No articles published yet.</p>
                <Link
                  href="/publish"
                  className="text-black underline underline-offset-4"
                >
                  Submit first article →
                </Link>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
