// Tørny skeleton primitives
// Drop into components/ui/skeleton.tsx
// Tailwind classes shown; ports to plain CSS via the tokens in this folder.

import * as React from "react";

const base = "bg-[#ECE5D2] rounded-md animate-[shimmer_1.8s_ease-in-out_infinite] bg-[linear-gradient(100deg,#ECE5D2_0%,#F3EDDD_50%,#ECE5D2_100%)] bg-[length:220%_100%] bg-[position:100%_0]";

/* Add to globals.css (or tailwind keyframes config):

@keyframes shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -120% 0; }
}

*/

export function Skeleton({
  className = "",
  delay = 0,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  return (
    <div
      {...rest}
      className={`${base} ${className}`}
      style={{ animationDelay: `${delay}ms`, ...(rest.style ?? {}) }}
    />
  );
}

export const SkeletonCircle = (props: React.ComponentProps<typeof Skeleton>) => (
  <Skeleton {...props} className={`rounded-full ${props.className ?? ""}`} />
);

export const SkeletonPill = (props: React.ComponentProps<typeof Skeleton>) => (
  <Skeleton {...props} className={`rounded-full ${props.className ?? ""}`} />
);

/* ────────────────────────────────────────────────────────────
   Composed skeletons — these mirror the real screens 1:1
   ──────────────────────────────────────────────────────────── */

export function HomeSkeleton() {
  return (
    <div className="px-0 pt-2">
      {/* Header */}
      <div className="px-[18px] pb-[14px] flex items-center gap-2.5">
        <span className="text-[10px] font-semibold tracking-[0.20em] uppercase text-[#5C5347]">Tørny</span>
        <div className="flex-1" />
        <SkeletonCircle className="w-[30px] h-[30px]" />
      </div>

      {/* Greeting */}
      <div className="px-[18px] pb-[18px]">
        <Skeleton className="w-[86px] h-2.5 mb-3.5" />
        <Skeleton className="w-[200px] h-[26px] mb-2 rounded-[7px]" />
        <Skeleton className="w-[130px] h-[13px]" />
      </div>

      {/* Brass ribbon */}
      <BrassSkeleton kickerWidth={80} />

      {/* Active-games cards */}
      <div className="px-[14px] flex flex-col gap-3">
        <ActiveGameSkeleton delay={0} />
        <ActiveGameSkeleton delay={90} />
      </div>

      {/* Admin grid */}
      <div className="px-[14px] mt-[18px] grid grid-cols-2 gap-2.5">
        <AdminTileSkeleton delay={180} />
        <AdminTileSkeleton delay={270} />
      </div>
    </div>
  );
}

function BrassSkeleton({ kickerWidth = 80 }: { kickerWidth?: number }) {
  return (
    <div className="mx-[18px] mb-[14px] flex items-center gap-3.5">
      <div className="flex-1 relative h-1.5">
        <div className="absolute inset-x-0 top-[1px] h-px bg-[#D3C9A6] opacity-60" />
        <div className="absolute inset-x-0 top-[5px] h-px bg-[#E5E0D3] opacity-60" />
      </div>
      <Skeleton style={{ width: kickerWidth, height: 11 }} />
      <div className="flex-1 relative h-1.5">
        <div className="absolute inset-x-0 top-[1px] h-px bg-[#D3C9A6] opacity-60" />
        <div className="absolute inset-x-0 top-[5px] h-px bg-[#E5E0D3] opacity-60" />
      </div>
    </div>
  );
}

function ActiveGameSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="bg-white border border-[#E5E0D3] rounded-2xl p-[18px_18px_20px] flex flex-col gap-3 shadow-[0_1px_2px_rgba(26,46,31,0.04),0_2px_8px_rgba(26,46,31,0.04)]">
      <div className="flex items-center gap-3">
        <Skeleton delay={delay} className="w-[38px] h-[38px] rounded-[10px]" />
        <div className="flex-1 flex flex-col gap-[7px]">
          <Skeleton delay={delay} className="w-3/5 h-4 rounded-[5px]" />
          <Skeleton delay={delay} className="w-2/5 h-[11px]" />
        </div>
        <Skeleton delay={delay} className="w-3.5 h-3.5 rounded" />
      </div>
      <div className="flex items-center gap-2.5 pt-2.5 border-t border-[#EDE6D2]">
        <Skeleton delay={delay} className="w-[70px] h-2.5" />
        <Skeleton delay={delay} className="w-[50px] h-2.5" />
        <Skeleton delay={delay} className="ml-auto w-[64px] h-[22px] rounded-full" />
      </div>
    </div>
  );
}

function AdminTileSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="bg-white border border-[#E5E0D3] rounded-[14px] p-3.5 h-[92px] flex flex-col justify-between">
      <Skeleton delay={delay} className="w-8 h-8 rounded-[9px]" />
      <Skeleton delay={delay} className="w-[70%] h-[13px] rounded-[5px]" />
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="px-0 pt-2">
      {/* Header */}
      <div className="px-[18px] pb-[14px] flex items-center gap-2.5">
        <span className="text-lg text-[#5C5347]">‹</span>
        <span className="text-[10px] font-semibold tracking-[0.20em] uppercase text-[#5C5347]">Leaderboard</span>
        <div className="flex-1" />
        <SkeletonCircle className="w-6 h-6" />
      </div>

      {/* Title */}
      <div className="px-[18px] pb-3.5">
        <Skeleton className="w-[100px] h-2.5 mb-3.5" />
        <Skeleton className="w-[180px] h-6 rounded-md mb-2.5" />
        <Skeleton className="w-[140px] h-3" />
      </div>

      {/* 1st-place podium */}
      <div className="mx-3.5 mb-3.5 relative bg-white border border-[#E5E0D3] rounded-[20px] p-[24px_22px_22px] shadow-[0_2px_8px_rgba(26,46,31,0.06)] overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-[linear-gradient(90deg,transparent_0%,rgba(201,169,97,0.35)_40%,rgba(201,169,97,0.35)_60%,transparent_100%)]" />
        <div className="flex items-center gap-[18px] mb-[18px]">
          <Skeleton className="w-14 h-14 rounded-[14px]" />
          <div className="flex-1 flex flex-col gap-2.5">
            <Skeleton className="w-[70%] h-[19px] rounded-md" />
            <Skeleton className="w-1/2 h-3" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="w-[60px] h-[26px] rounded-md" />
            <Skeleton className="w-10 h-[11px]" />
          </div>
        </div>
        <div className="flex items-center gap-2.5 pt-3.5 border-t border-[#EDE6D2]">
          <Skeleton className="w-[90px] h-[11px]" />
          <Skeleton className="ml-auto w-[60px] h-[22px] rounded-full" />
        </div>
      </div>

      {/* 2nd/3rd/4th rows */}
      {[90, 180, 270].map((delay, i) => (
        <div key={i} className="mx-3.5 mb-2.5 bg-white border border-[#E5E0D3] rounded-[14px] p-[14px_16px] flex items-center gap-3.5">
          <Skeleton delay={delay} className="w-[22px] h-[18px]" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton delay={delay} className="w-[70%] h-[15px] rounded-[5px]" />
            <Skeleton delay={delay} className="w-[45%] h-2.5" />
          </div>
          <Skeleton delay={delay} className="w-[50px] h-[22px] rounded-md" />
          <Skeleton delay={delay} className="w-[38px] h-[11px]" />
        </div>
      ))}
    </div>
  );
}
