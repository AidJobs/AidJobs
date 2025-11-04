'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { collections } from '@/lib/collections';
import { getShortlist } from '@/lib/shortlist';
import SubmitCareerPageModal from './SubmitCareerPageModal';

export default function CollectionsNav() {
  const [isExpanded, setIsExpanded] = useState(true);
  const pathname = usePathname();
  const [savedCount, setSavedCount] = useState(0);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  
  const collectionList = Object.values(collections);
  
  useEffect(() => {
    const updateCount = () => {
      setSavedCount(getShortlist().length);
    };
    
    updateCount();
    
    window.addEventListener('storage', updateCount);
    const interval = setInterval(updateCount, 1000);
    
    return () => {
      window.removeEventListener('storage', updateCount);
      clearInterval(interval);
    };
  }, []);
  
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed left-4 top-4 z-30 p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
        aria-label="Open collections menu"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    );
  }
  
  return (
    <div className="fixed left-0 top-0 h-full w-56 bg-white border-r border-gray-200 z-30 overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Link 
            href="/"
            className="text-lg font-bold text-gray-900 hover:text-gray-700"
          >
            AidJobs
          </Link>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Collapse menu"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        
        <div className="mb-4 space-y-1">
          <Link
            href="/"
            className={`block px-3 py-2 rounded text-sm transition-colors ${
              pathname === '/'
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            All Jobs
          </Link>
          <Link
            href="/saved"
            className={`flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
              pathname === '/saved'
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>Saved</span>
            {savedCount > 0 && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                pathname === '/saved'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}>
                {savedCount}
              </span>
            )}
          </Link>
        </div>
        
        <div className="mb-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Collections
        </div>
        
        <nav className="space-y-1">
          {collectionList.map((collection) => {
            const isActive = pathname === `/collections/${collection.slug}`;
            
            return (
              <Link
                key={collection.slug}
                href={`/collections/${collection.slug}`}
                className={`block px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {collection.title}
              </Link>
            );
          })}
        </nav>
        
        <div className="mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowSubmitModal(true)}
            className="w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors text-left"
          >
            + Submit a careers page
          </button>
        </div>
      </div>
      
      <SubmitCareerPageModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
      />
    </div>
  );
}
