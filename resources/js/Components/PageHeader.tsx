/** Title block rendered in the layout's top bar. */
export default function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className="min-w-0">
            <h1 className="truncate font-display text-2xl uppercase leading-7 tracking-[0.01em] text-gray-950">{title}</h1>
            {subtitle && <p className="hidden truncate text-xs text-gray-500 sm:block">{subtitle}</p>}
        </div>
    );
}
