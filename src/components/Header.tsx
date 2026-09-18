import { UserMenu } from "./UserMenu";

export function Header({
  userName,
  orgName,
  roles,
  scopeLabel,
}: {
  userName: string;
  orgName: string;
  roles: string[];
  scopeLabel: string | null;
}) {
  const initials =
    userName
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <header className="flex h-header shrink-0 items-center border-b border-border bg-surface px-6">
      <div className="flex w-full items-center justify-between gap-6">
    

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <div className="min-w-0 text-right">
            <div className="truncate text-[13px] font-semibold text-text-primary">
              {userName}
              <span className="mx-1.5 text-text-secondary">&middot;</span>
              <span className="font-medium text-text-secondary">{orgName}</span>
            </div>
            <div className="truncate text-[11px] text-text-secondary">
              {roles.join(", ") || "No role"}
              <span className="mx-1">&middot;</span>
              {scopeLabel || "Whole Org"}
            </div>
          </div>
          <UserMenu name={userName} initials={initials} />
        </div>
      </div>
    </header>
  );
}
