import { randomUUID } from 'node:crypto';
import { Bout as PrismaBout, Athlete as PrismaAthlete, Division as PrismaDivision } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middlewares/errorHandler';
import {
  Athlete as SharedAthlete,
  BoutRound,
  CategoryDivision,
  DivisionFormat,
  StandingRow,
  TournamentBout,
} from '../../../shared/types/tournament';
import { generateOfficialDraw } from '../../../shared/engine/uwwDrawEngine';
import {
  detectRecommendedFormat,
  generateDivisionBouts,
} from '../../../shared/engine/uwwBracketEngine';
import { calculateNordicStandings } from '../../../shared/engine/uwwClassification';

/**
 * Konversi model Prisma Athlete ke tipe Shared Athlete.
 */
export function mapPrismaAthleteToShared(
  ath: PrismaAthlete,
  div: Pick<PrismaDivision, 'style' | 'ageCategory' | 'weightClass'>
): SharedAthlete {
  return {
    id: ath.id,
    name: ath.name,
    region: ath.region,
    regionCode: ath.regionCode,
    style: div.style,
    ageCategory: div.ageCategory,
    weightClass: div.weightClass,
    seed: ath.seed ?? undefined,
    drawNumber: ath.drawNumber ?? undefined,
  };
}

/**
 * Konversi model Prisma Bout ke tipe Shared TournamentBout.
 */
export function mapPrismaBoutToShared(b: PrismaBout): TournamentBout {
  const hasResult =
    b.status === 'COMPLETED' &&
    b.winnerCorner !== null &&
    b.winnerAthleteId !== null &&
    b.victoryType !== null;

  const loserAthleteId =
    b.winnerCorner === 'RED' ? b.blueAthleteId || '' : b.redAthleteId || '';

  return {
    id: b.id,
    divisionId: b.divisionId || '',
    boutNumber: b.boutNumber,
    matName: b.matName,
    round: b.round as BoutRound,
    roundOrder: b.roundOrder,
    bracketPosition: b.bracketPosition,
    bracketSide: b.bracketSide ?? undefined,
    redAthleteId: b.redAthleteId,
    blueAthleteId: b.blueAthleteId,
    redSourceLabel: b.redSourceLabel ?? undefined,
    blueSourceLabel: b.blueSourceLabel ?? undefined,
    nextWinBoutId: b.nextWinBoutId ?? undefined,
    nextWinSlot: b.nextWinSlot ?? undefined,
    nextLoseBoutId: b.nextLoseBoutId ?? undefined,
    nextLoseSlot: b.nextLoseSlot ?? undefined,
    status: b.status,
    result: hasResult
      ? {
          winnerCorner: b.winnerCorner!,
          winnerAthleteId: b.winnerAthleteId!,
          loserAthleteId,
          redScore: b.redScore,
          blueScore: b.blueScore,
          victoryType: b.victoryType!,
          redClassificationPts: b.redClassificationPts,
          blueClassificationPts: b.blueClassificationPts,
          completedAt: b.completedAt ? b.completedAt.getTime() : Date.now(),
        }
      : undefined,
  };
}

/**
 * Mengunci undian dan menghasilkan seluruh node bagan pertandingan resmi UWW
 * dalam satu transaksi database MySQL.
 * Menolak dengan 409 Conflict apabila sudah ada partai IN_PROGRESS atau COMPLETED.
 */
