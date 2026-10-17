import { LoginForm } from "@/components/auth/LoginForm"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const { callbackUrl } = await searchParams
  const azureAdEnabled = !!process.env.AZURE_AD_CLIENT_ID

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Newsroom</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>
        </div>
        <LoginForm
          azureAdEnabled={azureAdEnabled}
          callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined}
        />
      </div>
    </div>
  )
}
