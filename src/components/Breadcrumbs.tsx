import Link from "next/link";
import type { Breadcrumb } from "@/lib/types";

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <div className="mb-6 flex items-center text-sm">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.href} className="flex items-center">
            {isLast ? (
              <span className="font-semibold text-text-primary">{item.label}</span>
            ) : (
              <Link href={item.href} className="text-text-secondary hover:text-text-primary">
                {item.label}
              </Link>
            )}
            {!isLast && (
              <svg viewBox="0 0 24 24" className="mx-2 h-3 w-3 text-text-secondary" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
              </svg>
            )}
          </span>
        );
      })}
    </div>
  );
}
