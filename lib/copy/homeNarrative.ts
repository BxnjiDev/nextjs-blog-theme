import type { HomeDashboardData } from '@/lib/domain/homeDashboard';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Composes Home's lead narrative — "interpret, don't just show" from the
 * design brief. Deliberately NOT a call to Claude: every sentence is a
 * template filled from numbers homeDashboard.ts already computed
 * (portfolio health score/concerns, upcoming earnings dates, whether a
 * thesis changed recently). No new judgment is formed here — this only
 * puts existing judgments into a sentence instead of a stat tile. Kept in
 * lib/copy/ rather than lib/domain/ to keep that boundary honest: this is
 * text templating, not a new business-logic engine.
 */
export function buildHomeNarrative(
  data: Pick<HomeDashboardData, 'portfolioHealth' | 'upcomingEarnings' | 'recentThesisChange'>
): string[] {
  const sentences: string[] = [];

  if (data.portfolioHealth) {
    const { overallScore, topConcerns } = data.portfolioHealth;
    if (overallScore >= 80) {
      sentences.push('Portfolio integrity is excellent.');
    } else if (overallScore >= 60) {
      sentences.push('Portfolio integrity remains solid.');
    } else if (overallScore >= 40) {
      sentences.push('Portfolio integrity is mixed right now.');
    } else {
      sentences.push('Portfolio integrity is under pressure.');
    }

    sentences.push(
      overallScore >= 60 ? 'No immediate defensive action required.' : 'Defensive positioning may be worth considering.'
    );

    if (topConcerns.length > 0) {
      sentences.push(`${topConcerns.length} area${topConcerns.length === 1 ? '' : 's'} deserve${topConcerns.length === 1 ? 's' : ''} attention.`);
    }
  } else {
    sentences.push('No portfolio health reading yet — sync an account to begin tracking.');
  }

  const now = Date.now();
  const withinWeek = data.upcomingEarnings.filter((e) => e.reportDate.getTime() - now <= WEEK_MS && e.reportDate.getTime() >= now).length;
  if (withinWeek > 0) {
    sentences.push(`${withinWeek} catalyst${withinWeek === 1 ? '' : 's'} arrive${withinWeek === 1 ? 's' : ''} this week.`);
  }

  if (data.recentThesisChange) {
    sentences.push(`${data.recentThesisChange.symbol}'s thesis shifted recently — worth a look.`);
  }

  return sentences;
}
