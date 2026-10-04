import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <h1 className="font-display text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-ink-2">That link doesn&apos;t go anywhere.</p>
      <Link href="/" className="mt-6 font-semibold text-brand underline underline-offset-4">
        Back to GameHub
      </Link>
    </main>
  );
}
