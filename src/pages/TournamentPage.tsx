import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy,
  Upload,
  UserPlus,
  Trash2,
  Tv,
  Gamepad2,
  Edit2,
  Users,
  ShieldAlert,
  Layers,
  ArrowRight,
  Download,
  Shuffle,
  LayoutGrid,
  ListOrdered,
  Printer,
  CalendarDays,
  DatabaseBackup,
  FolderUp,
  FileDown,
  Check,
  X,
} from 'lucide-react';
import { useTournamentStore } from '../store/useTournamentStore';
import { Athlete, DivisionFormat } from '../types/tournament';
import CategoryListSidebar from '../components/tournament/CategoryListSidebar';
import ExcelUploadPanel from '../components/tournament/ExcelUploadPanel';
import AthleteTableModal from '../components/tournament/AthleteTableModal';
import DrawCeremonyPanel from '../components/tournament/DrawCeremonyPanel';
import BracketViewer from '../components/tournament/BracketViewer';
import BoutQueueManager from '../components/tournament/BoutQueueManager';
import MySqlStatusBadge from '../components/common/MySqlStatusBadge';
import { downloadAthleteTemplate } from '../engine/excelImporter';
import { generateDivisionBouts } from '../engine/uwwBracketEngine';
import { validateManualDraw } from '../engine/uwwManualDraw';
import {
  downloadAllBracketsPdf,
  downloadDivisionBracketPdf,
  printAllBracketsPdf,
  printBoutQueuePdf,
  printDivisionBracketPdf,
  printDivisionRosterPdf,
} from '../engine/bracketPdfExporter';

type CategoryTab = 'BRACKET' | 'DRAW' | 'ROSTER' | 'QUEUE';

