export const SEO_DEFAULT_ROBOTS = "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
export const SEO_NOINDEX = "noindex, nofollow";

const ABSOLUTE_IMAGE = "https://ladha.co.ke/ladha_icon_customer.png";

interface HeadMeta { [selector: string]: string; }

function setMeta(selector: string, content: string) {
    let el = document.querySelector<HTMLMetaElement>(selector);
    if (!el) {
        const tag = selector.startsWith("meta[property=") ? "property" : "name";
        const key = selector.match(/\[(name|property)="([^"]+)"\]/)?.[2];
        if (!key) return;
        el = document.createElement("meta");
        el.setAttribute(tag, key);
        document.head.appendChild(el);
    }
    el.content = content;
}

function setJsonLd(data: object | object[] | null | undefined) {
    const existing = document.getElementById("ladha-jsonld");
    if (data === null || data === undefined) {
        existing?.remove();
        return;
    }
    let script = existing as HTMLScriptElement | null;
    if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = "ladha-jsonld";
        document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
}

/**
 * Writes the current route's SEO state into <head>: title, description, canonical,
 * OG/Twitter cards, robots, and JSON-LD. Used both at the page level (hotel menus)
 * and at the route level (private pages get noindex). index.html ships the static
 * defaults; this only overrides them for the page actually in view.
 */
export function applySeo(opts: {
    title: string;
    description?: string;
    canonical?: string;
    image?: string;
    robots?: string;
    jsonLd?: object | object[] | null;
}) {
    document.title = opts.title;
    const canonical = opts.canonical ?? `${window.location.origin}${window.location.pathname}`;
    const canonicalEl = document.getElementById("ladha-canonical") as HTMLLinkElement | null;
    if (canonicalEl) canonicalEl.href = canonical;

    const description = opts.description ?? "";

    const meta: HeadMeta = {
        'meta[name="description"]': description,
        'meta[property="og:title"]': opts.title,
        'meta[property="og:description"]': description,
        'meta[property="og:url"]': canonical,
        'meta[name="twitter:title"]': opts.title,
        'meta[name="twitter:description"]': description,
        'meta[name="robots"]': opts.robots ?? SEO_DEFAULT_ROBOTS,
    };
    const imageUrl = opts.image ? new URL(opts.image, window.location.origin).href : ABSOLUTE_IMAGE;
    meta['meta[property="og:image"]'] = imageUrl;
    meta['meta[name="twitter:image"]'] = imageUrl;

    for (const [selector, content] of Object.entries(meta)) {
        setMeta(selector, content);
    }

    setJsonLd(opts.jsonLd ?? null);
}