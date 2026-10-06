'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type OrganisationRow = {
  name: string;
  source_count: number;
};

export default function OrganisationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<OrganisationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/organisations', { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401) {
          router.push('/admin/login');
          return;
        }
        const body = await response.json();
        if (!cancelled) {
          if (!response.ok) {
            setError(body.detail || body.error || 'Organisations could not be loaded');
            return;
          }
          setItems(body.data?.items || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Organisations could not be loaded');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="h-full overflow-y-auto p-8">
      <h1 className="text-2xl font-semibold text-[#1D1D1F]">Organisations</h1>
      <p className="mt-2 max-w-2xl text-sm text-[#86868B]">
        Names are the trimmed organisation text stored on each source. Different spellings stay separate.
      </p>
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      <table className="mt-6 w-full max-w-3xl text-sm">
        <thead>
          <tr className="border-b border-[#D2D2D7] text-left text-[#86868B]">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Sources</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.name} className="border-b border-[#F5F5F7]">
              <td className="py-2 text-[#1D1D1F]">{item.name}</td>
              <td className="py-2 text-[#1D1D1F]">{item.source_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
