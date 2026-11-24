import { useEffect, useState } from 'react';
import { Database, Wifi, AlertTriangle } from 'lucide-react';
import {
  BackendConnectionStatus,
  getBackendConnectionStatus,
  subscribeBackendStatus,
} from '../../store/socketClient';

export default function MySqlStatusBadge() {
  const [status, setStatus] = useState<BackendConnectionStatus>(
    getBackendConnectionStatus()
  );

  useEffect(() => {
    const unsubscribe = subscribeBackendStatus((nextStatus) => {
      setStatus(nextStatus);
    });
    return () => unsubscribe();
  }, []);

  const lanScheduleUrl = `http://${status.localIp || '127.0.0.1'}:4000/schedule`;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {status.isConnected ? (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-700/70 whitespace-nowrap shrink-0"
          title="Terhubung ke database MySQL lokal (127.0.0.1:3306)"
        >
          <Database className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>MySQL Local Connected</span>
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-700 animate-pulse whitespace-nowrap shrink-0"
          title="Mencoba menghubungkan ulang ke server lokal di port 4000..."
        >
          <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
          <span>Server Disconnected (Reconnecting...)</span>
        </span>
      )}

      {status.isConnected && status.localIp && (
        <a
          href={lanScheduleUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden 2xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-slate-950 hover:bg-slate-800 text-sky-300 border border-slate-800 transition whitespace-nowrap shrink-0"
          title={`Buka Jadwal TV via Wi-Fi/Hotspot Lokal: ${lanScheduleUrl}`}
        >
          <Wifi className="w-3 h-3 text-sky-400 shrink-0" />
          <span>{lanScheduleUrl}</span>
        </a>
      )}
    </div>
  );
}
