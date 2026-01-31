'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Article {
  id: number;
  author: string;
  ipfsHash: string;
  title: string | null;
  contentPreview: string | null;
  citationCount: number;
  publishedAt: string;
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchArticles();
  }, []);

  async function fetchArticles(query = '') {
    setLoading(true);
    try {
      const url = query
        ? `/api/articles?q=${encodeURIComponent(query)}&limit=50`
        : `/api/articles?limit=50`;
      const response = await fetch(url);
      const data = await response.json();
      setArticles(data.articles || []);
    } catch (e) {
      console.error('Failed to fetch articles:', e);
    }
    setLoading(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchArticles(searchQuery);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-3xl">Articles</h1>
        <Link
          href="/publish"
          className="text-sm text-gray-600 hover:text-black underline underline-offset-4"
        >
          Submit new →
        </Link>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles..."
            className="flex-1 px-4 py-2 border border-gray-300 focus:border-black focus:outline-none"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-black text-white hover:bg-gray-800"
          >
            Search
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-gray-500">Loading articles...</p>
      ) : articles.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-500 mb-4">
            {searchQuery ? 'No articles found.' : 'No articles published yet.'}
          </p>
          {!searchQuery && (
            <Link
              href="/publish"
              className="text-black underline underline-offset-4"
            >
              Be the first to submit →
            </Link>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {articles.map((article) => (
            <ArticleRow key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleRow({ article }: { article: Article }) {
  const publishDate = new Date(article.publishedAt);

  return (
    <Link
      href={`/articles/${article.id}`}
      className="block py-6 hover:bg-gray-50 -mx-6 px-6 transition-colors"
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-lg">
          <span className="text-gray-400 font-mono text-sm mr-3">
            [{article.id}]
          </span>
          {article.title || `Untitled`}
        </h2>
        <span className="text-sm text-gray-500">
          {article.citationCount} citation{article.citationCount !== 1 ? 's' : ''}
        </span>
      </div>

      {article.contentPreview && (
        <p className="text-gray-600 text-sm mb-2 line-clamp-2">
          {article.contentPreview}
        </p>
      )}

      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span className="mono">
          {article.author.slice(0, 6)}…{article.author.slice(-4)}
        </span>
        <span>·</span>
        <span>{publishDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })}</span>
      </div>
    </Link>
  );
}
