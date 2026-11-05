/** Title block rendered in the layout's top bar. */
export default function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-6 text-gray-950">{title}</h1>
            {subtitle && <p className="hidden truncate text-xs text-gray-500 sm:block">{subtitle}</p>}
        </div>
    );
}
