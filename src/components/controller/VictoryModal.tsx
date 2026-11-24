import { useState, useEffect } from 'react';
import { useMatchStore } from '../../store/useMatchStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Corner, VictoryType } from '../../types/match';
import { BoutResult } from '../../types/tournament';
import { getClassificationPoints } from '../../engine/uwwClassification';
import { Trophy, X, Check, Award, AlertTriangle, ArrowRight, Play } from 'lucide-react';

interface VictoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface VictoryOption {
  type: VictoryType;
  label: string;
  description: string;
}

const VICTORY_OPTIONS: VictoryOption[] = [
  {
    type: 'VFA',
    label: 'VFA — Fall (Pin)',
    description: 'Bantingan telak / kedua pundak lawan menempel matras',
  },
  {
    type: 'VSU',
    label: 'VSU — Technical Superiority',
    description: 'Keunggulan teknis (selisih 10 FS/WW, 8 GR) & lawan 0 poin',
  },
  {
    type: 'VSU1',
    label: 'VSU1 — Technical Superiority with Technical Point',
    description: 'Keunggulan teknis (selisih 10 FS/WW, 8 GR) & lawan mencetak poin',
  },
  {
    type: 'VPO',
    label: 'VPO — Points Decision',
    description: 'Menang poin pada akhir babak penuh & lawan 0 poin',
  },
  {
    type: 'VPO1',
    label: 'VPO1 — Points Decision with Technical Point',
    description: 'Menang poin pada akhir babak penuh & lawan mencetak poin',
  },
  {
    type: 'DSQ',
    label: 'DSQ — Disqualification',
    description: 'Diskualifikasi (3 Cautions atau pelanggaran brutal)',
  },
  {
    type: 'VIN',
    label: 'VIN — Injury Default',
    description: 'Lawan cedera dan tidak dapat melanjutkan pertandingan',
  },
  {
    type: 'VFO',
    label: 'VFO — Forfeit',
    description: 'Lawan mengundurkan diri atau tidak hadir di matras',
  },
];

