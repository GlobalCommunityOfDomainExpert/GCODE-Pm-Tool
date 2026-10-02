import Link from "next/link";
import type { Breadcrumb } from "@/lib/types";

// Each crumb is capped so a very long name can't push the trail off-screen;
// the full label stays available on hover (title) and on keyboard focus
// (crumbs are links, or tabIndex=0 for the current page).
const CRUMB_MAX = "max-w-[24ch]";

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex min-w-0 items-center text-sm">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.href} className="flex min-w-0 items-center">
            {isLast ? (
              <span tabIndex={0} title={item.label} aria-current="page" className={`${CRUMB_MAX} truncate font-semibold text-text-primary`}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} title={item.label} className={`${CRUMB_MAX} truncate text-text-secondary hover:text-text-primary`}>
                {item.label}
              </Link>
            )}
            {!isLast && (
              <svg viewBox="0 0 24 24" className="mx-2 h-3 w-3 shrink-0 text-text-secondary" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
              </svg>
            )}
          </span>
        );
      })}
    </nav>
  );
}
