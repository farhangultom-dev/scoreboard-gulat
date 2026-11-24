import { useState, useMemo } from 'react';
import { Search, Trophy, Lock, Users } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { WrestlingStyle } from '../../types/match';
import { CategoryDivision } from '../../types/tournament';

const STYLE_NAMES: Record<WrestlingStyle, { label: string; color: string }> = {
  FS: { label: 'Freestyle (FS)', color: 'text-amber-400 border-amber-500/40 bg-amber-950/20' },
  GR: { label: 'Greco-Roman (GR)', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20' },
  WW: { label: "Women's Wrestling (WW)", color: 'text-rose-400 border-rose-500/40 bg-rose-950/20' },
};

export default function CategoryListSidebar() {
  const divisions = useTournamentStore((s) => s.divisions);
  const selectedDivisionId = useTournamentStore((s) => s.selectedDivisionId);
  const selectDivision = useTournamentStore((s) => s.selectDivision);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeStyleTab, setActiveStyleTab] = useState<'ALL' | WrestlingStyle>('ALL');

  // Filter divisions based on search query and style tab
  const filteredDivisions = useMemo(() => {
    return Object.values(divisions).filter((div) => {
      if (activeStyleTab !== 'ALL' && div.style !== activeStyleTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = div.id.toLowerCase().includes(q);
        const matchesWeight = div.weightClass.toLowerCase().includes(q);
        const matchesAge = div.ageCategory.toLowerCase().includes(q);
        const matchesStyle = div.style.toLowerCase().includes(q);
        return matchesId || matchesWeight || matchesAge || matchesStyle;
      }
      return true;
    });
  }, [divisions, activeStyleTab, searchQuery]);

  // Group filtered divisions by Style
  const groupedByStyle = useMemo(() => {
    const groups: Partial<Record<WrestlingStyle, CategoryDivision[]>> = {};
    const styles: WrestlingStyle[] = ['FS', 'GR', 'WW'];

    styles.forEach((st) => {
      const list = filteredDivisions.filter((d) => d.style === st);
      // Sort by weight numerically if possible
      list.sort((a, b) => {
        const numA = parseFloat(a.weightClass) || 0;
        const numB = parseFloat(b.weightClass) || 0;
        return numA - numB;
      });
      if (list.length > 0) {
        groups[st] = list;
      }
    });

    return groups;
  }, [filteredDivisions]);

  const totalDivisionsCount = Object.keys(divisions).length;

  return (
    <aside className="w-80 md:w-88 flex flex-col h-full bg-slate-900 border-r border-slate-800 text-white select-none">
      {/* Search & Header */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span className="font-black text-sm uppercase tracking-wider">
              Kategori Tanding
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300">
            {totalDivisionsCount} Kelas
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kelas (misal: 74, FS, Senior)..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 transition"
          />
        </div>

        {/* Style Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          {(['ALL', 'FS', 'GR', 'WW'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveStyleTab(tab)}
              className={`flex-1 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                activeStyleTab === tab
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Division List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {totalDivisionsCount === 0 ? (
          <div className="py-12 px-4 text-center text-slate-500 text-xs">
            Belum ada kategori tanding. Unggah file Excel untuk mengisi data otomatis.
          </div>
        ) : filteredDivisions.length === 0 ? (
          <div className="py-12 px-4 text-center text-slate-500 text-xs">
            Tidak ada kategori yang sesuai dengan pencarian &quot;{searchQuery}&quot;.
          </div>
        ) : (
          (Object.keys(groupedByStyle) as WrestlingStyle[]).map((style) => {
            const list = groupedByStyle[style] || [];
            if (list.length === 0) return null;
            const styleMeta = STYLE_NAMES[style];

            return (
              <div key={style} className="space-y-1.5">
                {/* Style Header */}
                <div
                  className={`px-3 py-1 rounded-lg border text-xs font-black tracking-wider flex items-center justify-between ${styleMeta.color}`}
                >
                  <span>{styleMeta.label}</span>
                  <span className="text-[11px] opacity-80">{list.length} kelas</span>
                </div>

                {/* Division Items */}
                <div className="space-y-1 pl-1">
                  {list.map((div) => {
                    const isSelected = selectedDivisionId === div.id;
                    const athleteCount = Array.isArray(div.athleteIds) ? div.athleteIds.length : 0;
                    const formatLabel = (div.format || 'SINGLE_BOUT').replace(/_/g, ' ');

                    return (
                      <button
                        key={div.id}
                        type="button"
                        onClick={() => selectDivision(div.id)}
                        className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between border cursor-pointer ${
                          isSelected
                            ? 'bg-sky-600/20 border-sky-500 text-white shadow-md shadow-sky-950/40'
                            : 'bg-slate-950/40 hover:bg-slate-800/60 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm tracking-wide">
                              {div.weightClass}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {div.ageCategory}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                            <span className="px-1.5 py-0.2 rounded-md bg-slate-800 font-mono text-slate-300 border border-slate-700">
                              {formatLabel}
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-400 font-medium">
                              {div.assignedMat}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                              athleteCount > 0
                                ? 'bg-sky-950 text-sky-400 border border-sky-800'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            <Users className="w-3 h-3" />
                            {athleteCount}
                          </span>
                          {div.isDrawLocked && (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-400 uppercase">
                              <Lock className="w-2.5 h-2.5" />
                              Locked
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
