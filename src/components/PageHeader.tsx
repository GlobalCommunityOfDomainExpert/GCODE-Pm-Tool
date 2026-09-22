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
        // Fixed height, width follows the logo's own aspect ratio (capped) -
        // same treatment as the card grid, so a wordmark and a square icon
        // logo both render at the same height without either getting cropped.
        <div className="flex h-10 max-w-[160px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a static asset next/image can optimize */}
          <img src={logoData} alt="" className="h-full w-full object-contain" />
        </div>
      )}
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1.5 max-w-[720px] text-text-secondary">{description}</p>}
      </div>
    </div>
  );
}
