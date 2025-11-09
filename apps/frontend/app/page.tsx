import { Suspense } from 'react';
import HomeClient from './HomeClient';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 pl-56 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <HomeClient />
    </Suspense>
  );
}

