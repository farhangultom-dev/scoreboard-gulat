import { useState, useMemo } from 'react';
import {
  Trophy,
  Medal,
  CheckCircle2,
  Clock,
  Swords,
  X,
  FileDown,
} from 'lucide-react';
import {
  CategoryDivision,
  Athlete,
  TournamentBout,
  BoutResult,
  StandingRow,
} from '../../types/tournament';
import { VictoryType, Corner } from '../../types/match';
import { useTournamentStore } from '../../store/useTournamentStore';
import {
  calculateNordicStandings,
  getClassificationPoints,
} from '../../engine/uwwClassification';
import { downloadDivisionBracketPdf } from '../../engine/bracketPdfExporter';
import RegionFlag from '../common/RegionFlag';

interface BracketViewerProps {
  division: CategoryDivision;
  athletes: Athlete[];
  previewBouts?: TournamentBout[];
  isPreview?: boolean;
}

export default function BracketViewer({
  division,
  athletes,
  previewBouts,
  isPreview = false,
}: BracketViewerProps) {
  const allBouts = useTournamentStore((s) => s.bouts);
  const tournamentName = useTournamentStore((s) => s.tournamentName);
  const recordBoutResult = useTournamentStore((s) => s.recordBoutResult);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const bouts = useMemo(() => {
    const sourceList = previewBouts
      ? previewBouts
      : Object.values(allBouts).filter((b) => b.divisionId === division.id);

    return [...sourceList].sort((a, b) => {
      if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
      return a.bracketPosition - b.bracketPosition;
    });
  }, [allBouts, division.id, previewBouts]);

  const [activeBoutModal, setActiveBoutModal] = useState<TournamentBout | null>(
    null
  );
  const [winnerCorner, setWinnerCorner] = useState<Corner>('RED');
  const [victoryType, setVictoryType] = useState<VictoryType>('VPO');
  const [redScore, setRedScore] = useState<number>(3);
  const [blueScore, setBlueScore] = useState<number>(1);

  const athleteMap = new Map<string, Athlete>();
  athletes.forEach((a) => athleteMap.set(a.id, a));

  if (bouts.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 text-sm">
        Bagan pertandingan belum dibuat. Silakan selesaikan pengundian di atas dan klik{' '}
        <strong className="text-white">&quot;Kunci Undian &amp; Buat Bagan&quot;</strong>.
      </div>
    );
  }

  const handleOpenResultModal = (bout: TournamentBout) => {
    if (isPreview || bout.status === 'TBD') return;
    setActiveBoutModal(bout);
    if (bout.result) {
      setWinnerCorner(bout.result.winnerCorner);
      setVictoryType(bout.result.victoryType);
      setRedScore(bout.result.redScore);
      setBlueScore(bout.result.blueScore);
    } else {
      setWinnerCorner('RED');
      setVictoryType('VPO');
      setRedScore(3);
      setBlueScore(1);
    }
  };

  const handleSaveResult = async () => {
    if (!activeBoutModal || !activeBoutModal.redAthleteId || !activeBoutModal.blueAthleteId)
      return;

    const winnerId =
      winnerCorner === 'RED'
        ? activeBoutModal.redAthleteId
        : activeBoutModal.blueAthleteId;
    const loserId =
      winnerCorner === 'RED'
        ? activeBoutModal.blueAthleteId
        : activeBoutModal.redAthleteId;

    const cp = getClassificationPoints(victoryType);
    const redCp = winnerCorner === 'RED' ? cp.winner : cp.loser;
    const blueCp = winnerCorner === 'BLUE' ? cp.winner : cp.loser;

    const result: BoutResult = {
      winnerCorner,
      winnerAthleteId: winnerId,
      loserAthleteId: loserId,
      redScore: Number(redScore) || 0,
      blueScore: Number(blueScore) || 0,
      victoryType,
      redClassificationPts: redCp,
      blueClassificationPts: blueCp,
      completedAt: Date.now(),
    };

    await recordBoutResult(activeBoutModal.id, result);
    setActiveBoutModal(null);
  };

  const handleDownloadPdf = async () => {
    if (isExportingPdf || bouts.length === 0) return;
    setIsExportingPdf(true);
    try {
      await downloadDivisionBracketPdf({
        division,
        athletes,
        bouts,
        tournamentName,
        isDraft: isPreview,
      });
    } catch (err) {
      alert(
        `Gagal mengunduh PDF bagan: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const renderDownloadPdfButton = () => (
    <button
      type="button"
      onClick={handleDownloadPdf}
      disabled={isExportingPdf}
      className="no-print px-3 py-1.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0"
      title={
        isPreview
          ? 'Download Draft Bagan PDF (format UWW Arena)'
          : 'Download Bagan Resmi Kelas Ini (PDF format UWW Arena)'
      }
    >
      <FileDown className="w-3.5 h-3.5 shrink-0" />
      <span>{isExportingPdf ? 'Membuat PDF...' : isPreview ? 'Download Draft PDF' : 'Download PDF'}</span>
    </button>
  );

  const renderStandingsTable = (
    title: string,
    subtitle: string,
    standings: StandingRow[]
  ) => (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h3 className="font-black text-sm uppercase tracking-wider text-white">
            {title}
          </h3>
        </div>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-4 w-12 text-center">Rank</th>
              <th className="py-2.5 px-4">Nama Pegulat</th>
              <th className="py-2.5 px-4">Kontingen</th>
              <th className="py-2.5 px-4 text-center">Main</th>
              <th className="py-2.5 px-4 text-center">Menang</th>
              <th className="py-2.5 px-4 text-center text-amber-400">CP</th>
              <th className="py-2.5 px-4 text-center">VFA</th>
              <th className="py-2.5 px-4 text-center">VSU</th>
              <th className="py-2.5 px-4 text-center">TP (+)</th>
              <th className="py-2.5 px-4 text-center">TP (-)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {standings.map((st) => {
              const ath = athleteMap.get(st.athleteId);
              const isGold = st.rank === 1 && st.matchesPlayed > 0;
              const isSilver = st.rank === 2 && st.matchesPlayed > 0;
              const isBronze = st.rank === 3 && st.matchesPlayed > 0;

              return (
                <tr
                  key={st.athleteId}
                  className={`hover:bg-slate-800/30 transition ${
                    isGold ? 'bg-amber-500/10' : ''
                  }`}
                >
                  <td className="py-2.5 px-4 text-center font-mono font-black">
                    {isGold ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow-md shadow-amber-400/40">
                        1
                      </span>
                    ) : isSilver ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-950 text-xs font-black">
                        2
                      </span>
                    ) : isBronze ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs font-black">
                        3
                      </span>
                    ) : (
                      st.rank
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-bold text-white text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <RegionFlag
                        code={ath?.regionCode}
                        regionName={ath?.region}
                        size="xs"
                      />
                      <span className="truncate">
                        {ath?.name || st.athleteId}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-mono text-sky-400 font-bold mr-1.5">
                      {ath?.regionCode}
                    </span>
                    <span className="text-slate-400">{ath?.region}</span>
                  </td>
                  <td className="py-2.5 px-4 text-center font-semibold">{st.matchesPlayed}</td>
                  <td className="py-2.5 px-4 text-center font-bold text-emerald-400">
                    {st.wins}
                  </td>
                  <td className="py-2.5 px-4 text-center font-black text-amber-400 text-sm">
                    {st.classificationPoints}
                  </td>
                  <td className="py-2.5 px-4 text-center">{st.vfaCount}</td>
                  <td className="py-2.5 px-4 text-center">{st.vsuCount}</td>
                  <td className="py-2.5 px-4 text-center font-mono text-emerald-300">
                    {st.technicalPointsFor}
                  </td>
                  <td className="py-2.5 px-4 text-center font-mono text-rose-300">
                    {st.technicalPointsAgainst}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ==========================================
  // Render Format Nordic (Round Robin)
  // ==========================================
  if (division.format === 'NORDIC') {
    const athleteIds = athletes.map((a) => a.id);
    const standings = calculateNordicStandings(athleteIds, bouts);

    return (
      <div className="space-y-6">
        {renderStandingsTable(
          'Klasemen Resmi UWW (Nordic Round-Robin)',
          'Tie-Breakers: CP > Head-to-Head > VFA > VSU > TP Scored > TP Conceded',
          standings
        )}

        {/* Daftar Jadwal Partai per Ronde */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Swords className="w-4 h-4 text-sky-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Daftar Partai per Ronde (Klik partai untuk input hasil)
              </h4>
            </div>
            {renderDownloadPdfButton()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bouts.map((bout) => (
              <BoutCard
                key={bout.id}
                bout={bout}
                athleteMap={athleteMap}
                onClick={() => handleOpenResultModal(bout)}
              />
            ))}
          </div>
        </div>

        {renderResultModal()}
      </div>
    );
  }

  // ==========================================
  // Render Format Group Cross & Elimination
  // ==========================================
  // Kelompokkan partai berdasarkan roundOrder
  const roundsOrderMap = new Map<number, TournamentBout[]>();
  bouts.forEach((b) => {
    const list = roundsOrderMap.get(b.roundOrder) || [];
    list.push(b);
    roundsOrderMap.set(b.roundOrder, list);
  });

  const sortedRounds = Array.from(roundsOrderMap.keys()).sort((a, b) => a - b);

  // Pisahkan babak utama (Main Elimination) dan babak Repechage/Bronze
  const mainRounds = sortedRounds.filter((r) => r !== 50 && r !== 55);
  const repechageBouts = bouts.filter(
    (b) =>
      b.round === 'REPECHAGE_1' ||
      b.round === 'REPECHAGE_2' ||
      b.round === 'BRONZE_1' ||
      b.round === 'BRONZE_2'
  );

  const isGroupCross = division.format === 'GROUP_CROSS';
  const groupABouts = isGroupCross ? bouts.filter((b) => b.round === 'GROUP_A') : [];
  const groupBBouts = isGroupCross ? bouts.filter((b) => b.round === 'GROUP_B') : [];

  const sortedByDraw = isGroupCross
    ? [...athletes].sort((a, b) => (a.drawNumber ?? 999) - (b.drawNumber ?? 999))
    : [];
  const groupHalf = Math.ceil(sortedByDraw.length / 2);

  const poolAIds = isGroupCross
    ? groupABouts.length > 0
      ? Array.from(
          new Set(
            groupABouts
              .flatMap((b) => [b.redAthleteId, b.blueAthleteId])
              .filter((id): id is string => Boolean(id))
          )
        )
      : sortedByDraw.slice(0, groupHalf).map((a) => a.id)
    : [];

  const poolBIds = isGroupCross
    ? groupBBouts.length > 0
      ? Array.from(
          new Set(
            groupBBouts
              .flatMap((b) => [b.redAthleteId, b.blueAthleteId])
              .filter((id): id is string => Boolean(id))
          )
        )
      : sortedByDraw.slice(groupHalf).map((a) => a.id)
    : [];

  const poolAStandings = isGroupCross
    ? calculateNordicStandings(poolAIds, groupABouts)
    : [];
  const poolBStandings = isGroupCross
    ? calculateNordicStandings(poolBIds, groupBBouts)
    : [];

  return (
    <div className="space-y-6">
      {/* Klasemen Pool A & Pool B untuk format Group Cross */}
      {isGroupCross && (poolAStandings.length > 0 || poolBStandings.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {renderStandingsTable(
            'Klasemen Pool A (Group A)',
            'Peringkat 1 & 2 lolos ke Cross Semifinal',
            poolAStandings
          )}
          {renderStandingsTable(
            'Klasemen Pool B (Group B)',
            'Peringkat 1 & 2 lolos ke Cross Semifinal',
            poolBStandings
          )}
        </div>
      )}

      {/* Bagan Utama Eliminasi (Horizontal Multi-Column) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="font-black text-sm uppercase tracking-wider text-white">
              {isPreview
                ? 'Pratinjau Bagan Langsung (Live Draft Preview)'
                : 'Bagan Utama Pertandingan (Main Bracket)'}
            </h3>
            {isPreview && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-950 text-sky-400 border border-sky-700 uppercase">
                Draft Live
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-400">
              {isPreview
                ? 'Otomatis ter-update setiap kali nomor bola fisik dimasukkan'
                : 'Klik partai berstatus SCHEDULED / COMPLETED untuk input atau koreksi skor'}
            </span>
            {renderDownloadPdfButton()}
          </div>
        </div>

        <div className="flex items-start gap-6 min-w-[750px] pb-4">
          {mainRounds.map((rOrder) => {
            const list = roundsOrderMap.get(rOrder) || [];
            const roundTitle = getRoundDisplayName(list[0]?.round);

            return (
              <div key={rOrder} className="flex-1 min-w-[240px] space-y-3">
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 text-center border border-slate-800">
                  <span className="font-black text-xs uppercase tracking-wider text-sky-400">
                    {roundTitle}
                  </span>
                </div>

                <div className="space-y-4">
                  {list.map((bout) => (
                    <BoutCard
                      key={bout.id}
                      bout={bout}
                      athleteMap={athleteMap}
                      onClick={() => handleOpenResultModal(bout)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Blok Single Repechage & Bronze Finals (Jika ada) */}
      {repechageBouts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Medal className="w-5 h-5 text-amber-500" />
              <h3 className="font-black text-sm uppercase tracking-wider text-white">
                Jalur Single Repechage &amp; Perebutan Medali Perunggu (Bronze Finals)
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Otomatis terisi setelah Semifinal selesai
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {repechageBouts.map((bout) => (
              <BoutCard
                key={bout.id}
                bout={bout}
                athleteMap={athleteMap}
                onClick={() => handleOpenResultModal(bout)}
              />
            ))}
          </div>
        </div>
      )}

      {renderResultModal()}
    </div>
  );

  // Helper Modal Input Hasil Partai Cepat
  function renderResultModal() {
    if (!activeBoutModal) return null;
    const redAth = activeBoutModal.redAthleteId
      ? athleteMap.get(activeBoutModal.redAthleteId)
      : null;
    const blueAth = activeBoutModal.blueAthleteId
      ? athleteMap.get(activeBoutModal.blueAthleteId)
      : null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="relative w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-3xl shadow-2xl text-white flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-sky-400" />
              <h3 className="font-black text-sm uppercase tracking-wider">
                Input Hasil: {getRoundDisplayName(activeBoutModal.round)}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveBoutModal(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {/* Pemilihan Sudut Pemenang */}
            <div>
              <label className="block text-slate-400 font-bold uppercase mb-2">
                Pemenang Partai (Winner Corner):
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWinnerCorner('RED')}
                  className={`p-3 rounded-2xl border-2 font-bold text-left transition cursor-pointer ${
                    winnerCorner === 'RED'
                      ? 'bg-red-950 border-red-500 text-white shadow-lg shadow-red-950/80 ring-2 ring-red-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-[10px] font-mono font-black text-red-400">
                    SUDUT MERAH
                  </div>
                  <div className="text-sm font-black truncate mt-0.5">
                    {redAth?.name || 'RED'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {redAth?.regionCode}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setWinnerCorner('BLUE')}
                  className={`p-3 rounded-2xl border-2 font-bold text-left transition cursor-pointer ${
                    winnerCorner === 'BLUE'
                      ? 'bg-blue-950 border-blue-500 text-white shadow-lg shadow-blue-950/80 ring-2 ring-blue-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-[10px] font-mono font-black text-blue-400">
                    SUDUT BIRU
                  </div>
                  <div className="text-sm font-black truncate mt-0.5">
                    {blueAth?.name || 'BLUE'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {blueAth?.regionCode}
                  </div>
                </button>
              </div>
            </div>

            {/* Skor Pertandingan */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">
                  Skor Merah (Red):
                </label>
                <input
                  type="number"
                  min={0}
                  value={redScore}
                  onChange={(e) => setRedScore(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-base font-mono font-black text-red-400 text-center"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold uppercase mb-1">
                  Skor Biru (Blue):
                </label>
                <input
                  type="number"
                  min={0}
                  value={blueScore}
                  onChange={(e) => setBlueScore(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-base font-mono font-black text-blue-400 text-center"
                />
              </div>
            </div>

            {/* Jenis Kemenangan (VictoryType) */}
            <div>
              <label className="block text-slate-400 font-bold uppercase mb-1">
                Jenis Kemenangan Resmi UWW (Victory Type):
              </label>
              <select
                value={victoryType}
                onChange={(e) => setVictoryType(e.target.value as VictoryType)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-amber-400"
              >
                <option value="VPO">VPO - Kemenangan Poin (Lawan 0 Poin, CP 3-0)</option>
                <option value="VPO1">VPO1 - Kemenangan Poin (Lawan &gt;= 1 Poin, CP 3-1)</option>
                <option value="VSU">VSU - Keunggulan Teknik (Lawan 0 Poin, CP 4-0)</option>
                <option value="VSU1">VSU1 - Keunggulan Teknik (Lawan &gt;= 1 Poin, CP 4-1)</option>
                <option value="VFA">VFA - Kemenangan Jatuhan / Fall / Pin (CP 5-0)</option>
                <option value="VIN">VIN - Lawan Cedera / Injury (CP 5-0)</option>
                <option value="VFO">VFO - Forfeit / WO (CP 5-0)</option>
                <option value="DSQ">DSQ - Diskualifikasi (CP 5-0)</option>
              </select>
            </div>

            {/* Tombol Simpan */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveBoutModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveResult}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-sky-950 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Kunci Hasil &amp; Majukan Pemenang</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Komponen Card Partai Tunggal
 */
function BoutCard({
  bout,
  athleteMap,
  onClick,
}: {
  bout: TournamentBout;
  athleteMap: Map<string, Athlete>;
  onClick: () => void;
}) {
  const redAth = bout.redAthleteId ? athleteMap.get(bout.redAthleteId) : null;
  const blueAth = bout.blueAthleteId ? athleteMap.get(bout.blueAthleteId) : null;

  const isCompleted = bout.status === 'COMPLETED';
  const isScheduled = bout.status === 'SCHEDULED';
  const isTbd = bout.status === 'TBD';

  const isRedWinner = isCompleted && bout.result?.winnerCorner === 'RED';
  const isBlueWinner = isCompleted && bout.result?.winnerCorner === 'BLUE';

  return (
    <div
      onClick={isTbd ? undefined : onClick}
      className={`p-3 rounded-2xl border-2 transition select-none flex flex-col justify-between ${
        isTbd
          ? 'bg-slate-950/40 border-slate-800/80 opacity-70'
          : isCompleted
          ? 'bg-slate-950 border-emerald-700/60 shadow-md hover:border-emerald-500 cursor-pointer'
          : 'bg-slate-950 border-sky-600/70 shadow-lg hover:border-sky-400 cursor-pointer ring-1 ring-sky-500/20'
      }`}
    >
      {/* Header Info Partai */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px]">
        <span className="font-mono font-bold text-slate-400">
          {getRoundDisplayName(bout.round)}
        </span>

        {isCompleted ? (
          <span className="px-2 py-0.5 rounded-full font-black bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {bout.result?.victoryType} ({bout.result?.redScore}-{bout.result?.blueScore})
          </span>
        ) : isScheduled ? (
          <span className="px-2 py-0.5 rounded-full font-black bg-sky-950 text-sky-400 border border-sky-800 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            SCHEDULED
          </span>
        ) : (
          <span className="text-slate-600 font-mono">TBD</span>
        )}
      </div>

      {/* Sudut Merah */}
      <div className="py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
          {redAth && (
            <RegionFlag
              code={redAth.regionCode}
              regionName={redAth.region}
              size="xs"
            />
          )}
          <div className="min-w-0">
            <div
              className={`text-xs truncate ${
                isRedWinner
                  ? 'font-black text-amber-300'
                  : redAth
                  ? 'font-bold text-slate-200'
                  : bout.redSourceLabel?.startsWith('Menunggu Bola')
                  ? 'font-semibold italic text-amber-400/90'
                  : 'font-semibold text-slate-500'
              }`}
            >
              {redAth
                ? `${redAth.drawNumber ? `[#${redAth.drawNumber}] ` : ''}${redAth.name}`
                : bout.redSourceLabel || 'TBD'}
            </div>
            {redAth && (
              <div className="text-[10px] text-slate-400 font-mono">
                {redAth.regionCode} • {redAth.region}
              </div>
            )}
          </div>
        </div>

        {isCompleted && (
          <div className="font-mono font-black text-sm text-red-400">
            {bout.result?.redScore}
          </div>
        )}
      </div>

      {/* Sudut Biru */}
      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
          {blueAth && (
            <RegionFlag
              code={blueAth.regionCode}
              regionName={blueAth.region}
              size="xs"
            />
          )}
          <div className="min-w-0">
            <div
              className={`text-xs truncate ${
                isBlueWinner
                  ? 'font-black text-amber-300'
                  : blueAth
                  ? 'font-bold text-slate-200'
                  : bout.blueSourceLabel?.startsWith('Menunggu Bola')
                  ? 'font-semibold italic text-amber-400/90'
                  : 'font-semibold text-slate-500'
              }`}
            >
              {blueAth
                ? `${blueAth.drawNumber ? `[#${blueAth.drawNumber}] ` : ''}${blueAth.name}`
                : bout.blueSourceLabel || 'TBD'}
            </div>
            {blueAth && (
              <div className="text-[10px] text-slate-400 font-mono">
                {blueAth.regionCode} • {blueAth.region}
              </div>
            )}
          </div>
        </div>

        {isCompleted && (
          <div className="font-mono font-black text-sm text-blue-400">
            {bout.result?.blueScore}
          </div>
        )}
      </div>
    </div>
  );
}

function getRoundDisplayName(round?: string): string {
  switch (round) {
    case 'QUALIFICATION':
      return 'Qualification';
    case 'ROUND_OF_16':
      return 'Round of 16';
    case 'QUARTERFINAL':
      return 'Quarterfinals';
    case 'SEMIFINAL':
      return 'Semifinals';
    case 'GOLD_FINAL':
      return 'Gold Medal Final';
    case 'BRONZE_1':
      return 'Bronze Medal Final 1';
    case 'BRONZE_2':
      return 'Bronze Medal Final 2';
    case 'REPECHAGE_1':
      return 'Repechage Round 1';
    case 'REPECHAGE_2':
      return 'Repechage Round 2';
    case 'GROUP_A':
      return 'Pool A';
    case 'GROUP_B':
      return 'Pool B';
    case 'NORDIC_R1':
      return 'Ronde 1';
    case 'NORDIC_R2':
      return 'Ronde 2';
    case 'NORDIC_R3':
      return 'Ronde 3';
    case 'NORDIC_R4':
      return 'Ronde 4';
    case 'NORDIC_R5':
      return 'Ronde 5';
    default:
      return round?.replace('_', ' ') || 'Match';
  }
}
