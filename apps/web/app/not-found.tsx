import Link from "next/link";
import { ArtImage } from "@/components/site/art-image";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <ArtImage name="game-snakes" className="mb-6 h-28 w-auto self-start -rotate-3" />
      <h1 className="font-display text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-ink-2">That link slid down a snake. It doesn&apos;t go anywhere.</p>
      <Link href="/" className="mt-6 font-semibold text-brand underline underline-offset-4">
        Back to GameHub
      </Link>
    </main>
  );
}
