import type { ScopeNode } from "./types";

const INDENT: Record<ScopeNode["kind"], string> = {
  workspace: "",
  initiative: " ", // one em-space per depth level below the workspace
  program: "  ",
  project: "   ",
};

// One <optgroup> per workspace (native <select> only nests one level deep),
// with initiative/program/project indented inside it by depth - lets someone
// find "the Payment Integrations project" by first finding its workspace,
// instead of scanning one flat alphabetical list of every level mixed together.
function renderOptions(nodes: ScopeNode[]): React.ReactNode[] {
  return nodes.flatMap((n) => [
    <option key={n.value} value={n.value}>
      {INDENT[n.kind]}
      {n.label}
    </option>,
    ...renderOptions(n.children),
  ]);
}

export function ScopeSelect({
  tree,
  value,
  onChange,
  className,
  id,
}: {
  tree: ScopeNode[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Whole Org</option>
      {tree.map((workspace) => (
        <optgroup key={workspace.value} label={workspace.label}>
          <option value={workspace.value}>{workspace.label} (whole workspace)</option>
          {renderOptions(workspace.children)}
        </optgroup>
      ))}
    </select>
  );
}
