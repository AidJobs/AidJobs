import { Metadata } from 'next';
import { getCollection, getAllCollectionSlugs } from '@/lib/collections';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
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
