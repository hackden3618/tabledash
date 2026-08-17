import { AlertTriangle, RefreshCw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

/**
 * createBrowserRouter uses its own internal error handling for exceptions
 * thrown while rendering a route element. That internal boundary sits
 * *inside* <RouterProvider>, so it intercepts render errors before they
 * can ever reach the app-level <ErrorBoundary> in main.tsx — without an
 * errorElement here, React Router falls back to its own unstyled default
 * error page (the "Hey developer" screen), not our branded one.
 *
 * This component is that errorElement. Attach it wherever a render error
 * should show a friendly recovery screen instead of the router default.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  let message = "An unexpected error occurred in the application. Please reload to recover.";
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-[#E8DED2] shadow-xl flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-[#FEF2F2] flex items-center justify-center text-[#EF4444] mb-4">
          <AlertTriangle size={32} />
        </div>

        <h1 className="text-xl font-extrabold text-[#1F2937]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#6B7280]">
          An unexpected error occurred in the application. Please reload to recover.
        </p>

        <div className="mt-4 w-full bg-[#F3F4F6] rounded-xl p-3 text-left overflow-x-auto max-h-32">
          <p className="text-xs font-mono text-[#374151] break-all">{message}</p>
        </div>

        <button
          onClick={() => window.location.assign("/")}
          className="mt-6 w-full py-3.5 px-6 rounded-2xl bg-[#114B36] hover:bg-[#0D3B2A] text-white font-bold text-sm flex items-center justify-center gap-2 border-none cursor-pointer transition-colors shadow-md active:scale-98"
        >
          <RefreshCw size={18} />
          Reload Application
        </button>
      </div>
    </div>
  );
}
