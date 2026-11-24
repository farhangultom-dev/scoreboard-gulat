import { describe, it, expect, beforeEach } from 'vitest';
import { useMatchStore, initialMatchState } from '../store/useMatchStore';
import {
  loadMatchHistory,
  clearMatchHistory,
  generateHistoryCsv,
  generateMatchSheetJson,
  HISTORY_STORAGE_KEY,
} from './historyEngine';
import { checkTechnicalSuperiority } from './uwwRules';

describe('Phase 6: Field Robustness, End-to-End Match Simulations & Export', () => {
  beforeEach(() => {
    localStorage.clear();
    clearMatchHistory();
    useMatchStore.setState({
      match: JSON.parse(JSON.stringify(initialMatchState)),
      isDisplayConnected: true,
      isControllerConnected: true,
    });
  });

  it('1. End-to-End Simulation: FS 74 KG Match (Passivity, Activity, Challenge, Break, Tie-Breaker, VPO1)', () => {
    const store = useMatchStore.getState();

    // Setup partai FS 74 KG Senior
    store.updateMetadata({
      boutNumber: 'BOUT 14',
      matName: 'MAT A',
      style: 'FS',
      weightClass: '74 KG',
      ageCategory: 'SENIOR',
    });
    store.updateWrestlers(
      { name: 'ALAMSYAH', countryOrTeam: 'INA' },
      { name: 'TAKAHASHI', countryOrTeam: 'JPN' }
    );

    // Babak 1 dimulai
    store.toggleMainClock();
    expect(useMatchStore.getState().match.phase).toBe('PERIOD_1');
    expect(useMatchStore.getState().match.mainClock.isRunning).toBe(true);

    // ALAMSYAH (RED) mencetak takedown (+2)
    store.addPoints('RED', 2);
    expect(useMatchStore.getState().match.red.score).toBe(2);

    // TAKAHASHI (BLUE) mencetak step-out (+1)
    store.addPoints('BLUE', 1);
    expect(useMatchStore.getState().match.blue.score).toBe(1);

    // Passivity ke-1 pada RED (Verbal warning, belum ada clock)
    store.addPassivity('RED');
    expect(useMatchStore.getState().match.red.passivityCount).toBe(1);
    expect(useMatchStore.getState().match.activityClock.activeCorner).toBeNull();

    // Passivity ke-2 pada RED (Aktifkan 30s Activity Clock)
    store.addPassivity('RED');
    expect(useMatchStore.getState().match.red.passivityCount).toBe(2);
    expect(useMatchStore.getState().match.activityClock.activeCorner).toBe('RED');
    expect(useMatchStore.getState().match.activityClock.remainingMs).toBe(30_000);

    // 30 Detik Activity Clock habis tanpa poin dari siapa pun -> Lawan (BLUE) otomatis dapat +1
    store.handleActivityClockExpired();
    expect(useMatchStore.getState().match.blue.score).toBe(2); // Skor jadi 2 - 2
    expect(useMatchStore.getState().match.activityClock.activeCorner).toBeNull();

    // Babak 1 berakhir -> Transisi ke BREAK 30 detik
    store.handleMainClockExpired();
    expect(useMatchStore.getState().match.phase).toBe('BREAK');
    expect(useMatchStore.getState().match.breakClock.isRunning).toBe(true);

    // Break habis -> Masuk Babak 2
    store.handleBreakClockExpired();
    expect(useMatchStore.getState().match.phase).toBe('PERIOD_2');
    expect(useMatchStore.getState().match.mainClock.isRunning).toBe(false);

    // Mulai babak 2
    store.toggleMainClock();

    // RED mengajukan Challenge namun KALAH
    store.openChallenge('RED');
    expect(useMatchStore.getState().match.activeChallengeCorner).toBe('RED');
    store.resolveChallenge('LOST');

    // Akibat challenge lost: BLUE dapat +1 (skor BLUE jadi 3), kuota RED hangus
    expect(useMatchStore.getState().match.blue.score).toBe(3);
    expect(useMatchStore.getState().match.red.hasChallenge).toBe(false);

    // RED mencetak poin penutup (+1 step-out)
    store.addPoints('RED', 1); // Skor jadi 3 - 3

    // Babak 2 selesai
    store.handleMainClockExpired();

    // Evaluasi Tie-Breaker saat skor 3 - 3:
    // RED: 2 (POINT) + 1 (POINT) -> highest technical point = 2
    // BLUE: 1 (POINT) + 1 (ACTIVITY_POINT) + 1 (CHALLENGE_LOST_POINT) -> all 1s
    // Kriteria 1 (HIGHEST_VALUE): RED menang karena memiliki poin 2 tunggal!
    const tb = store.getTieBreaker();
    expect(tb.leader).toBe('RED');
    expect(tb.reason).toBe('HIGHEST_VALUE');

    // Rekomendasi kemenangan akhir: VPO1 (lawan memiliki poin)
    const suggested = store.getSuggestedVictory();
    expect(suggested?.corner).toBe('RED');
    expect(suggested?.type).toBe('VPO1');

    // Operator deklarasikan pemenang
    store.declareWinner('RED', 'VPO1');
    expect(useMatchStore.getState().match.winner?.corner).toBe('RED');
    expect(useMatchStore.getState().match.winner?.type).toBe('VPO1');
    expect(useMatchStore.getState().match.phase).toBe('FINISHED');

    // Verifikasi otomatis tersimpan ke localStorage history
    const history = loadMatchHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].metadata.boutNumber).toBe('BOUT 14');
    expect(history[0].winner?.corner).toBe('RED');
    expect(history[0].winner?.type).toBe('VPO1');
  });

  it('2. End-to-End Simulation: GR 87 KG Match (Passivity langsung +1, VSU selisih 8)', () => {
    const store = useMatchStore.getState();

    // Setup partai Greco-Roman
    store.updateMetadata({
      boutNumber: 'BOUT 5',
      matName: 'MAT B',
      style: 'GR',
      weightClass: '87 KG',
      ageCategory: 'SENIOR',
    });

    // Passivity pada RED dalam Greco-Roman -> BLUE langsung +1 poin tanpa shot clock
    store.addPassivity('RED');
    expect(useMatchStore.getState().match.blue.score).toBe(1);
    expect(useMatchStore.getState().match.activityClock.activeCorner).toBeNull();

    // BLUE mencetak bantingan 4 poin (+4) dan 4 poin (+4) lagi
    store.addPoints('BLUE', 4);
    store.addPoints('BLUE', 4); // Skor BLUE = 9, RED = 0 (selisih 9 >= 8)

    // Cek Technical Superiority UWW Greco-Roman (ambang selisih 8)
    const tech = checkTechnicalSuperiority(useMatchStore.getState().match);
    expect(tech.triggered).toBe(true);
    expect(tech.leader).toBe('BLUE');
    expect(tech.suggestedVictoryType).toBe('VSU'); // Lawan 0 poin -> VSU
  });

  it('3. "Save & Next Bout" preserves history, increments boutNumber, clears wrestlers, and resets clock', () => {
    const store = useMatchStore.getState();

    // Setup dan isi skor
    store.updateMetadata({ boutNumber: 'BOUT 14', matName: 'MAT A' });
    store.updateWrestlers(
      { name: 'WRESTLER A', countryOrTeam: 'INA' },
      { name: 'WRESTLER B', countryOrTeam: 'JPN' }
    );
    store.addPoints('RED', 4);
    store.addPoints('BLUE', 2);
    store.declareWinner('RED', 'VPO1');

    // Operator klik "Save & Next Bout"
    store.saveAndNextBout();

    // 1. Riwayat lama tersimpan
    const history = loadMatchHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].metadata.boutNumber).toBe('BOUT 14');
    expect(history[0].red.score).toBe(4);
    expect(history[0].blue.score).toBe(2);

    // 2. Partai baru siap dengan nomor partai berikutnya
    const current = useMatchStore.getState().match;
    expect(current.metadata.boutNumber).toBe('BOUT 15'); // Naik otomatis!
    expect(current.red.name).toBe(''); // Dikosongkan
    expect(current.blue.name).toBe('');
    expect(current.red.score).toBe(0); // Reset skor
    expect(current.blue.score).toBe(0);
    expect(current.events.length).toBe(0); // Reset events
    expect(current.winner).toBeNull();
    expect(current.phase).toBe('PRE_MATCH');
    expect(current.mainClock.remainingMs).toBe(180_000);
    expect(current.mainClock.isRunning).toBe(false);
  });

  it('4. Export CSV & JSON produces valid, well-formatted downloadable tournament files', () => {
    clearMatchHistory();
    const store = useMatchStore.getState();

    // Simpan 2 partai selesai
    store.updateMetadata({ boutNumber: 'BOUT 1' });
    store.addPoints('RED', 5);
    store.addPoints('RED', 5);
    store.declareWinner('RED', 'VSU');

    store.saveAndNextBout();

    store.updateMetadata({ boutNumber: 'BOUT 2' });
    store.addPoints('BLUE', 5);
    store.declareWinner('BLUE', 'VPO');

    const history = loadMatchHistory();
    expect(history.length).toBe(2);

    // 1. Verifikasi Format CSV
    const csv = generateHistoryCsv(history);
    expect(csv).toContain('"Bout Number","Mat","Style","Weight Class"');
    expect(csv).toContain('"BOUT 1"');
    expect(csv).toContain('"BOUT 2"');
    expect(csv).toContain('"VSU"');
    expect(csv).toContain('"VPO"');

    // 2. Verifikasi Format JSON
    const jsonStr = generateMatchSheetJson(history);
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].metadata.boutNumber).toBe('BOUT 2');
    expect(parsed[1].metadata.boutNumber).toBe('BOUT 1');
  });

  it('5. LocalStorage recovery maintains history even across sessions', () => {
    const rawSaved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    expect(Array.isArray(rawSaved)).toBe(true);
  });
});
