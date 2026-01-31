'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { REGISTRY_ADDRESS, TOKEN_ADDRESS, STAKE_AMOUNT } from '@/lib/config';
import { registryAbi, tokenAbi } from '@/lib/abi';
import { formatUnits } from 'viem';
import Link from 'next/link';

export default function PublishPage() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();

  useEffect(() => {
    setMounted(true);
  }, []);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [ipfsHash, setIpfsHash] = useState('');
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'write' | 'approve' | 'publish' | 'done'>('write');

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, error: txError } = useWaitForTransactionReceipt({ hash: txHash });

  // Log errors to console
  if (writeError) console.error('Write error:', writeError);
  if (txError) console.error('Tx error:', txError);

  const { data: contractData } = useReadContracts({
    contracts: [
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: 'articleCount' },
      { address: REGISTRY_ADDRESS, abi: registryAbi, functionName: 'BOOTSTRAP_ARTICLES' },
      { address: TOKEN_ADDRESS, abi: tokenAbi, functionName: 'balanceOf', args: address ? [address] : undefined },
      { address: TOKEN_ADDRESS, abi: tokenAbi, functionName: 'allowance', args: address ? [address, REGISTRY_ADDRESS] : undefined },
    ],
  });

  const articleCount = contractData?.[0]?.result as bigint | undefined;
  const bootstrapArticles = contractData?.[1]?.result as bigint | undefined;
  const balance = contractData?.[2]?.result as bigint | undefined;
  const allowance = contractData?.[3]?.result as bigint | undefined;

  const needsStake = articleCount !== undefined && bootstrapArticles !== undefined && articleCount >= bootstrapArticles;
  const needsApproval = needsStake && (allowance === undefined || allowance < STAKE_AMOUNT);
  const hasEnoughBalance = !needsStake || (balance !== undefined && balance >= STAKE_AMOUNT);

  async function uploadToIpfs() {
    setUploading(true);
    try {
      const articleContent = {
        title,
        content,
        author: address,
        createdAt: new Date().toISOString(),
      };

      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`,
        },
        body: JSON.stringify({
          pinataContent: articleContent,
          pinataMetadata: { name: `reef-article-${Date.now()}` },
        }),
      });

      const result = await response.json();
      setIpfsHash(result.IpfsHash);
      setStep(needsApproval ? 'approve' : 'publish');
    } catch (error) {
      console.error('IPFS upload failed:', error);
      alert('Failed to upload to IPFS');
    }
    setUploading(false);
  }

  function approveTokens() {
    writeContract({
      address: TOKEN_ADDRESS,
      abi: tokenAbi,
      functionName: 'approve',
      args: [REGISTRY_ADDRESS, STAKE_AMOUNT],
    });
  }

  function publishArticle() {
    const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean);
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'publishArticle',
      args: [ipfsHash, tagArray],
    });
  }

  if (isSuccess && step === 'approve') {
    setStep('publish');
  }
  if (isSuccess && step === 'publish') {
    setStep('done');
  }

  if (!mounted) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl mb-4">Submit Article</h1>
        <p className="text-gray-500">Connect your wallet to submit an article.</p>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl mb-4">Article Submitted</h1>
        <p className="text-gray-600 mb-6">Your article has been published to The Reef.</p>
        <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-8 mono text-sm">
          ipfs://{ipfsHash}
        </div>
        <div className="flex gap-6 justify-center">
          <Link
            href="/articles"
            className="text-black underline underline-offset-4"
          >
            View articles →
          </Link>
          <button
            onClick={() => {
              setStep('write');
              setTitle('');
              setContent('');
              setTags('');
              setIpfsHash('');
            }}
            className="text-gray-600 underline underline-offset-4 hover:text-black"
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl mb-2">Submit Article</h1>
      <p className="text-gray-500 mb-8">
        Contribute knowledge to the decentralized repository.
      </p>

      {/* Status */}
      {needsStake ? (
        <div className="text-sm py-3 px-4 mb-8 border-l-2 border-gray-300 bg-gray-50">
          Submission requires staking <strong>100 REEF</strong>.
          {!hasEnoughBalance && (
            <span className="text-gray-500 ml-2">
              (Balance: {balance ? formatUnits(balance, 18) : '0'} REEF)
            </span>
          )}
        </div>
      ) : (
        <div className="text-sm py-3 px-4 mb-8 border-l-2 border-gray-400 bg-gray-50">
          Bootstrap period — no stake required.
        </div>
      )}

      {step === 'write' && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm text-gray-600 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Article title"
              className="w-full px-4 py-3 border border-gray-200 rounded focus:outline-none focus:border-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your article..."
              rows={16}
              className="w-full px-4 py-3 border border-gray-200 rounded focus:outline-none focus:border-gray-400 resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">Tags (comma separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="machine-learning, economics, game-theory"
              className="w-full px-4 py-3 border border-gray-200 rounded focus:outline-none focus:border-gray-400"
            />
          </div>

          <button
            onClick={uploadToIpfs}
            disabled={!title || !content || uploading || (needsStake && !hasEnoughBalance)}
            className="px-6 py-3 bg-black text-white rounded hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            {uploading ? 'Uploading to IPFS...' : 'Continue'}
          </button>
        </div>
      )}

      {step === 'approve' && (
        <div className="border border-gray-200 rounded p-8">
          <h2 className="text-xl mb-2">Step 1: Approve REEF</h2>
          <p className="text-gray-600 mb-6">
            Allow the registry to stake 100 REEF on your behalf.
          </p>
          <button
            onClick={approveTokens}
            disabled={isPending || isConfirming}
            className="px-6 py-3 bg-black text-white rounded hover:bg-gray-800 disabled:bg-gray-300 transition"
          >
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Approve 100 REEF'}
          </button>
        </div>
      )}

      {step === 'publish' && (
        <div className="border border-gray-200 rounded p-8">
          <h2 className="text-xl mb-2">
            {needsStake ? 'Step 2: Publish' : 'Publish Article'}
          </h2>
          <p className="text-gray-600 mb-4">
            Register your article on-chain.
          </p>
          <div className="text-sm text-gray-400 mono mb-6">
            ipfs://{ipfsHash}
          </div>
          {(writeError || txError) && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3 mb-4">
              {writeError?.message || txError?.message || 'Transaction failed'}
            </div>
          )}
          {txHash && (
            <div className="text-sm text-gray-500 mb-4">
              tx: <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="mono underline">{txHash.slice(0, 10)}...</a>
            </div>
          )}
          <button
            onClick={publishArticle}
            disabled={isPending || isConfirming}
            className="px-6 py-3 bg-black text-white rounded hover:bg-gray-800 disabled:bg-gray-300 transition"
          >
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      )}
    </div>
  );
}
