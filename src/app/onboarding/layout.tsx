import Link from "next/link";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-akli-cream flex flex-col">
      <nav className="px-6 py-4">
        <Link href="/" className="text-2xl font-bold text-akli-green">
          akli
        </Link>
      </nav>
      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-6 pb-8">
        {children}
      </div>
    </div>
  );
}
