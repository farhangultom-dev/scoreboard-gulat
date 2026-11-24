import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Shuffle,
  Lock,
  Unlock,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Maximize2,
  Minimize2,
  RotateCcw,
  Keyboard,
  Eye,
  EyeOff,
  X,
  AlertOctagon,
  ListOrdered,
  Database,
  Loader2,
} from 'lucide-react';
import { Athlete, CategoryDivision } from '../../types/tournament';
import { useTournamentStore } from '../../store/useTournamentStore';
import {
  buildDraftBracketPreview,
  getBallSlotMetadata,
  validateManualDraw,
} from '../../engine/uwwManualDraw';
import BallTrackerBoard from './BallTrackerBoard';
import BracketViewer from './BracketViewer';
import RegionFlag from '../common/RegionFlag';

interface DrawCeremonyPanelProps {
  division: CategoryDivision;
  athletes: Athlete[];
}

export default function DrawCeremonyPanel({
  division,
  athletes,
}: DrawCeremonyPanelProps) {
  const performDrawOnly = useTournamentStore((s) => s.performDrawOnly);
  const setAthleteDrawNumber = useTournamentStore(
    (s) => s.setAthleteDrawNumber
  );
  const setDivisionDrawDraft = useTournamentStore(
    (s) => s.setDivisionDrawDraft
  );
  const saveDivisionDrawAssignments = useTournamentStore(
    (s) => s.saveDivisionDrawAssignments
  );
  const clearDivisionDrawNumbers = useTournamentStore(
    (s) => s.clearDivisionDrawNumbers
  );
  const swapDrawNumbers = useTournamentStore((s) => s.swapDrawNumbers);
  const lockAndGenerateBracket = useTournamentStore(
    (s) => s.lockAndGenerateBracket
  );
  const unlockAndResetBracket = useTournamentStore(
    (s) => s.unlockAndResetBracket
  );

  type DrawSyncStatus =
    | 'IDLE'
    | 'SAVING'
    | 'SAVED_MYSQL'
    | 'SAVED_LOCAL'
    | 'CONFLICT'
    | 'ERROR';

  const [separateRegion, setSeparateRegion] = useState(true);
  const [activeAthleteId, setActiveAthleteId] = useState<string | null>(
    athletes[0]?.id ?? null
  );
  const [sortByBallNumber, setSortByBallNumber] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(true);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [swapFrom, setSwapFrom] = useState<string>('');
  const [swapTo, setSwapTo] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<DrawSyncStatus>('IDLE');
  const [syncErrorMsg, setSyncErrorMsg] = useState<string>('');

  // Menyimpan riwayat nomor bola terakhir tiap atlet sebelum diganti (untuk fitur 1-klik Tukar Nomor saat duplikat)
  const previousBallByAthleteRef = useRef<Record<string, number | undefined>>(
    {}
  );
  // Refs untuk input keyboard-first (Enter / Tab otomatis lompat ke atlet kosong berikutnya)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalAthletes = athletes.length;
  const isLocked = division.isDrawLocked;

  // Validasi real-time kelengkapan & keunikan nomor bola fisik
  const validation = useMemo(() => validateManualDraw(athletes), [athletes]);

  // Bersihkan debounce timer saat ganti kelas atau unmount
  useEffect(() => {
    setSyncStatus('IDLE');
    setSyncErrorMsg('');
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    };
  }, [division.id]);

  // Eksekusi persistensi ke MySQL via PATCH /api/divisions/:id/draw/manual (transaksi 2-tahap)
  const flushSaveAssignments = useCallback(
    async (snapshotAthletes: Athlete[]) => {
      const check = validateManualDraw(snapshotAthletes);
      if (
        check.duplicateNumbers.length > 0 ||
        check.outOfRangeAthleteIds.length > 0
      ) {
        setSyncStatus('CONFLICT');
        setSyncErrorMsg('');
        return;
      }

      setSyncStatus('SAVING');
      setSyncErrorMsg('');

      const assignments = snapshotAthletes.map((a) => ({
        athleteId: a.id,
        drawNumber:
          a.drawNumber !== undefined && a.drawNumber !== null
            ? a.drawNumber
            : null,
      }));

      const res = await saveDivisionDrawAssignments(division.id, assignments);
      if (res.ok) {
        setSyncStatus(res.target === 'MYSQL' ? 'SAVED_MYSQL' : 'SAVED_LOCAL');
      } else {
        setSyncStatus('ERROR');
        setSyncErrorMsg(res.error || 'Gagal menyimpan ke MySQL');
      }
    },
    [division.id, saveDivisionDrawAssignments]
  );

  // Jadwalkan auto-save debounce 250ms atau langsung apabila diminta
  const triggerAutoSave = useCallback(
    (snapshotAthletes: Athlete[], immediate = false) => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }

      const check = validateManualDraw(snapshotAthletes);
      if (
        check.duplicateNumbers.length > 0 ||
        check.outOfRangeAthleteIds.length > 0
      ) {
        setSyncStatus('CONFLICT');
        setSyncErrorMsg('');
        return;
      }

      if (immediate) {
        void flushSaveAssignments(snapshotAthletes);
        return;
      }

      setSyncStatus('SAVING');
      saveDebounceRef.current = setTimeout(() => {
        saveDebounceRef.current = null;
        void flushSaveAssignments(snapshotAthletes);
      }, 250);
    },
    [flushSaveAssignments]
  );

  // Metadata slot bola UWW (BYE, QUAL, POOL A/B, NORDIC, MAIN)
  const slotMetaByBall = useMemo(() => {
    const list = getBallSlotMetadata(totalAthletes, division.format);
    return new Map(list.map((m) => [m.ballNumber, m]));
  }, [totalAthletes, division.format]);

  // Pratinjau bagan langsung (Live Draft Preview)
  const draftBouts = useMemo(
    () => buildDraftBracketPreview(division, athletes),
    [division, athletes]
  );

  // Urutan baris atlet di tabel input:
  // Default: urutan daftar pendaftaran/weigh-in (stabil agar baris tidak melompat saat mengetik)
  // Opsional: diurutkan berdasarkan nomor bola (#1..#N)
  const displayedAthletes = useMemo(() => {
    if (!sortByBallNumber) {
      return athletes;
    }
    return [...athletes].sort((a, b) => {
      if (a.drawNumber && b.drawNumber) return a.drawNumber - b.drawNumber;
      if (a.drawNumber) return -1;
      if (b.drawNumber) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [athletes, sortByBallNumber]);

  const activeAthlete =
    athletes.find((a) => a.id === activeAthleteId) ||
    athletes.find((a) => a.drawNumber === undefined) ||
    athletes[0] ||
    null;

  // Cari atlet berikutnya yang masih belum memiliki nomor bola
  const focusNextEmptyAthlete = (
    currentId: string,
    overrideUpdatedId?: string,
    overrideNewBall?: number | undefined
  ) => {
    const list = displayedAthletes;
    if (list.length === 0) return;

    const currentIndex = list.findIndex((a) => a.id === currentId);
    const hasBall = (ath: Athlete) => {
      if (ath.id === overrideUpdatedId) {
        return overrideNewBall !== undefined;
      }
      return ath.drawNumber !== undefined && ath.drawNumber !== null;
    };

    // Cari atlet kosong setelah indeks saat ini (melingkar ke atas jika perlu)
    for (let offset = 1; offset <= list.length; offset++) {
      const candidate = list[(currentIndex + offset) % list.length];
      if (!hasBall(candidate)) {
        setActiveAthleteId(candidate.id);
        setTimeout(() => {
          const el = inputRefs.current[candidate.id];
          if (el) {
            el.focus();
            el.select();
          }
        }, 10);
        return;
      }
    }

    // Jika semua atlet sudah terisi, pindahkan ke baris berikutnya
    const nextCandidate = list[(currentIndex + 1) % list.length];
    if (nextCandidate) {
      setActiveAthleteId(nextCandidate.id);
      setTimeout(() => {
        const el = inputRefs.current[nextCandidate.id];
        if (el) {
          el.focus();
          el.select();
        }
      }, 10);
    }
  };

  // Handler perubahan input nomor bola fisik pada satu atlet
  const handleBallInputChange = async (athlete: Athlete, rawValue: string) => {
    if (isLocked) return;

    const trimmed = rawValue.trim();
    if (trimmed === '') {
      previousBallByAthleteRef.current[athlete.id] = athlete.drawNumber;
      await setAthleteDrawNumber(athlete.id, undefined);
      const nextAthletes = athletes.map((a) =>
        a.id === athlete.id ? { ...a, drawNumber: undefined } : a
      );
      triggerAutoSave(nextAthletes, false);
      return;
    }

    const parsed = parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) return;

    // Simpan nomor bola lama sebelum diganti apabila nomor lama bukan duplikat
    if (
      athlete.drawNumber !== undefined &&
      athlete.drawNumber !== parsed &&
      !validation.duplicateNumbers.includes(athlete.drawNumber)
    ) {
      previousBallByAthleteRef.current[athlete.id] = athlete.drawNumber;
    }

    await setAthleteDrawNumber(athlete.id, parsed);
    const nextAthletes = athletes.map((a) =>
      a.id === athlete.id ? { ...a, drawNumber: parsed } : a
    );
    triggerAutoSave(nextAthletes, false);
  };

  // Handler Keyboard-First: Tekan Enter langsung flush auto-save dan melompat ke atlet kosong berikutnya
  const handleInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    athlete: Athlete
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerAutoSave(athletes, true);
      focusNextEmptyAthlete(athlete.id);
    }
  };

  // Handler Click-to-Assign dari BallTrackerBoard (langsung simpan ke MySQL)
  const handleSelectBallFromBoard = async (ballNumber: number) => {
    if (isLocked) return;

    const targetAthlete = activeAthlete;
    if (!targetAthlete) return;

    if (
      targetAthlete.drawNumber !== undefined &&
      targetAthlete.drawNumber !== ballNumber
    ) {
      previousBallByAthleteRef.current[targetAthlete.id] =
        targetAthlete.drawNumber;
    }

    await setAthleteDrawNumber(targetAthlete.id, ballNumber);
    const nextAthletes = athletes.map((a) =>
      a.id === targetAthlete.id ? { ...a, drawNumber: ballNumber } : a
    );
    triggerAutoSave(nextAthletes, true);
    focusNextEmptyAthlete(targetAthlete.id, targetAthlete.id, ballNumber);
  };

  // Handler 1-Klik Resolusi Konflik / Tukar Nomor Duplikat (Transaksi 2-Tahap Anti-Bentrok)
  const handleResolveDuplicateConflict = async (
    currentAthlete: Athlete,
    otherAthlete: Athlete,
    conflictingBall: number
  ) => {
    if (isLocked) return;

    // Cek apakah currentAthlete punya nomor bola sebelumnya, atau ada nomor bola yang masih tersedia
    const prevBallOfCurrent =
      previousBallByAthleteRef.current[currentAthlete.id];
    const fallbackBall =
      prevBallOfCurrent &&
      prevBallOfCurrent >= 1 &&
      prevBallOfCurrent <= totalAthletes &&
      prevBallOfCurrent !== conflictingBall
        ? prevBallOfCurrent
        : validation.availableNumbers[0];

    await setDivisionDrawDraft([
      { athleteId: currentAthlete.id, drawNumber: conflictingBall },
      { athleteId: otherAthlete.id, drawNumber: fallbackBall ?? null },
    ]);

    const nextAthletes = athletes.map((a) => {
      if (a.id === currentAthlete.id) {
        return { ...a, drawNumber: conflictingBall };
      }
      if (a.id === otherAthlete.id) {
        return { ...a, drawNumber: fallbackBall };
      }
      return a;
    });
    triggerAutoSave(nextAthletes, true);
  };

  // Handler Kosongkan Semua Nomor Bola
  const handleClearAllBalls = async () => {
    if (isLocked) return;
    if (
      window.confirm(
        `Kosongkan seluruh nomor bola fisik pada kelas ${division.style} ${division.weightClass}?`
      )
    ) {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      previousBallByAthleteRef.current = {};
      setSyncStatus('SAVING');
      await clearDivisionDrawNumbers(division.id);
      setSyncStatus('SAVED_MYSQL');
      if (athletes[0]) {
        setActiveAthleteId(athletes[0].id);
        setTimeout(() => {
          inputRefs.current[athletes[0].id]?.focus();
        }, 20);
      }
    }
  };

  // Handler Acak Otomatis (Sekunder / Opsional dengan konfirmasi)
  const handleOptionalAutoShuffle = async () => {
    if (isLocked) return;
    if (
      !window.confirm(
        'Jalankan pengacakan nomor otomatis oleh sistem? (Catatan: Ini akan menimpa nomor bola fisik manual yang sudah diketik).'
      )
    ) {
      return;
    }
    setIsShuffling(true);
    setSyncStatus('SAVING');
    await performDrawOnly(division.id, { separateSameRegion: separateRegion });
    setSyncStatus('SAVED_MYSQL');
    setTimeout(() => setIsShuffling(false), 250);
  };

  const handleManualSwapDropdown = async () => {
    if (isLocked || !swapFrom || !swapTo || swapFrom === swapTo) return;
    setSyncStatus('SAVING');
    await swapDrawNumbers(swapFrom, swapTo);
    setSyncStatus('SAVED_MYSQL');
    setSwapFrom('');
    setSwapTo('');
  };

  const handleLock = async () => {
    if (athletes.length < 2) {
      alert('Minimal 2 atlet diperlukan untuk membuat bagan pertandingan!');
      return;
    }
    if (!validation.isValid) {
      alert(
        'Undian belum dapat dikunci! Pastikan seluruh atlet telah memiliki nomor bola fisik unik (1 s.d. N) tanpa duplikat.'
      );
      return;
    }
    await lockAndGenerateBracket(division.id, {
      separateSameRegion: separateRegion,
    });
  };

  const handleUnlock = async () => {
    if (
      window.confirm(
        'PERINGATAN: Membuka kunci undian akan MENGHAPUS seluruh bagan pertandingan dan skor yang sudah tercatat di kelas ini. Lanjutkan?'
      )
    ) {
      if (
        window.confirm(
          'Konfirmasi ganda: Apakah Anda benar-benar yakin ingin mereset bagan?'
        )
      ) {
        await unlockAndResetBracket(division.id);
      }
    }
  };

  const progressPercentage =
    totalAthletes > 0
      ? Math.round((validation.assignedCount / totalAthletes) * 100)
      : 0;

  return (
    <div
      className={
        isPresentationMode
          ? 'fixed inset-0 z-50 bg-slate-950 overflow-y-auto p-6 space-y-5 text-white select-none'
          : 'bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 text-white select-none'
      }
    >
      {/* Top Header: Title, Status Badge, Mode Proyektor & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3
              className={`font-black uppercase tracking-wider text-white ${
                isPresentationMode ? 'text-2xl' : 'text-base'
              }`}
            >
              Input Undian Bola Fisik (Manual Draw Ceremony)
            </h3>

            {isLocked ? (
              <span className="px-3 py-0.5 rounded-full text-xs font-black bg-emerald-950 text-emerald-400 border border-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                UNDIAN &amp; BAGAN TERKUNCI
              </span>
            ) : validation.isValid ? (
              <span className="px-3 py-0.5 rounded-full text-xs font-black bg-emerald-950 text-emerald-300 border border-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                SIAP DIKUNCI ({validation.assignedCount}/{totalAthletes} LENGKAP)
              </span>
            ) : (
              <span className="px-3 py-0.5 rounded-full text-xs font-black bg-amber-950 text-amber-400 border border-amber-800 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                INPUT BOLA FISIK (1..{totalAthletes})
              </span>
            )}
          </div>

          <p
            className={`text-slate-400 mt-1 ${
              isPresentationMode ? 'text-sm' : 'text-xs'
            }`}
          >
            Kelas{' '}
            <strong className="text-white">
              {division.style} {division.ageCategory} — {division.weightClass}
            </strong>{' '}
            • Ketik nomor bola fisik lalu tekan{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[11px] border border-slate-700">
              Enter
            </kbd>{' '}
            atau klik bola pada papan indikator di bawah.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Live Preview */}
          <button
            type="button"
            onClick={() => setShowLivePreview((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border cursor-pointer ${
              showLivePreview
                ? 'bg-sky-950/80 border-sky-600/70 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {showLivePreview ? (
              <Eye className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>Pratinjau Bagan Live</span>
          </button>

          {/* Toggle Mode Proyektor / Technical Meeting */}
          <button
            type="button"
            onClick={() => setIsPresentationMode((v) => !v)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border cursor-pointer ${
              isPresentationMode
                ? 'bg-amber-600 hover:bg-amber-500 border-amber-400 text-slate-950 font-black shadow-lg'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300'
            }`}
            title="Perbesar tampilan untuk layar Proyektor / TV saat Technical Meeting"
          >
            {isPresentationMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Keluar Mode Proyektor</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Tampilan Layar Penuh (Proyektor)</span>
              </>
            )}
          </button>

          {!isLocked ? (
            <>
              {/* Tombol Kosongkan Semua Nomor */}
              <button
                type="button"
                onClick={handleClearAllBalls}
                disabled={validation.assignedCount === 0}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition border border-slate-700 hover:border-rose-800 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Kosongkan Semua Nomor</span>
              </button>

              {/* Tombol Sekunder Opsional: Acak Otomatis */}
              <div className="flex items-center gap-1.5 bg-slate-950/90 px-2.5 py-1 rounded-xl border border-slate-800">
                <label
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 cursor-pointer"
                  title="Pisahkan atlet dari kontingen yang sama saat menggunakan Acak Otomatis"
                >
                  <input
                    type="checkbox"
                    checked={separateRegion}
                    onChange={(e) => setSeparateRegion(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 cursor-pointer"
                  />
                  <span>Pisah Kontingen</span>
                </label>

                <button
                  type="button"
                  onClick={handleOptionalAutoShuffle}
                  disabled={isShuffling}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition border border-slate-700 cursor-pointer"
                  title="Opsional: Biarkan sistem mengacak nomor undian secara otomatis"
                >
                  <Shuffle
                    className={`w-3 h-3 text-sky-400 ${
                      isShuffling ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Acak Otomatis (Opsional)</span>
                </button>
              </div>

              {/* Tombol Utama: Kunci Undian & Buat Bagan (Hanya aktif saat validation.isValid === true) */}
              <button
                type="button"
                onClick={handleLock}
                disabled={!validation.isValid}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition shadow-lg ${
                  validation.isValid
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950 cursor-pointer ring-2 ring-emerald-400/50'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Kunci Undian &amp; Buat Bagan</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleUnlock}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 text-xs font-bold flex items-center gap-1.5 transition border border-slate-700 hover:border-rose-800 cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Buka Kunci Undian (Reset Bagan)</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar Kelengkapan Nomor Bola & Status Validasi */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`font-black uppercase tracking-wider ${
                isPresentationMode ? 'text-base' : 'text-xs'
              } ${
                validation.isValid
                  ? 'text-emerald-400'
                  : validation.duplicateNumbers.length > 0 ||
                    validation.outOfRangeAthleteIds.length > 0
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              Terisi: {validation.assignedCount} / {validation.totalAthletes}{' '}
              Atlet ({progressPercentage}%)
            </span>

            {validation.duplicateNumbers.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700 font-bold text-[11px]">
                Konflik Bola Ganda:{' '}
                {validation.duplicateNumbers.map((n) => `#${n}`).join(', ')}
              </span>
            )}

            {validation.outOfRangeAthleteIds.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700 font-bold text-[11px]">
                Nomor di Luar Rentang (Wajib 1..{totalAthletes})
              </span>
            )}
          </div>

          <div className="text-xs text-slate-400 font-mono flex flex-wrap items-center gap-2.5">
            {/* Indikator Status Auto-Save MySQL */}
            {!isLocked && syncStatus === 'SAVING' && (
              <span className="px-2.5 py-0.5 rounded-full bg-sky-950/90 text-sky-300 border border-sky-700 font-sans font-bold text-[11px] flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Menyimpan...
              </span>
            )}
            {!isLocked && syncStatus === 'SAVED_MYSQL' && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-700 font-sans font-bold text-[11px] flex items-center gap-1.5">
                <Database className="w-3 h-3" />
                Tersimpan di MySQL
              </span>
            )}
            {!isLocked && syncStatus === 'SAVED_LOCAL' && (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-sans font-bold text-[11px] flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-amber-400" />
                Tersimpan Lokal
              </span>
            )}
            {!isLocked && syncStatus === 'CONFLICT' && (
              <span className="px-2.5 py-0.5 rounded-full bg-rose-950/90 text-rose-300 border border-rose-700 font-sans font-bold text-[11px] flex items-center gap-1.5">
                <AlertOctagon className="w-3 h-3" />
                Konflik / luar rentang (belum disinkron ke MySQL)
              </span>
            )}
            {!isLocked && syncStatus === 'ERROR' && (
              <span
                title={syncErrorMsg}
                className="px-2.5 py-0.5 rounded-full bg-rose-950/90 text-rose-300 border border-rose-700 font-sans font-bold text-[11px] flex items-center gap-1.5"
              >
                <AlertTriangle className="w-3 h-3" />
                {syncErrorMsg || 'Gagal sync ke MySQL'}
              </span>
            )}

            {validation.availableNumbers.length > 0 ? (
              <span>
                Bola Belum Ditarik ({validation.availableNumbers.length}):{' '}
                <strong className="text-sky-400">
                  {validation.availableNumbers.map((n) => `#${n}`).join(', ')}
                </strong>
              </span>
            ) : (
              <span className="text-emerald-400 font-bold">
                Seluruh bola #1 s.d. #{totalAthletes} sudah terpakai
              </span>
            )}
          </div>
        </div>

        {/* Bar Visual */}
        <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-200 ${
              validation.isValid
                ? 'bg-emerald-500'
                : validation.duplicateNumbers.length > 0 ||
                  validation.outOfRangeAthleteIds.length > 0
                ? 'bg-rose-500'
                : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, progressPercentage)}%` }}
          />
        </div>
      </div>

      {/* Papan Indikator Bola Fisik (BallTrackerBoard) */}
      {totalAthletes >= 2 && (
        <BallTrackerBoard
          totalAthletes={totalAthletes}
          format={division.format}
          athletes={athletes}
          activeAthlete={activeAthlete}
          isLocked={isLocked}
          isPresentationMode={isPresentationMode}
          onSelectBall={handleSelectBallFromBoard}
        />
      )}

      {/* Area Utama: Tabel Input Bola Fisik (Kiri) + Live Draft Bracket Preview (Kanan/Bawah) */}
      <div
        className={`grid gap-5 ${
          showLivePreview ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1'
        }`}
      >
        {/* Kolom Kiri: Daftar Input Bola Fisik per Atlet */}
        <div
          className={`space-y-3 ${
            showLivePreview ? 'xl:col-span-5' : 'col-span-1'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/70 px-4 py-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-sky-400" />
              <span
                className={`font-black uppercase tracking-wider text-slate-200 ${
                  isPresentationMode ? 'text-sm' : 'text-xs'
                }`}
              >
                Tabel Input Nomor Bola Atlet
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSortByBallNumber((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                sortByBallNumber
                  ? 'bg-sky-950 border-sky-600 text-sky-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
              title="Ubah urutan tampilan baris atlet"
            >
              <ListOrdered className="w-3.5 h-3.5 text-sky-400" />
              <span>
                {sortByBallNumber
                  ? 'Urut Nomor Bola (#1..#N)'
                  : 'Urut Daftar Absen (Stabil)'}
              </span>
            </button>
          </div>

          {/* Daftar Baris Atlet */}
          <div className="space-y-2">
            {displayedAthletes.map((ath, index) => {
              const isRowActive = activeAthlete?.id === ath.id && !isLocked;
              const ballNum = ath.drawNumber;
              const hasBall = ballNum !== undefined && ballNum !== null;
              const isOutOfRange =
                hasBall &&
                (!Number.isInteger(ballNum) ||
                  ballNum < 1 ||
                  ballNum > totalAthletes);
              const isDuplicate =
                hasBall &&
                !isOutOfRange &&
                validation.duplicateNumbers.includes(ballNum);

              // Cari atlet lain yang memegang nomor bola yang sama jika terjadi duplikat
              const conflictingAthletes = isDuplicate
                ? athletes.filter(
                    (other) =>
                      other.id !== ath.id && other.drawNumber === ballNum
                  )
                : [];

              const slotMeta =
                hasBall && !isOutOfRange
                  ? slotMetaByBall.get(ballNum)
                  : undefined;

              const prevBall = previousBallByAthleteRef.current[ath.id];
              const swapBallCandidate =
                prevBall &&
                prevBall >= 1 &&
                prevBall <= totalAthletes &&
                prevBall !== ballNum
                  ? prevBall
                  : validation.availableNumbers[0];

              return (
                <div
                  key={ath.id}
                  onClick={() => {
                    if (!isLocked) {
                      setActiveAthleteId(ath.id);
                    }
                  }}
                  className={`p-3 rounded-2xl border-2 transition ${
                    isDuplicate || isOutOfRange
                      ? 'bg-rose-950/40 border-rose-500 ring-1 ring-rose-500/50'
                      : isRowActive
                      ? 'bg-sky-950/40 border-sky-500 ring-1 ring-sky-400/40 shadow-md'
                      : hasBall
                      ? 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-950/50 border-slate-800/70 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Info Nomor Urut, Logo Kontingen & Nama Atlet */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-6 text-center font-mono text-xs font-bold text-slate-500 shrink-0">
                        {index + 1}.
                      </span>

                      <RegionFlag
                        code={ath.regionCode}
                        regionName={ath.region}
                        size="sm"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-black text-white truncate ${
                              isPresentationMode ? 'text-lg' : 'text-sm'
                            }`}
                          >
                            {ath.name}
                          </span>

                          {ath.seed && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-950 text-amber-400 border border-amber-800/80 shrink-0">
                              SEED #{ath.seed}
                            </span>
                          )}

                          {isRowActive && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/40 uppercase shrink-0">
                              Aktif
                            </span>
                          )}
                        </div>

                        <div
                          className={`text-slate-400 truncate flex flex-wrap items-center gap-1.5 mt-0.5 ${
                            isPresentationMode ? 'text-xs' : 'text-[11px]'
                          }`}
                        >
                          <span className="font-mono text-sky-400 font-bold">
                            {ath.regionCode}
                          </span>
                          <span>•</span>
                          <span>{ath.region}</span>

                          {slotMeta && (
                            <>
                              <span>•</span>
                              <span
                                className={`font-bold ${
                                  slotMeta.zone === 'BYE'
                                    ? 'text-emerald-400'
                                    : slotMeta.zone === 'QUAL'
                                    ? 'text-amber-400'
                                    : 'text-sky-300'
                                }`}
                              >
                                [{slotMeta.zoneLabel}] {slotMeta.slotDescription}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Input Angka Bola Fisik (1..N) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="relative flex items-center">
                        <span className="absolute left-2.5 text-xs font-mono font-bold text-slate-500 pointer-events-none">
                          #
                        </span>
                        <input
                          ref={(el) => {
                            inputRefs.current[ath.id] = el;
                          }}
                          type="number"
                          min={1}
                          max={totalAthletes}
                          disabled={isLocked}
                          placeholder="-"
                          aria-label={`Nomor bola untuk ${ath.name}`}
                          value={ballNum ?? ''}
                          onFocus={() => setActiveAthleteId(ath.id)}
                          onChange={(e) =>
                            handleBallInputChange(ath, e.target.value)
                          }
                          onKeyDown={(e) => handleInputKeyDown(e, ath)}
                          className={`pl-6 pr-2 rounded-xl font-mono font-black text-center border-2 focus:outline-hidden transition ${
                            isPresentationMode
                              ? 'w-24 h-12 text-xl'
                              : 'w-20 h-10 text-base'
                          } ${
                            isDuplicate || isOutOfRange
                              ? 'bg-rose-950 border-rose-500 text-rose-200 focus:ring-2 focus:ring-rose-400'
                              : hasBall
                              ? 'bg-slate-900 border-emerald-600/80 text-emerald-300 focus:border-sky-400'
                              : 'bg-slate-900 border-slate-700 text-white focus:border-sky-400'
                          }`}
                        />
                      </div>

                      {!isLocked && hasBall && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBallInputChange(ath, '');
                          }}
                          title="Kosongkan nomor bola atlet ini"
                          className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800 transition cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Peringatan Inline Duplikat + Tombol 1-Klik Tukar Nomor */}
                  {!isLocked && isDuplicate && conflictingAthletes.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-rose-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-rose-300 font-bold">
                        <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>
                          Bola #{ballNum} juga dipakai oleh{' '}
                          <strong className="text-white">
                            {conflictingAthletes.map((c) => c.name).join(', ')}
                          </strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {conflictingAthletes.map((other) => (
                          <button
                            key={other.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResolveDuplicateConflict(
                                ath,
                                other,
                                ballNum
                              );
                            }}
                            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] flex items-center gap-1 shadow-md cursor-pointer transition"
                          >
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            <span>
                              Tukar Nomor (#{ballNum} ↔{' '}
                              {swapBallCandidate
                                ? `#${swapBallCandidate}`
                                : 'Kosong'}{' '}
                              ke {other.name})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Peringatan Inline Nomor di Luar Rentang */}
                  {!isLocked && isOutOfRange && (
                    <div className="mt-2 pt-2 border-t border-rose-800/80 flex items-center gap-1.5 text-xs text-rose-300 font-bold">
                      <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        Nomor bola #{ballNum} tidak sah! Masukkan angka bulat antara
                        1 sampai {totalAthletes}.
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Alat Tukar Nomor Manual Antar 2 Atlet */}
          {!isLocked && totalAthletes >= 2 && (
            <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
                Tukar Posisi 2 Atlet:
              </span>

              <select
                value={swapFrom}
                onChange={(e) => setSwapFrom(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-hidden flex-1 min-w-[130px]"
              >
                <option value="">Pilih Atlet 1...</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    #{a.drawNumber ?? '?'} - {a.name} ({a.regionCode})
                  </option>
                ))}
              </select>

              <span className="text-slate-500 font-black">↔</span>

              <select
                value={swapTo}
                onChange={(e) => setSwapTo(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 focus:outline-hidden flex-1 min-w-[130px]"
              >
                <option value="">Pilih Atlet 2...</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    #{a.drawNumber ?? '?'} - {a.name} ({a.regionCode})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleManualSwapDropdown}
                disabled={!swapFrom || !swapTo || swapFrom === swapTo}
                className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Tukar Nomor
              </button>
            </div>
          )}
        </div>

        {/* Kolom Kanan: Pratinjau Bagan Langsung (Live Draft Bracket Preview) */}
        {showLivePreview && (
          <div className="xl:col-span-7 space-y-3">
            <BracketViewer
              division={division}
              athletes={athletes}
              previewBouts={isLocked ? undefined : draftBouts}
              isPreview={!isLocked}
            />
          </div>
        )}
      </div>
    </div>
  );
}
