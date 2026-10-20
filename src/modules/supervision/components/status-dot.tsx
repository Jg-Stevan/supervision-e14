import { cn } from "cn";

/** Status dot "live": círculo 8px verde (kit §2.3). */
export function StatusDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full bg-(--success)",
        className
      )}
    />
  );
}
