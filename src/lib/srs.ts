import { addDays, isBefore } from 'date-fns';

export interface SRSCard {
  id?: string;
  userId: string;
  front: string;
  back: string;
  nextReview: Date;
  interval: number;
  ease: number;
  repetitions: number;
  status: 'new' | 'learning' | 'review' | 'graduated';
}

/**
 * SuperMemo-2 (SM-2) algorithm simplified
 * quality (q): 0-5
 * 5: perfect response
 * 4: correct response after a hesitation
 * 3: correct response recalled with serious difficulty
 * 2: incorrect response; where the correct one seemed easy to recall
 * 1: incorrect response; the correct one remembered
 * 0: complete blackout.
 */
export function calculateNextReview(card: SRSCard, quality: number): Partial<SRSCard> {
  let { repetitions, ease, interval } = card;

  if (quality >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    repetitions++;
    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  } else {
    repetitions = 0;
    interval = 1;
  }

  if (ease < 1.3) ease = 1.3;

  return {
    repetitions,
    ease,
    interval,
    nextReview: addDays(new Date(), interval),
    status: interval > 21 ? 'graduated' : 'review'
  };
}
