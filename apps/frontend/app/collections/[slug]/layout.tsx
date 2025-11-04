import { Metadata } from 'next';
import { getCollection, getAllCollectionSlugs } from '@/lib/collections';

type Props = {
  params: { slug: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const collection = getCollection(params.slug);
  
  if (!collection) {
    return {
      title: 'Collection Not Found | AidJobs',
    };
  }
  
  return {
    title: `${collection.title} | AidJobs`,
    description: collection.metaDescription || collection.description,
  };
}

export async function generateStaticParams() {
  return getAllCollectionSlugs().map((slug) => ({
    slug,
  }));
}

export default function CollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