export async function generateDivisionBracketInTx(
  divisionId: string,
  options?: {
    separateSameRegion?: boolean;
    format?: DivisionFormat;
  }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const division = await tx.division.findUnique({
      where: { id: divisionId },
      include: {
        athletes: {
          orderBy: [{ drawNumber: 'asc' }, { name: 'asc' }],
        },
        bouts: true,
      },
    });

    if (!division) {
      throw new AppError(404, 'Divisi pertandingan tidak ditemukan.');
    }

    // Proteksi 409 Conflict: tolak jika sudah ada partai yang berjalan atau selesai
    const activeOrCompletedBouts = division.bouts.filter(
      (b) => b.status === 'IN_PROGRESS' || b.status === 'COMPLETED'
    );
    if (activeOrCompletedBouts.length > 0) {
      throw new AppError(
        409,
        'Tidak dapat membuat ulang bagan karena sudah ada partai berstatus IN_PROGRESS atau COMPLETED pada divisi ini.'
      );
    }

    if (division.athletes.length < 2) {
      throw new AppError(
        400,
        'Minimal diperlukan 2 atlet pada divisi ini untuk membentuk bagan pertandingan.'
      );
    }

    let sharedAthletes: SharedAthlete[] = division.athletes.map((a) =>
      mapPrismaAthleteToShared(a, division)
    );

    // Jika belum semua atlet memiliki drawNumber yang valid, jalankan generateOfficialDraw otomatis
    const allHaveDrawNumbers = sharedAthletes.every(
      (a) => typeof a.drawNumber === 'number' && a.drawNumber >= 1
    );

    if (!allHaveDrawNumbers) {
      sharedAthletes = generateOfficialDraw(sharedAthletes, {
        separateSameRegion: options?.separateSameRegion ?? true,
      });

      // Tahap 1: Reset drawNumber menjadi null terlebih dahulu agar tidak bentrok unique constraint
      await tx.athlete.updateMany({
        where: { divisionId },
        data: { drawNumber: null },
      });

      // Tahap 2: Simpan nomor undian baru
      for (const ath of sharedAthletes) {
        await tx.athlete.update({
          where: { id: ath.id },
          data: { drawNumber: ath.drawNumber ?? null },
        });
      }
    } else {
      sharedAthletes.sort((a, b) => (a.drawNumber || 0) - (b.drawNumber || 0));
    }

    const effectiveFormat: DivisionFormat =
      options?.format ?? detectRecommendedFormat(sharedAthletes.length);

    // Kunci undian & simpan format divisi
    await tx.division.update({
      where: { id: divisionId },
      data: {
        isDrawLocked: true,
        format: effectiveFormat,
      },
    });

    // Hapus bouts lama di divisi ini (yang masih TBD / SCHEDULED / ON_DECK)
    await tx.bout.deleteMany({
      where: { divisionId },
    });

    const sharedDivision: CategoryDivision = {
      id: division.id,
      style: division.style,
      ageCategory: division.ageCategory,
      weightClass: division.weightClass,
      athleteIds: sharedAthletes.map((a) => a.id),
      format: effectiveFormat,
      assignedMat: division.assignedMat,
      isDrawLocked: true,
    };

    const generatedBouts = generateDivisionBouts(sharedDivision, sharedAthletes);

    // Hitung nomor partai berurutan per matras agar setiap partai langsung punya boutNumber saat dibuat
    const targetMatName = division.assignedMat || 'MAT A';
    const maxMatBoutAgg = await tx.bout.aggregate({
      where: {
        tournamentId: division.tournamentId,
        matName: targetMatName,
      },
      _max: { boutNumber: true },
    });
    let nextBoutCounter = (maxMatBoutAgg._max.boutNumber ?? 0) + 1;
    const chronologicalBouts = [...generatedBouts].sort((a, b) => {
      if (a.roundOrder !== b.roundOrder) return a.roundOrder - b.roundOrder;
      return a.bracketPosition - b.bracketPosition;
    });
    const assignedBoutNumberById = new Map<string, number>();
    for (const b of chronologicalBouts) {
      assignedBoutNumberById.set(b.id, b.boutNumber ?? nextBoutCounter++);
    }

    // Pemetaan ID logis ke UUID MySQL
    const idMap = new Map<string, string>();
    for (const b of generatedBouts) {
      idMap.set(b.id, randomUUID());
    }

    // Pass 1: Insert seluruh bouts menggunakan createMany tanpa self-referential FK dulu
    await tx.bout.createMany({
      data: generatedBouts.map((b) => ({
        id: idMap.get(b.id)!,
        tournamentId: division.tournamentId,
        divisionId: division.id,
        boutNumber: assignedBoutNumberById.get(b.id) ?? b.boutNumber,
        matName: b.matName,
        round: b.round,
        roundOrder: b.roundOrder,
        bracketPosition: b.bracketPosition,
        bracketSide: b.bracketSide ?? null,
        redAthleteId: b.redAthleteId,
        blueAthleteId: b.blueAthleteId,
        redSourceLabel: b.redSourceLabel ?? null,
        blueSourceLabel: b.blueSourceLabel ?? null,
        status: b.status,
      })),
    });

    // Pass 2: Hubungkan foreign key nextWinBoutId dan nextLoseBoutId
    for (const b of generatedBouts) {
      if (b.nextWinBoutId || b.nextLoseBoutId) {
        const dbId = idMap.get(b.id)!;
        await tx.bout.update({
          where: { id: dbId },
          data: {
            nextWinBoutId: b.nextWinBoutId ? idMap.get(b.nextWinBoutId) ?? null : null,
            nextWinSlot: b.nextWinSlot ?? null,
            nextLoseBoutId: b.nextLoseBoutId ? idMap.get(b.nextLoseBoutId) ?? null : null,
            nextLoseSlot: b.nextLoseSlot ?? null,
          },
        });
      }
    }
  });
}