export default function VictoryModal({ isOpen, onClose }: VictoryModalProps) {
  const match = useMatchStore((s) => s.match);
  const declareWinner = useMatchStore((s) => s.declareWinner);
  const clearWinner = useMatchStore((s) => s.clearWinner);

  const getDisqualification = useMatchStore((s) => s.getDisqualification);
  const getTechSuperiority = useMatchStore((s) => s.getTechSuperiority);
  const getSuggestedVictory = useMatchStore((s) => s.getSuggestedVictory);

  const bouts = useTournamentStore((s) => s.bouts);
  const completeTournamentBout = useTournamentStore((s) => s.completeBout);
  const loadBoutToMatch = useTournamentStore((s) => s.loadBoutToMatch);

  const [selectedCorner, setSelectedCorner] = useState<Corner>('RED');
  const [selectedType, setSelectedType] = useState<VictoryType>('VPO');
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Evaluasi rekomendasi otomatis saat modal terbuka
  useEffect(() => {
    if (!isOpen) {
      setIsConfirmed(false);
      return;
    }

    const dsq = getDisqualification();
    if (dsq.triggered && dsq.winnerCorner) {
      setSelectedCorner(dsq.winnerCorner);
      setSelectedType('DSQ');
      return;
    }

    const tech = getTechSuperiority();
    if (tech.triggered && tech.leader && tech.suggestedVictoryType) {
      setSelectedCorner(tech.leader);
      setSelectedType(tech.suggestedVictoryType);
      return;
    }

    const regular = getSuggestedVictory();
    if (regular) {
      setSelectedCorner(regular.corner);
      setSelectedType(regular.type);
      return;
    }

    // Default jika tidak ada rekomendasi
    if (match.winner) {
      setSelectedCorner(match.winner.corner);
      setSelectedType(match.winner.type);
    } else if (match.red.score >= match.blue.score) {
      setSelectedCorner('RED');
      setSelectedType(match.blue.score === 0 ? 'VPO' : 'VPO1');
    } else {
      setSelectedCorner('BLUE');
      setSelectedType(match.red.score === 0 ? 'VPO' : 'VPO1');
    }
  }, [isOpen, match, getDisqualification, getTechSuperiority, getSuggestedVictory]);

  if (!isOpen) return null;

  const activeBout = match.activeBoutId ? bouts[match.activeBoutId] : null;

  // Cari partai berikutnya di matras yang sama untuk tombol 'Lanjut Muat Partai Berikutnya'
  const currentMat = match.metadata.matName || 'MAT A';
  const nextAvailableBout = Object.values(bouts)
    .filter(
      (b) =>
        (b.matName || 'MAT A') === currentMat &&
        b.id !== match.activeBoutId &&
        (b.status === 'ON_DECK' || b.status === 'SCHEDULED')
    )
    .sort((a, b) => {
      if (a.status === 'ON_DECK' && b.status !== 'ON_DECK') return -1;
      if (b.status === 'ON_DECK' && a.status !== 'ON_DECK') return 1;
      if (a.boutNumber != null && b.boutNumber != null) {
        return a.boutNumber - b.boutNumber;
      }
      if (a.boutNumber != null) return -1;
      if (b.boutNumber != null) return 1;
      if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
      return a.bracketPosition - b.bracketPosition;
    })[0];

  const handleConfirm = async () => {
    declareWinner(selectedCorner, selectedType);

    // Jika partai terhubung ke sistem antrean turnamen, sinkronkan ke useTournamentStore
    if (match.activeBoutId && activeBout) {
      const winnerId =
        selectedCorner === 'RED'
          ? activeBout.redAthleteId || 'RED'
          : activeBout.blueAthleteId || 'BLUE';
      const loserId =
        selectedCorner === 'RED'
          ? activeBout.blueAthleteId || 'BLUE'
          : activeBout.redAthleteId || 'RED';

      const cp = getClassificationPoints(selectedType);
      const redCp = selectedCorner === 'RED' ? cp.winner : cp.loser;
      const blueCp = selectedCorner === 'BLUE' ? cp.winner : cp.loser;

      const result: BoutResult = {
        winnerCorner: selectedCorner,
        winnerAthleteId: winnerId,
        loserAthleteId: loserId,
        redScore: match.red.score,
        blueScore: match.blue.score,
        victoryType: selectedType,
        redClassificationPts: redCp,
        blueClassificationPts: blueCp,
        completedAt: Date.now(),
      };

      await completeTournamentBout(match.activeBoutId, result);
      setIsConfirmed(true);
    } else {
      onClose();
    }
  };

  const handleLoadNextBout = () => {
    if (nextAvailableBout) {
      loadBoutToMatch(nextAvailableBout.id);
    }
    onClose();
  };

  const handleClear = () => {
    clearWinner();
    onClose();
  };

  const redWon = selectedCorner === 'RED';
  const blueWon = selectedCorner === 'BLUE';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">
              {isConfirmed ? 'Hasil Pertandingan Terkunci' : 'Deklarasi Pemenang (Declare Winner)'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tampilan Konfirmasi Sukses dengan Tombol Lanjut Muat Partai Berikutnya */}
        {isConfirmed ? (
          <div className="p-8 text-center space-y-6">
            <div className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Check className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-xl font-black uppercase text-white">
                Pemenang Berhasil Disinkronkan ke Bagan!
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Hasil {match.metadata.boutNumber} telah tercatat resmi ({selectedType}) dan bagan turnamen telah diperbarui otomatis.
              </p>
            </div>

            {nextAvailableBout ? (
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-600/60 text-left space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-amber-400 uppercase">
                    Partai Berikutnya di {currentMat}:
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-700">
                    {nextAvailableBout.boutNumber ? `BOUT #${nextAvailableBout.boutNumber}` : 'READY'}
                  </span>
                </div>
                <div className="text-sm font-bold text-white">
                  {nextAvailableBout.round.replace('_', ' ')}
                </div>

                <button
                  type="button"
                  onClick={handleLoadNextBout}
                  className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950 transition cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>
                    Lanjut Muat Partai Berikutnya ({nextAvailableBout.boutNumber ? `Bout #${nextAvailableBout.boutNumber}` : 'Bout Selanjutnya'})
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                Seluruh partai di {currentMat} telah selesai dimainkan.
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Tutup Modal
            </button>
          </div>
        ) : (
          /* Form Pemilihan Pemenang */
          <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
            {/* Winner Selection (RED vs BLUE) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Pilih Sudut Pemenang
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedCorner('RED')}
                  className={`p-4 rounded-xl border-2 transition cursor-pointer text-left flex flex-col justify-between gap-2 ${
                    redWon
                      ? 'bg-red-950/80 border-red-500 shadow-lg shadow-red-950'
                      : 'bg-slate-800/40 border-slate-700/60 hover:border-red-600/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase px-2 py-0.5 rounded-full bg-red-600 text-white">
                      RED CORNER
                    </span>
                    {redWon && <Check className="w-5 h-5 text-red-400" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base leading-tight">
                      {match.red.name}
                    </h3>
                    <p className="text-xs font-semibold text-red-300">
                      {match.red.countryOrTeam} • Skor: {match.red.score}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCorner('BLUE')}
                  className={`p-4 rounded-xl border-2 transition cursor-pointer text-left flex flex-col justify-between gap-2 ${
                    blueWon
                      ? 'bg-blue-950/80 border-blue-500 shadow-lg shadow-blue-950'
                      : 'bg-slate-800/40 border-slate-700/60 hover:border-blue-600/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase px-2 py-0.5 rounded-full bg-blue-600 text-white">
                      BLUE CORNER
                    </span>
                    {blueWon && <Check className="w-5 h-5 text-blue-400" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base leading-tight">
                      {match.blue.name}
                    </h3>
                    <p className="text-xs font-semibold text-blue-300">
                      {match.blue.countryOrTeam} • Skor: {match.blue.score}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Victory Types */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Jenis Kemenangan Resmi UWW
              </label>
              <div className="space-y-2">
                {VICTORY_OPTIONS.map((opt) => {
                  const isSelected = selectedType === opt.type;
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => setSelectedType(opt.type)}
                      className={`w-full p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-amber-950/40 border-amber-500 text-white'
                          : 'bg-slate-800/30 border-slate-700/60 hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm flex items-center gap-2">
                          {opt.label}
                          {isSelected && (
                            <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500 text-black">
                              Dipilih
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {opt.description}
                        </div>
                      </div>
                      {isSelected && <Award className="w-5 h-5 text-amber-400 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Alert jika sudah ada pemenang sebelumnya */}
            {match.winner && (
              <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-700/50 flex items-center justify-between text-xs text-amber-300">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Saat ini: <b>{match.winner.corner}</b> ({match.winner.type}) telah dinyatakan menang.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-800 text-white font-semibold transition cursor-pointer text-xs"
                >
                  Hapus Pemenang
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        {!isConfirmed && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-6 py-2 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-950 transition flex items-center gap-2 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-slate-950" />
              Konfirmasi Pemenang ({selectedType})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