export default function TournamentPage() {
  const {
    athletes,
    divisions,
    bouts,
    tournamentName,
    selectedDivisionId,
    isLoading,
    loadFromIndexedDB,
    setTournamentName,
    deleteAthlete,
    setDivisionMat,
    setDivisionFormat,
    clearDivision,
    resetTournament,
    exportTournamentBackup,
    restoreTournamentBackup,
  } = useTournamentStore();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAthleteModalOpen, setIsAthleteModalOpen] = useState(false);
  const [athleteToEdit, setAthleteToEdit] = useState<Athlete | null>(null);
  const [activeTab, setActiveTab] = useState<CategoryTab>('BRACKET');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isEditingEventName, setIsEditingEventName] = useState(false);
  const [eventNameDraft, setEventNameDraft] = useState(tournamentName);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditingEventName) {
      setEventNameDraft(tournamentName);
    }
  }, [tournamentName, isEditingEventName]);

  const handleSaveEventName = async () => {
    const clean = eventNameDraft.trim();
    if (clean) {
      await setTournamentName(clean);
    } else {
      setEventNameDraft(tournamentName);
    }
    setIsEditingEventName(false);
  };

  const handleBackupDownload = async () => {
    try {
      await exportTournamentBackup();
    } catch (err) {
      alert(
        `Gagal mengekspor backup turnamen: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    }
  };

  const handleRestoreFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await restoreTournamentBackup(parsed);
      alert('Backup turnamen (.json) berhasil di-restore ke database MySQL lokal!');
    } catch (err) {
      alert(
        `Gagal me-restore file backup: ${
          err instanceof Error ? err.message : 'File JSON tidak valid'
        }`
      );
    } finally {
      if (restoreInputRef.current) {
        restoreInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    loadFromIndexedDB();
  }, [loadFromIndexedDB]);

  const activeDivision = selectedDivisionId ? divisions[selectedDivisionId] : null;
  const divisionAthletes: Athlete[] =
    activeDivision && Array.isArray(activeDivision.athleteIds)
      ? activeDivision.athleteIds
          .map((id) => athletes[id])
          .filter((a): a is Athlete => Boolean(a))
      : [];

  // Update tab default when switching categories or draw lock state
  useEffect(() => {
    if (activeDivision) {
      if (!activeDivision.isDrawLocked && activeDivision.athleteIds.length >= 2) {
        // If not locked yet and has athletes, show DRAW tab
        setActiveTab('DRAW');
      } else if (!activeDivision.isDrawLocked) {
        setActiveTab('ROSTER');
      } else {
        setActiveTab('BRACKET');
      }
    }
  }, [activeDivision?.id, activeDivision?.isDrawLocked]);

  const handleEditAthlete = (ath: Athlete) => {
    setAthleteToEdit(ath);
    setIsAthleteModalOpen(true);
  };

  const handleAddNewAthlete = () => {
    setAthleteToEdit(null);
    setIsAthleteModalOpen(true);
  };

  const handleDeleteAthlete = async (ath: Athlete) => {
    if (
      window.confirm(
        `Hapus atlet "${ath.name}" (${ath.region}) dari kategori ${ath.weightClass}?`
      )
    ) {
      await deleteAthlete(ath.id);
    }
  };

  const handleClearCurrentDivision = async () => {
    if (!activeDivision) return;
    if (
      window.confirm(
        `Kosongkan seluruh atlet pada kelas ${activeDivision.style} ${activeDivision.ageCategory} ${activeDivision.weightClass}?`
      )
    ) {
      await clearDivision(activeDivision.id);
    }
  };

  const handleResetAllTournament = async () => {
    if (
      window.confirm(
        'PERINGATAN KERAS: Tindakan ini akan MENGHAPUS SELURUH data atlet, kategori, partai, dan pengaturan turnamen dari database turnamen. Lanjutkan?'
      )
    ) {
      await resetTournament();
    }
  };

  const totalAthletesCount = Object.keys(athletes).length;
  const totalDivisionsCount = Object.keys(divisions).length;

  const resolveDivisionPdfEntry = (div: (typeof divisions)[string]) => {
    const divAthletes = div.athleteIds
      .map((id) => athletes[id])
      .filter((a): a is Athlete => Boolean(a));
    const realBouts = Object.values(bouts).filter((b) => b.divisionId === div.id);
    if (realBouts.length > 0) {
      return {
        division: div,
        athletes: divAthletes,
        bouts: realBouts,
        tournamentName,
        isDraft: false,
      };
    }

    if (divAthletes.length >= 2 && validateManualDraw(divAthletes).isValid) {
      return {
        division: div,
        athletes: divAthletes,
        bouts: generateDivisionBouts(div, divAthletes),
        tournamentName,
        isDraft: true,
      };
    }

    return null;
  };

  const printableAllDivisions = Object.values(divisions)
    .map(resolveDivisionPdfEntry)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => {
      const styleCmp = a.division.style.localeCompare(b.division.style);
      if (styleCmp !== 0) return styleCmp;
      const ageCmp = a.division.ageCategory.localeCompare(b.division.ageCategory);
      if (ageCmp !== 0) return ageCmp;
      const numA = parseFloat(a.division.weightClass.replace(/[^0-9.]/g, '')) || 0;
      const numB = parseFloat(b.division.weightClass.replace(/[^0-9.]/g, '')) || 0;
      return numA - numB;
    });

  const handleDownloadActiveBracketPdf = async () => {
    if (!activeDivision || isExportingPdf) return;
    const entry = resolveDivisionPdfEntry(activeDivision);
    if (!entry) {
      alert(
        'Selesaikan pengundian (Draw) minimal 2 atlet pada kelas ini terlebih dahulu sebelum mengunduh bagan PDF.'
      );
      return;
    }

    setIsExportingPdf(true);
    try {
      await downloadDivisionBracketPdf(entry);
    } catch (err) {
      alert(
        `Gagal mengekspor bagan PDF: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadAllBracketsPdf = async () => {
    if (isExportingPdf) return;
    if (printableAllDivisions.length === 0) {
      alert('Belum ada kelas yang sudah diundi (Draw) untuk diunduh.');
      return;
    }
    setIsExportingPdf(true);
    try {
      await downloadAllBracketsPdf({
        tournamentName,
        divisions: printableAllDivisions,
      });
    } catch (err) {
      alert(
        `Gagal mengekspor seluruh bagan PDF: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintAllBracketsPdf = async () => {
    if (isExportingPdf) return;
    if (printableAllDivisions.length === 0) {
      alert('Belum ada kelas yang sudah diundi (Draw) untuk dicetak.');
      return;
    }
    setIsExportingPdf(true);
    try {
      await printAllBracketsPdf({
        tournamentName,
        divisions: printableAllDivisions,
      });
    } catch (err) {
      alert(
        `Gagal menyiapkan cetak seluruh bagan: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintCurrentView = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      if (activeTab === 'QUEUE') {
        const allBoutsList = Object.values(bouts);
        if (allBoutsList.length === 0) {
          alert('Belum ada daftar partai untuk dicetak.');
          return;
        }
        await printBoutQueuePdf({
          bouts: allBoutsList,
          athletes,
          divisions,
          tournamentName,
        });
        return;
      }

      if (activeTab === 'ROSTER' && activeDivision) {
        if (divisionAthletes.length === 0) {
          alert('Belum ada peserta pada kelas ini untuk dicetak.');
          return;
        }
        await printDivisionRosterPdf({
          division: activeDivision,
          athletes: divisionAthletes,
          tournamentName,
        });
        return;
      }

      if (activeDivision) {
        const entry = resolveDivisionPdfEntry(activeDivision);
        if (!entry) {
          alert(
            'Selesaikan pengundian (Draw) minimal 2 atlet pada kelas ini terlebih dahulu sebelum mencetak bagan.'
          );
          return;
        }

        await printDivisionBracketPdf(entry);
        return;
      }

      window.print();
    } catch (err) {
      alert(
        `Gagal menyiapkan dokumen cetak: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-white font-sans">
      {/* Top Navbar */}
      <header className="min-h-14 px-4 md:px-5 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
        {/* Left: Brand Identity & MySQL Status */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
            <Trophy className="w-4 h-4" />
          </div>
          <div className="shrink-0">
            <h1 className="text-sm font-black uppercase tracking-wider text-white whitespace-nowrap leading-tight">
              UWW Tournament Secretariat
            </h1>
            {isEditingEventName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveEventName();
                }}
                className="flex items-center gap-1 mt-0.5"
              >
                <input
                  type="text"
                  value={eventNameDraft}
                  onChange={(e) => setEventNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEventNameDraft(tournamentName);
                      setIsEditingEventName(false);
                    }
                  }}
                  autoFocus
                  maxLength={80}
                  placeholder="Nama Pertandingan / Event"
                  className="bg-slate-950 border border-amber-500/70 rounded px-1.5 py-0.5 text-[11px] font-bold text-amber-300 w-52 focus:outline-hidden"
                />
                <button
                  type="submit"
                  className="p-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                  title="Simpan Nama Event"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEventNameDraft(tournamentName);
                    setIsEditingEventName(false);
                  }}
                  className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                  title="Batal"
                >
                  <X className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEventNameDraft(tournamentName);
                  setIsEditingEventName(true);
                }}
                className="group flex items-center gap-1.5 text-[10px] text-amber-300 hover:text-amber-200 font-bold tracking-wider whitespace-nowrap leading-tight cursor-pointer mt-0.5"
                title="Klik untuk mengubah nama pertandingan/event (otomatis tampil di PDF bagan)"
              >
                <span>{tournamentName}</span>
                <Edit2 className="w-2.5 h-2.5 text-slate-400 group-hover:text-amber-300 transition shrink-0" />
              </button>
            )}
          </div>
          <div className="h-5 w-px bg-slate-800 mx-0.5 hidden sm:block" />
          <MySqlStatusBadge />
        </div>

        {/* Right: Structured Action Toolbar & Navigation Menu */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Primary Athlete Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Import Excel</span>
            </button>

            <button
              type="button"
              onClick={handleAddNewAthlete}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>Tambah Atlet</span>
            </button>
          </div>

          {/* Group 1: Backup, Restore & Reset */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={handleBackupDownload}
              className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              title="Backup Turnamen (.json)"
            >
              <DatabaseBackup className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Backup (.json)</span>
            </button>

            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-sky-300 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              title="Restore Backup Turnamen (.json) ke MySQL"
            >
              <FolderUp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Restore</span>
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleRestoreFileChange}
              className="hidden"
            />

            <div className="h-3.5 w-px bg-slate-800" />

            <button
              type="button"
              onClick={handleResetAllTournament}
              className="px-2.5 py-1 rounded-lg hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
              title="Reset Seluruh Data Turnamen"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Reset</span>
            </button>
          </div>

          {/* Group 2: Screen Navigation & Print */}
          <nav className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800 shrink-0">
            <Link
              to="/controller"
              className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0"
              title="Buka Layar Operator Controller"
            >
              <Gamepad2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Controller</span>
            </Link>

            <Link
              to="/display"
              target="_blank"
              className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition whitespace-nowrap shrink-0"
              title="Buka Layar TV Scoreboard (Tab Baru)"
            >
              <Tv className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>TV Display</span>
            </Link>

            <button
              type="button"
              onClick={() => window.open('/schedule', 'UWW_SCHEDULE_TV', 'width=1280,height=720')}
              className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
              title="Buka Layar TV Jadwal & Antrean Pertandingan"
            >
              <CalendarDays className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Schedule TV</span>
            </button>

            <div className="h-3.5 w-px bg-slate-800" />

            {printableAllDivisions.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAllBracketsPdf}
                disabled={isExportingPdf}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                title={`Download bagan seluruh kelas (${printableAllDivisions.length} kelas) ke dalam 1 file PDF`}
              >
                <FileDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Semua PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintAllBracketsPdf}
              disabled={isExportingPdf || printableAllDivisions.length === 0}
              className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              title={`Cetak bagan seluruh kelas (${printableAllDivisions.length} kelas) dalam 1 dokumen resmi UWW Arena`}
            >
              <Printer className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{isExportingPdf ? 'Menyiapkan...' : 'Print Semua'}</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Kategori Tanding */}
        <CategoryListSidebar />

        {/* Right Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-4 md:p-6">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm animate-pulse">
              Memuat data turnamen dari IndexedDB...
            </div>
          ) : activeDivision ? (
            <div className="flex-1 flex flex-col overflow-hidden space-y-4">
              {/* Category Detail Header Card */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wider uppercase ${
                        activeDivision.style === 'FS'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/80'
                          : activeDivision.style === 'GR'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                          : 'bg-rose-950 text-rose-400 border border-rose-800/80'
                      }`}
                    >
                      {activeDivision.style === 'FS'
                        ? 'Freestyle (FS)'
                        : activeDivision.style === 'GR'
                        ? 'Greco-Roman (GR)'
                        : "Women's (WW)"}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      {activeDivision.ageCategory}
                    </span>
                  </div>

                  <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white mt-1">
                    Kelas {activeDivision.weightClass}
                  </h2>
                </div>

                {/* Division Controls (Format, Matras, Quick Add) */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Format Bagan Selector */}
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 font-semibold uppercase">Format:</span>
                    <select
                      value={activeDivision.format}
                      onChange={(e) =>
                        setDivisionFormat(activeDivision.id, e.target.value as DivisionFormat)
                      }
                      className="bg-transparent font-bold text-sky-400 focus:outline-hidden cursor-pointer"
                    >
                      <option value="SINGLE_BOUT" className="bg-slate-900 text-white">
                        Single Bout (N=2)
                      </option>
                      <option value="NORDIC" className="bg-slate-900 text-white">
                        Nordic Round-Robin (N=3..5)
                      </option>
                      <option value="GROUP_CROSS" className="bg-slate-900 text-white">
                        2-Pool Group + Cross (N=6..7)
                      </option>
                      <option value="ELIMINATION_REPECHAGE" className="bg-slate-900 text-white">
                        Direct Elimination + Repechage (N≥8)
                      </option>
                    </select>
                  </div>

                  {/* Mat Assignment */}
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 font-semibold uppercase">Matras:</span>
                    <select
                      value={activeDivision.assignedMat}
                      onChange={(e) =>
                        setDivisionMat(activeDivision.id, e.target.value)
                      }
                      className="bg-transparent font-bold text-amber-400 focus:outline-hidden cursor-pointer"
                    >
                      <option value="MAT A" className="bg-slate-900 text-white">MAT A</option>
                      <option value="MAT B" className="bg-slate-900 text-white">MAT B</option>
                      <option value="MAT C" className="bg-slate-900 text-white">MAT C</option>
                      <option value="MAT D" className="bg-slate-900 text-white">MAT D</option>
                    </select>
                  </div>

                  {/* Download Bracket PDF per Kelas */}
                  <button
                    type="button"
                    onClick={handleDownloadActiveBracketPdf}
                    disabled={isExportingPdf || divisionAthletes.length < 2}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Download Bagan Resmi Kelas Ini (PDF format UWW Arena)"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>{isExportingPdf ? 'Membuat PDF...' : 'Download PDF'}</span>
                  </button>

                  {/* Print per Kelas / Tab Aktif */}
                  <button
                    type="button"
                    onClick={handlePrintCurrentView}
                    disabled={
                      isExportingPdf ||
                      (activeTab !== 'QUEUE' &&
                        activeTab !== 'ROSTER' &&
                        divisionAthletes.length < 2)
                    }
                    className="px-3 py-1.5 rounded-xl bg-amber-600/25 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      activeTab === 'QUEUE'
                        ? 'Cetak Daftar Antrean Partai Resmi (Format UWW Arena)'
                        : activeTab === 'ROSTER'
                        ? 'Cetak Daftar Peserta Resmi Kelas Ini (Format UWW Arena)'
                        : 'Cetak Bagan Resmi Kelas Ini (Format UWW Arena)'
                    }
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>

                  {/* Quick Add Athlete */}
                  <button
                    type="button"
                    onClick={handleAddNewAthlete}
                    className="px-3 py-1.5 rounded-xl bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Tambah Atlet</span>
                  </button>

                  {/* Clear Division */}
                  <button
                    type="button"
                    onClick={handleClearCurrentDivision}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800 transition cursor-pointer"
                    title="Kosongkan Atlet di Kategori Ini"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* View Tabs Bar: BAGAN | PENGUNDIAN | DAFTAR ATLET */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('BRACKET')}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
                    activeTab === 'BRACKET'
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-950'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>Bagan Pertandingan</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('DRAW')}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
                    activeTab === 'DRAW'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-950'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Shuffle className="w-4 h-4" />
                  <span>Upacara Pengundian (Draw)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('ROSTER')}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
                    activeTab === 'ROSTER'
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Daftar Peserta ({divisionAthletes.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('QUEUE')}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer ${
                    activeTab === 'QUEUE'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ListOrdered className="w-4 h-4" />
                  <span>Antrean Partai (Master Queue)</span>
                </button>
              </div>

              {/* Tab Content Display Area */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'QUEUE' && <BoutQueueManager />}

                {activeTab === 'BRACKET' && (
                  <BracketViewer
                    division={activeDivision}
                    athletes={divisionAthletes}
                  />
                )}

                {activeTab === 'DRAW' && (
                  <DrawCeremonyPanel
                    division={activeDivision}
                    athletes={divisionAthletes}
                  />
                )}

                {activeTab === 'ROSTER' && (
                  /* Roster Table */
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-xl">
                    <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-sky-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                          Daftar Peserta Terdaftar ({divisionAthletes.length} Atlet)
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Sistem: <strong className="text-white">{activeDivision.format}</strong>
                      </span>
                    </div>

                    <div className="overflow-y-auto">
                      {divisionAthletes.length === 0 ? (
                        <div className="py-20 text-center text-slate-500 text-sm space-y-3">
                          <p>Belum ada atlet terdaftar di kategori ini.</p>
                          <button
                            type="button"
                            onClick={handleAddNewAthlete}
                            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                          >
                            <UserPlus className="w-4 h-4" />
                            <span>Tambah Atlet Pertama</span>
                          </button>
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 sticky top-0 font-bold uppercase tracking-wider border-b border-slate-800">
                            <tr>
                              <th className="py-2.5 px-4 w-12 text-center">#</th>
                              <th className="py-2.5 px-4">Nama Pegulat</th>
                              <th className="py-2.5 px-4">Daerah / Kontingen</th>
                              <th className="py-2.5 px-4 text-center">Kode TV</th>
                              <th className="py-2.5 px-4 text-center">Seed</th>
                              <th className="py-2.5 px-4 text-center">No. Undian</th>
                              <th className="py-2.5 px-4 text-right w-24">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-300">
                            {divisionAthletes.map((ath, idx) => (
                              <tr
                                key={ath.id}
                                className="hover:bg-slate-800/40 transition group"
                              >
                                <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-500">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-4 font-bold text-white text-sm">
                                  {ath.name}
                                </td>
                                <td className="py-2.5 px-4 font-semibold text-slate-300">
                                  {ath.region}
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <span className="font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 text-sky-400 border border-slate-700">
                                    {ath.regionCode}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  {ath.seed ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-400 border border-amber-800">
                                      SEED #{ath.seed}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-400">
                                  {ath.drawNumber ?? '-'}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition">
                                    <button
                                      type="button"
                                      onClick={() => handleEditAthlete(ath)}
                                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white transition cursor-pointer"
                                      title="Edit Atlet (Weigh-in)"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAthlete(ath)}
                                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
                                      title="Hapus Atlet"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Dashboard Saat Belum Ada Kategori Dipilih atau Turnamen Baru */
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-6 max-w-xl mx-auto">
              <div className="p-4 rounded-3xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <Trophy className="w-12 h-12" />
              </div>

              <div>
                <h2 className="text-2xl font-black uppercase tracking-wider text-white">
                  Selamat Datang di Sekretariat Turnamen UWW
                </h2>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Mulai manajemen turnamen gulat resmi dengan mengunggah daftar atlet melalui template Excel standar, atau tambah atlet secara mandiri per kelas timbang badan.
                </p>
              </div>

              {/* Status Turnamen Singkat */}
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                    <Users className="w-4 h-4 text-sky-400" />
                    <span>Total Atlet</span>
                  </div>
                  <div className="text-2xl font-black text-sky-400 mt-1">
                    {totalAthletesCount}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Total Kelas</span>
                  </div>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    {totalDivisionsCount}
                  </div>
                </div>
              </div>

              {/* Action Prompts */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Bulk Import Excel</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={downloadAthleteTemplate}
                  className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition border border-slate-700 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-sky-400" />
                  <span>Download Template</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                <span>Seluruh data turnamen tersimpan aman secara offline di IndexedDB browser Anda.</span>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <ExcelUploadPanel
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />

      <AthleteTableModal
        isOpen={isAthleteModalOpen}
        onClose={() => {
          setIsAthleteModalOpen(false);
          setAthleteToEdit(null);
        }}
        athleteToEdit={athleteToEdit}
        defaultStyle={activeDivision?.style}
        defaultAgeCategory={activeDivision?.ageCategory}
        defaultWeightClass={activeDivision?.weightClass}
      />
    </div>
  );
}
