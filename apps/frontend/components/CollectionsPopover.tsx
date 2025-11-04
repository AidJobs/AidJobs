'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@aidjobs/ui';
import { 
  Building2, 
  Globe, 
  Briefcase, 
  GraduationCap, 
  HeartHandshake 
} from 'lucide-react';

const collections = [
  { slug: 'un-jobs', title: 'UN Jobs', icon: Building2 },
  { slug: 'remote', title: 'Remote', icon: Globe },
  { slug: 'consultancies', title: 'Consultancies', icon: Briefcase },
  { slug: 'fellowships', title: 'Fellowships', icon: GraduationCap },
  { slug: 'surge', title: 'Surge & Emergency', icon: HeartHandshake },
];

export default function CollectionsPopover() {
  const params = useParams();
  const currentSlug = params?.slug as string;

  return (
    <div className="bg-surface rounded-lg border border-border p-3">
      <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-2">COLLECTIONS</h3>
      <div className="space-y-1">
        {collections.map(({ slug, title, icon: Icon }) => (
          <Link key={slug} href={`/collections/${slug}`}>
            <Button
              variant={currentSlug === slug ? 'default' : 'ghost'}
              size="sm"
              className="w-full justify-start gap-2"
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm">{title}</span>
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}
