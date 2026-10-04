export function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <h2
        id={id}
        className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight sm:text-3xl"
      >
        {title}
      </h2>
      {lead ? <p className="mt-3 text-lg text-ink-2">{lead}</p> : null}
    </div>
  );
}
