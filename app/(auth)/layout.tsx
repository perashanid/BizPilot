export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 text-center">
        <span className="font-display text-2xl font-semibold text-primary">BizPilot</span>
      </div>
      <div className="w-full max-w-md space-y-4">{children}</div>
    </div>
  );
}