/**
 * Mengambil data bagan lengkap beserta atlet dan hasil kalkulasi klasemen resmi UWW
 * (StandingRow[]) untuk format NORDIC dan GROUP_CROSS.
 */
export async function getDivisionBracketWithStandings(divisionId: string) {
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    include: {
      athletes: {
        orderBy: [{ drawNumber: 'asc' }, { name: 'asc' }],
      },
      bouts: {
        include: {
          redAthlete: true,
          blueAthlete: true,
          winnerAthlete: true,
        },
        orderBy: [{ roundOrder: 'asc' }, { bracketPosition: 'asc' }],
      },
    },
  });

  if (!division) {
    throw new AppError(404, 'Divisi pertandingan tidak ditemukan.');
  }

  const athleteMap = new Map(division.athletes.map((a) => [a.id, a]));
  const sharedBouts = division.bouts.map(mapPrismaBoutToShared);

  const enrichStandings = (rows: StandingRow[]): StandingRow[] =>
    rows.map((r) => {
      const ath = athleteMap.get(r.athleteId);
      return {
        ...r,
        athleteName: ath?.name,
        regionCode: ath?.regionCode,
      };
    });

  let standings: StandingRow[] = [];
  let poolAStandings: StandingRow[] = [];
  let poolBStandings: StandingRow[] = [];

  if (division.format === 'NORDIC') {
    const allIds = division.athletes.map((a) => a.id);
    standings = enrichStandings(calculateNordicStandings(allIds, sharedBouts));
  } else if (division.format === 'GROUP_CROSS') {
    const groupABouts = sharedBouts.filter((b) => b.round === 'GROUP_A');
    const groupBBouts = sharedBouts.filter((b) => b.round === 'GROUP_B');

    const sortedAthletes = [...division.athletes].sort(
      (a, b) => (a.drawNumber || 99) - (b.drawNumber || 99)
    );

    const half = Math.ceil(sortedAthletes.length / 2);

    const poolAIds =
      groupABouts.length > 0
        ? Array.from(
            new Set(
              groupABouts
                .flatMap((b) => [b.redAthleteId, b.blueAthleteId])
                .filter((id): id is string => Boolean(id))
            )
          )
        : sortedAthletes.slice(0, half).map((a) => a.id);

    const poolBIds =
      groupBBouts.length > 0
        ? Array.from(
            new Set(
              groupBBouts
                .flatMap((b) => [b.redAthleteId, b.blueAthleteId])
                .filter((id): id is string => Boolean(id))
            )
          )
        : sortedAthletes.slice(half).map((a) => a.id);

    poolAStandings = enrichStandings(calculateNordicStandings(poolAIds, groupABouts));
    poolBStandings = enrichStandings(calculateNordicStandings(poolBIds, groupBBouts));
    standings = [...poolAStandings, ...poolBStandings];
  }

  return {
    division: {
      id: division.id,
      tournamentId: division.tournamentId,
      style: division.style,
      ageCategory: division.ageCategory,
      weightClass: division.weightClass,
      format: division.format,
      assignedMat: division.assignedMat,
      isDrawLocked: division.isDrawLocked,
      athleteIds: division.athletes.map((a) => a.id),
    },
    athletes: division.athletes,
    bouts: division.bouts,
    standings,
    poolAStandings,
    poolBStandings,
  };
}
