import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

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
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white select-none">
          <div className="max-w-md w-full p-6 rounded-3xl bg-slate-900 border border-rose-800/80 shadow-2xl text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center">
              <AlertOctagon className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-rose-300">
                Terjadi Kesalahan Tampilan
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Aplikasi mendeteksi error pada saat memuat komponen ini.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left font-mono text-[11px] text-rose-400 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Muat Ulang Halaman</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/controller';
                }}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Controller
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
