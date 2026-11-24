import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DisplayPage from '../../pages/DisplayPage';
import MiniPreview from '../controller/MiniPreview';
import { useMatchStore, initialMatchState } from '../../store/useMatchStore';
import { MatchState } from '../../types/match';

describe('Phase 5: Olympic Broadcast TV Display UI', () => {
  beforeEach(() => {
    localStorage.clear();
    useMatchStore.setState({
      match: JSON.parse(JSON.stringify(initialMatchState)),
      isDisplayConnected: true,
      isControllerConnected: true,
    });
  });

  it('renders UWW pre-match intro screen when match has not started (PRE_MATCH) and official header strip once started (PERIOD_1)', () => {
    const { unmount } = render(<DisplayPage />);

    // Pre-Match Intro View: FS 74 | 14 | Qualif. | INA | RED WRESTLER | JPN | BLUE WRESTLER
    expect(screen.getByText('FS 74')).toBeDefined();
    expect(screen.getByText('14')).toBeDefined();
    expect(screen.getByText('Qualif.')).toBeDefined();
    expect(screen.getByText('RED WRESTLER')).toBeDefined();
    expect(screen.getByText('BLUE WRESTLER')).toBeDefined();
    unmount();

    // Once match transitions to PERIOD_1, renders live scoreboard header strip
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        phase: 'PERIOD_1',
      },
    }));

    render(<DisplayPage />);
    expect(screen.getByText('MAT A')).toBeDefined();
    expect(screen.getByText('BOUT 14')).toBeDefined();
    expect(screen.getByText(/FREESTYLE • 74 KG • SENIOR/i)).toBeDefined();
    expect(screen.getByText('PERIOD 1')).toBeDefined();
  });

  it('renders dominant scores and names for both RED and BLUE', () => {
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        red: { ...s.match.red, name: 'HADI PURBAYA', countryOrTeam: 'INA', score: 8 },
        blue: { ...s.match.blue, name: 'KENJI SATO', countryOrTeam: 'JPN', score: 3 },
      },
    }));

    render(<DisplayPage />);

    expect(screen.getByText('HADI PURBAYA')).toBeDefined();
    expect(screen.getByText('INA')).toBeDefined();
    expect(screen.getByText('8')).toBeDefined();

    expect(screen.getByText('KENJI SATO')).toBeDefined();
    expect(screen.getByText('JPN')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('renders CRITERIA LEADER indicator on tie-breaker', () => {
    // 4 - 4 tie, RED has a single 4-pointer
    const tiedMatch: MatchState = {
      ...initialMatchState,
      red: { ...initialMatchState.red, score: 4 },
      blue: { ...initialMatchState.blue, score: 4 },
      events: [
        {
          id: '1',
          timestamp: Date.now(),
          period: 1,
          matchClockMs: 120_000,
          corner: 'RED',
          type: 'POINT',
          points: 4,
        },
        {
          id: '2',
          timestamp: Date.now(),
          period: 1,
          matchClockMs: 100_000,
          corner: 'BLUE',
          type: 'POINT',
          points: 2,
        },
        {
          id: '3',
          timestamp: Date.now(),
          period: 1,
          matchClockMs: 80_000,
          corner: 'BLUE',
          type: 'POINT',
          points: 2,
        },
      ],
    };

    useMatchStore.setState({ match: tiedMatch });

    render(<DisplayPage />);
    expect(screen.getByText('CRITERIA LEADER')).toBeDefined();
  });

  it('renders 30s Activity Clock box when active with direction arrow', () => {
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        activityClock: {
          remainingMs: 24_000,
          isRunning: true,
          lastSyncedAt: Date.now(),
          activeCorner: 'RED',
        },
      },
    }));

    render(<DisplayPage />);
    expect(screen.getByText(/ACTIVITY 0:24/i)).toBeDefined();
  });

  it('renders CHALLENGE REVIEW overlay in corner scoreboard style with region code and athlete name', () => {
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        activeChallengeCorner: 'RED',
        red: { ...s.match.red, name: 'UMAR NUGRAHA', countryOrTeam: 'LBR' },
      },
    }));

    render(<DisplayPage />);
    const overlay = screen.getByTestId('challenge-scoreboard-overlay');
    expect(overlay.getAttribute('data-corner')).toBe('RED');
    expect(screen.getByText(/CHALLENGE — RED CORNER/i)).toBeDefined();
    expect(screen.getByText(/JURY \/ VIDEO REVIEW/i)).toBeDefined();
    expect(screen.getAllByText('LBR').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('UMAR NUGRAHA').length).toBeGreaterThanOrEqual(1);
  });

  it('renders BREAK banner overlay during break period', () => {
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        phase: 'BREAK',
        breakClock: {
          remainingMs: 28_000,
          isRunning: true,
          lastSyncedAt: Date.now(),
        },
      },
    }));

    render(<DisplayPage />);
    expect(screen.getByText(/BREAK \(ISTIRAHAT\)/i)).toBeDefined();
  });

  it('renders WINNER announcement overlay in scoreboard style with corner color, region code, and athlete name', () => {
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        phase: 'FINISHED',
        winner: {
          corner: 'RED',
          type: 'VSU',
        },
        red: { ...s.match.red, name: 'CHAMPION RED', countryOrTeam: 'LPG', score: 10 },
        blue: { ...s.match.blue, score: 0 },
      },
    }));

    render(<DisplayPage />);
    const overlay = screen.getByTestId('winner-scoreboard-overlay');
    expect(overlay.getAttribute('data-corner')).toBe('RED');
    expect(screen.getByText(/WINNER BY TECHNICAL SUPERIORITY \(VSU\)/i)).toBeDefined();
    expect(screen.getAllByText('CHAMPION RED').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('LPG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/SKOR AKHIR: 10 - 0/i)).toBeDefined();
  });

  it('renders PORPROV X LAMPUNG 2026 event banner with logo below match clock without NEXT UP wording', () => {
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        phase: 'PERIOD_1',
        nextBoutPreview: {
          boutNumber: 15,
          divisionLabel: 'FS 74 KG',
          redName: 'AHMAD',
          redRegion: 'LPG',
          blueName: 'RIZKY',
          blueRegion: 'JBR',
        },
      },
    }));

    render(<DisplayPage />);
    expect(screen.getByText(/PORPROV X LAMPUNG 2026/i)).toBeDefined();
    expect(screen.getByAltText(/Logo Porprov X Lampung 2026/i)).toBeDefined();
    expect(screen.queryByText(/NEXT UP:/i)).toBeNull();
  });

  it('renders full-screen IntermissionView with 30:00 countdown and next bout preview when intermission is active', () => {
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        intermission: {
          isActive: true,
          title: 'ISTIRAHAT PERTANDINGAN',
          subtitle: 'Pertandingan akan dilanjutkan kembali dalam:',
          timer: {
            remainingMs: 30 * 60 * 1000,
            isRunning: false,
            lastSyncedAt: null,
          },
        },
        nextBoutPreview: {
          boutNumber: 16,
          divisionLabel: 'FS 74 KG',
          redName: 'BUDI SANTOSO',
          redRegion: 'JBR',
          blueName: 'RAHMAT HIDAYAT',
          blueRegion: 'JTM',
        },
      },
    }));

    render(<DisplayPage />);
    expect(screen.getByText('ISTIRAHAT PERTANDINGAN')).toBeDefined();
    expect(screen.getByText('30:00')).toBeDefined();
    expect(screen.getByText(/PORPROV X LAMPUNG 2026/i)).toBeDefined();
    expect(screen.getByText(/PERTANDINGAN SELANJUTNYA/i)).toBeDefined();
    expect(screen.getByText('BUDI SANTOSO')).toBeDefined();
    expect(screen.getByText('RAHMAT HIDAYAT')).toBeDefined();
  });

  it('renders Challenge and Declare Winner in MiniPreview matching TV scoreboard corner style', () => {
    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        activeChallengeCorner: 'BLUE',
        blue: { ...s.match.blue, name: 'VINO MAHENDRA', countryOrTeam: 'LSL' },
      },
    }));

    const { unmount } = render(<MiniPreview />);
    const challengeOverlay = screen.getByTestId('mini-challenge-scoreboard-overlay');
    expect(challengeOverlay.getAttribute('data-corner')).toBe('BLUE');
    expect(screen.getAllByText('LSL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('VINO MAHENDRA').length).toBeGreaterThanOrEqual(1);
    unmount();

    useMatchStore.setState((s) => ({
      match: {
        ...s.match,
        phase: 'FINISHED',
        activeChallengeCorner: null,
        winner: { corner: 'RED', type: 'VFA' },
        red: { ...s.match.red, name: 'UMAR NUGRAHA', countryOrTeam: 'LBR', score: 6 },
        blue: { ...s.match.blue, score: 2 },
      },
    }));

    render(<MiniPreview />);
    const winnerOverlay = screen.getByTestId('mini-winner-scoreboard-overlay');
    expect(winnerOverlay.getAttribute('data-corner')).toBe('RED');
    expect(screen.getAllByText('LBR').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('UMAR NUGRAHA').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/SKOR AKHIR: 6 - 2/i)).toBeDefined();
  });
});
