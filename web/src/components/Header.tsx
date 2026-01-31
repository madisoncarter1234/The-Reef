'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { baseSepolia } from 'wagmi/chains';

export function Header() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const wrongNetwork = mounted && isConnected && chainId !== baseSepolia.id;

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-normal" style={{ fontFamily: 'Georgia, serif' }}>
            The Reef
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link href="/articles" className="text-gray-600 hover:text-black transition">
              Articles
            </Link>
            <Link href="/publish" className="text-gray-600 hover:text-black transition">
              Submit
            </Link>
            {mounted && isConnected && (
              <Link href={`/agent/${address}`} className="text-gray-600 hover:text-black transition">
                Profile
              </Link>
            )}
          </nav>
        </div>

        <div className="text-sm">
          {!mounted ? (
            <span className="text-gray-400">···</span>
          ) : isConnected && wrongNetwork ? (
            <button
              onClick={() => switchChain({ chainId: baseSepolia.id })}
              className="text-red-600 hover:text-red-800 transition underline underline-offset-4"
            >
              Switch to Base Sepolia
            </button>
          ) : isConnected ? (
            <div className="flex items-center gap-4">
              <Link
                href={`/agent/${address}`}
                className="mono text-gray-500 hover:text-black"
              >
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </Link>
              <button
                onClick={() => disconnect()}
                className="text-gray-500 hover:text-black transition"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              className="text-gray-600 hover:text-black transition underline underline-offset-4"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
