import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
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

            {this.state.error && (
              <div className="mt-4 w-full bg-[#F3F4F6] rounded-xl p-3 text-left overflow-x-auto max-h-32">
                <p className="text-xs font-mono text-[#374151] break-all">
                  {this.state.error.message || String(this.state.error)}
                </p>
              </div>
            )}

            <button
              onClick={this.handleReload}
              className="mt-6 w-full py-3.5 px-6 rounded-2xl bg-[#114B36] hover:bg-[#0D3B2A] text-white font-bold text-sm flex items-center justify-center gap-2 border-none cursor-pointer transition-colors shadow-md active:scale-98"
            >
              <RefreshCw size={18} />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
