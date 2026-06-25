// Tastet die Pfade einer SVG-Datei in gleichmäßigen Schritten ab und liefert
// pro <path>-Element einen Strich (Punktliste). Genutzt wird die native
// Browser-Geometrie (getPointAtLength), daher nur im DOM verfügbar.
//
// Hinweis: Die Rune-SVGs sind gefüllte Umrisse (kein Stroke). Wir samplen die
// Kontur – für den $P-Point-Cloud-Vergleich ist das bei den dünnen Glyphen
// brauchbar, weil Außen-/Innenkante nahe an der Mittellinie liegen. Sehr dicke
// oder flächige Glyphen werden dadurch ungenauer.

const SVG_NS = 'http://www.w3.org/2000/svg';

export type SamplePoint = {
    x: number;
    y: number;
};

type SampleOptions = {
    spacing?: number; // Ziel-Abstand zwischen Punkten in SVG-Einheiten
    maxPerPath?: number;
    minPerPath?: number;
};

export function sampleSvgStrokes(
    svgText: string,
    options: SampleOptions = {}
): SamplePoint[][] {
    const {spacing = 1, maxPerPath = 400, minPerPath = 8} = options;

    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const pathElements = Array.from(doc.querySelectorAll('path'));
    if (!pathElements.length) return [];

    // Verstecktes Mess-SVG im Dokument: getTotalLength/getPointAtLength brauchen
    // ein gerendertes Element.
    const host = document.createElementNS(SVG_NS, 'svg');
    host.setAttribute('width', '0');
    host.setAttribute('height', '0');
    host.style.position = 'absolute';
    host.style.left = '-9999px';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);

    const strokes: SamplePoint[][] = [];

    try {
        for (const element of pathElements) {
            const d = element.getAttribute('d');
            if (!d) continue;

            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', d);
            host.appendChild(path);

            const length = path.getTotalLength();
            if (length > 0) {
                const count = Math.min(
                    maxPerPath,
                    Math.max(minPerPath, Math.round(length / spacing))
                );
                const stroke: SamplePoint[] = [];
                for (let k = 0; k < count; k += 1) {
                    const at = (k / (count - 1)) * length;
                    const point = path.getPointAtLength(at);
                    stroke.push({x: point.x, y: point.y});
                }
                strokes.push(stroke);
            }

            host.removeChild(path);
        }
    } finally {
        document.body.removeChild(host);
    }

    return strokes;
}

export async function sampleSvgFromUrl(
    url: string,
    options?: SampleOptions
): Promise<SamplePoint[][]> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`SVG konnte nicht geladen werden: ${url} (${response.status})`);
    }
    const svgText = await response.text();
    return sampleSvgStrokes(svgText, options);
}
