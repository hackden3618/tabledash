import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

function isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

interface InstallBannerProps {
    scope: "customer" | "admin";
}

/**
 * Deliberately NOT persisted anywhere (no localStorage/sessionStorage key).
 * Dismiss hides it for the rest of this page load only — a reload brings it
 * back. That's a product choice, not an oversight: kitchens running this on
 * a shared counter tablet shouldn't have one staff member's dismissal
 * permanently hide it from the next shift.
 */
export function InstallBanner({ scope }: InstallBannerProps) {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [showIosTip, setShowIosTip] = useState(false);

    useEffect(() => {
        if (isStandalone()) return;

        const handler = (event: Event) => {
            event.preventDefault();
            setDeferredPrompt(event as BeforeInstallPromptEvent);
        };
        const installedHandler = () => {
            setDismissed(true);
        };

        window.addEventListener("beforeinstallprompt", handler);
        window.addEventListener("appinstalled", installedHandler);

        if (isIOS()) setShowIosTip(true);

        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
            window.removeEventListener("appinstalled", installedHandler);
        };
    }, []);

    if (dismissed || isStandalone() || (!deferredPrompt && !showIosTip)) return null;

    const isKitchen = scope === "admin";
    const label = isKitchen ? "Install the Ladha Kitchen app" : "Install Ladha for faster ordering";
    const accent = isKitchen ? "#9A3412" : "#114B36";

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
            setDismissed(true);
        }
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setDismissed(true);
    };

    return (
        <div
            role="banner"
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 16px",
                background: accent,
                color: "white",
                fontSize: "0.82rem",
                fontWeight: 600,
                position: "sticky",
                top: 0,
                zIndex: 40,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {isKitchen ? <Download size={16} style={{ flexShrink: 0 }} /> : <Download size={16} style={{ flexShrink: 0 }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {showIosTip && !deferredPrompt
                        ? <>Tap <Share size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> then "Add to Home Screen" to install</>
                        : label}
                </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {deferredPrompt && (
                    <button
                        onClick={handleInstall}
                        style={{ background: "white", color: accent, border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                    >
                        Install
                    </button>
                )}
                <button
                    onClick={handleDismiss}
                    aria-label="Dismiss"
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.85)", cursor: "pointer", padding: 2, display: "flex" }}
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
