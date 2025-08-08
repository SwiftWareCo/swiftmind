// Callback lives outside the tenant-gated (app) group
import { redirect } from "next/navigation";
import { handleGoogleCallbackAction } from "@/server/integrations/google.actions";
import Link from "next/link";

export default async function GoogleCallbackPage({ searchParams }: { searchParams: Promise<{ code?: string; state?: string; error?: string }> }) {
  const { code, state, error } = await searchParams;
  if (error) {
    return (
      <ErrorView message="Authorization was cancelled or denied." />
    );
  }

  const res = await handleGoogleCallbackAction({ code, state });
  if (res.ok && res.redirectTo) {
    redirect(res.redirectTo);
  }

  return (
    <ErrorView message={res.error || "Something went wrong completing Google connect."} />
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-xl font-semibold mb-2">Google connection error</h1>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Link className="underline text-blue-600" href="/connections">Back to Connections</Link>
    </div>
  );
}


