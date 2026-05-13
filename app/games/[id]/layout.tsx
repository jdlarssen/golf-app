import { RealtimeMount } from './RealtimeMount';
import { SyncBanner } from '@/components/sync/SyncBanner';

type Params = Promise<{ id: string }>;

export default async function GameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { id } = await params;
  return (
    <>
      <RealtimeMount gameId={id} />
      <SyncBanner />
      {children}
    </>
  );
}
