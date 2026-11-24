import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { normalizeRegionCode, getRegionFlagUrl } from '../../utils/flagHelper';
import RegionFlag from './RegionFlag';

describe('Step 1 & 2: flagHelper & RegionFlag', () => {
  it('normalizes region codes and builds /flags/<CODE>.png URLs', () => {
    expect(normalizeRegionCode(' lpg ')).toBe('LPG');
    expect(normalizeRegionCode('jbr')).toBe('JBR');
    expect(normalizeRegionCode('SUMUT 01')).toBe('SUMUT01');
    expect(normalizeRegionCode('')).toBe('');
    expect(normalizeRegionCode(null)).toBe('');

    expect(getRegionFlagUrl('jbr')).toBe('/flags/JBR.png');
    expect(getRegionFlagUrl('  dki  ')).toBe('/flags/DKI.png');
    expect(getRegionFlagUrl(undefined)).toBeNull();
  });

  it('falls back gracefully on image error and resets hasError when code prop changes', () => {
    const { rerender } = render(<RegionFlag code="XXX" size="md" />);

    const initialImg = screen.getByRole('img', { name: 'XXX' }) as HTMLImageElement;
    expect(initialImg.getAttribute('src')).toBe('/flags/XXX.png');

    // Simulasikan file /flags/XXX.png tidak ditemukan -> tampilkan badge teks "XXX"
    fireEvent.error(initialImg);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('XXX')).toBeDefined();

    // Ubah prop code ke "LPG" -> state hasError harus ter-reset sehingga gambar baru langsung dirender
    rerender(<RegionFlag code="LPG" regionName="Lampung" size="tv" />);
    const nextImg = screen.getByRole('img', { name: 'Lampung' }) as HTMLImageElement;
    expect(nextImg.getAttribute('src')).toBe('/flags/LPG.png');
  });

  it('returns null when image fails and showFallbackText is false', () => {
    const { container } = render(
      <RegionFlag code="MISSING" showFallbackText={false} />
    );
    const img = screen.getByRole('img', { name: 'MISSING' });
    fireEvent.error(img);
    expect(container.firstChild).toBeNull();
  });
});
