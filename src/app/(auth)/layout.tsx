import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

// No Sidebar/Header - these are the pages someone lands on before (or
// instead of) ever being inside the app shell (login/register/join/invite).
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user) redirect("/workspaces");

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-[440px]">{children}</div>
    </div>
  );
}
