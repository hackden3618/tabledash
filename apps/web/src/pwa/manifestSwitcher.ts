import { useEffect } from "react";

/**
 * One SPA, two installable identities. The browser reads whichever
 * <link rel="manifest"> is present at the moment the user triggers install,
 * so this swaps it (and the theme-color meta, which tints the OS status bar
 * in standalone mode) whenever the route crosses the customer/kitchen line.
 *
 * Title management is intentionally NOT handled here — each page sets its
 * own document.title for SEO. Putting it here caused the hotel page title
 * ("Riverside Food Court — Order Fresh Food | Ladha") to be overwritten
 * whenever the user navigated within the customer shell.
 */
export function useManifestSwitcher(isKitchen: boolean) {
    useEffect(() => {
        const href = isKitchen ? "/manifest-kitchen.webmanifest" : "/manifest-customer.webmanifest";
        const themeColor = isKitchen ? "#9A3412" : "#0B1E13";

        let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (!link) {
            link = document.createElement("link");
            link.rel = "manifest";
            document.head.appendChild(link);
        }
        if (link.href !== new URL(href, window.location.origin).href) link.href = href;

        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) meta.content = themeColor;
    }, [isKitchen]);
}
