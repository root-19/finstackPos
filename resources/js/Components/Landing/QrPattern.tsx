/** A deterministic, QR-looking pattern (not a scannable code). */
export default function QrPattern() {
    const size = 21;
    const cells: [number, number][] = [];
    const finder = (x: number, y: number) =>
        [[0, 0], [14, 0], [0, 14]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!finder(x, y) && (x * 7 + y * 13 + x * y) % 5 < 2) {
                cells.push([x, y]);
            }
        }
    }

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" shapeRendering="crispEdges" aria-hidden>
            {[[0, 0], [14, 0], [0, 14]].map(([x, y]) => (
                <g key={`${x}-${y}`}>
                    <rect x={x} y={y} width={7} height={7} fill="#111" />
                    <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
                    <rect x={x + 2} y={y + 2} width={3} height={3} fill="#111" />
                </g>
            ))}
            {cells.map(([x, y]) => (
                <rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill="#111" />
            ))}
        </svg>
    );
}
