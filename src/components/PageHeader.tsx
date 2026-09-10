export function PageHeader({ title, description }: { title: string; description?: string | null }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="mt-1.5 max-w-[720px] text-text-secondary">{description}</p>}
    </div>
  );
}
