import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import TournamentPage from './TournamentPage';
import { useTournamentStore } from '../store/useTournamentStore';

describe('TournamentPage', () => {
  beforeEach(() => {
    useTournamentStore.setState({
      athletes: {},
      divisions: {},
      bouts: {},
      orderOfBouts: [],
      selectedDivisionId: null,
      isLoading: false,
    });
  });

  it('renders without crashing when store is empty', () => {
    render(
      <BrowserRouter>
        <TournamentPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/UWW Tournament Secretariat/i)).toBeDefined();
    expect(screen.getByText(/Selamat Datang di Sekretariat Turnamen UWW/i)).toBeDefined();
  });

  it('renders with active division selected', () => {
    useTournamentStore.setState({
      divisions: {
        'FS_SENIOR_74 KG': {
          id: 'FS_SENIOR_74 KG',
          style: 'FS',
          ageCategory: 'SENIOR',
          weightClass: '74 KG',
          athleteIds: ['ath-1', 'ath-2'],
          format: 'SINGLE_BOUT',
          assignedMat: 'MAT A',
          isDrawLocked: false,
        },
      },
      athletes: {
        'ath-1': {
          id: 'ath-1',
          name: 'Eko',
          region: 'Lampung',
          regionCode: 'LPG',
          style: 'FS',
          ageCategory: 'SENIOR',
          weightClass: '74 KG',
        },
        'ath-2': {
          id: 'ath-2',
          name: 'Rizky',
          region: 'Jawa Barat',
          regionCode: 'JBR',
          style: 'FS',
          ageCategory: 'SENIOR',
          weightClass: '74 KG',
        },
      },
      selectedDivisionId: 'FS_SENIOR_74 KG',
      isLoading: false,
    });

    render(
      <BrowserRouter>
        <TournamentPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Kelas 74 KG/i)).toBeDefined();
    expect(screen.getAllByText(/Download.*PDF/i).length).toBeGreaterThanOrEqual(1);
  });
});
