/**
 * Purpose: Main React Application Container for Ladha.
 * Responsibilities: Wraps application in CartProvider + CustomerAuthProvider + NotificationsProvider contexts
 *   and mounts the react-router data router (see ./router.tsx) which owns all navigation.
 * Dependencies: provider contexts and the router.
 * When to modify: When adding new top-level providers or changing the app bootstrap.
 */

import { RouterProvider } from "react-router-dom";
import { CartProvider } from "./context/CartContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { PlatformAdminAuthProvider } from "./context/PlatformAdminAuthContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import { router } from "./router";

export function App() {
    return (
        <NotificationsProvider>
            <CartProvider>
                <CustomerAuthProvider>
                    <AdminAuthProvider>
                        <PlatformAdminAuthProvider>
                            <RouterProvider router={router} />
                        </PlatformAdminAuthProvider>
                    </AdminAuthProvider>
                </CustomerAuthProvider>
            </CartProvider>
        </NotificationsProvider>
    );
}

export default App;
