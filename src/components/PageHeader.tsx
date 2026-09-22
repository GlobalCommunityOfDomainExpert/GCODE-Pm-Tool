export function PageHeader({
  title,
  description,
  logoData,
}: {
  title: string;
  description?: string | null;
  logoData?: string | null;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {logoData && (
        // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a static asset next/image can optimize
        <img src={logoData} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
      )}
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1.5 max-w-[720px] text-text-secondary">{description}</p>}
      </div>
    </div>
  );
}
