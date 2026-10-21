import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import cards from '../src/data/cards.json';
import { biayaKartu, kodeKartu } from '../src/game/cards';
import { createGameEngine } from '../src/game/engine';
import { hitungSkorAkhir } from '../src/game/report';
import { baruGame } from '../src/game/state';
import type { GameState } from '../src/game/types';

type Strategy = 'savings' | 'aggressive' | 'green';
type RoundOption = {
  policy: string;
  cost: number;
  affordable: boolean;
  directEffects: Record<string, number>;
};
type RoundLog = {
  round: number;
  policy: string | null;
  cost: number;
  budgetBefore: number;
  budgetAfter: number;
  meters: GameState['meter'];
  pendingChoices: number;
  pendingEffects: number;
  alternatives: RoundOption[];
  decisionReason: string;
};
type SessionResult = {
  seed: string;
  strategy: Strategy | 'no-purchase' | 'high-green';
  policyDefinition: string;
  rounds: RoundLog[];
  final: { stars: number | null; mi: number | null; status: string; meters: GameState['meter'] };
  elapsedMs: number;
  eventChoicesSimulated: false;
  eventChoiceNote: string;
};

const SEEDS = ['req017-seed-a', 'req017-seed-b', 'req017-seed-c'] as const;
const K14_INDEX = balance.ekonomi.kebijakan.findIndex((item) => item.kode === 'K14');
const POLICY_DEFINITIONS: Record<Strategy | 'no-purchase', string> = {
  savings: 'Choose the affordable hand policy with the lowest card cost.',
  aggressive: 'Choose the affordable hand policy with the highest card cost.',
  green: 'Choose the affordable hand policy with the highest immediate hijau effect, breaking ties by lowest cost.',
  'no-purchase': 'Pass without playing a hand policy, regardless of affordability.',
};


function choosePolicy(hand: number[], budget: number, strategy: Strategy): number | null {
  const candidates = hand.filter((index) => (biayaKartu(index) ?? Infinity) <= budget);
  if (candidates.length === 0) return null;
  if (strategy === 'savings') return candidates.sort((a, b) => (biayaKartu(a) ?? 0) - (biayaKartu(b) ?? 0))[0] ?? null;
  if (strategy === 'aggressive') return candidates.sort((a, b) => (biayaKartu(b) ?? 0) - (biayaKartu(a) ?? 0))[0] ?? null;
  return candidates.sort((a, b) => {
    const greenA = cards.kebijakan[a]?.efek.langsung.hijau ?? 0;
    const greenB = cards.kebijakan[b]?.efek.langsung.hijau ?? 0;
    return greenB - greenA || (biayaKartu(a) ?? 0) - (biayaKartu(b) ?? 0);
  })[0] ?? null;
}
function getRoundOptions(hand: number[], budget: number): RoundOption[] {
  return hand.map((index) => {
    const directEffects = cards.kebijakan[index]?.efek.langsung ?? {};
    return {
      policy: kodeKartu(index) ?? `index-${index}`,
      cost: biayaKartu(index) ?? 0,
      affordable: (biayaKartu(index) ?? Infinity) <= budget,
      directEffects: Object.fromEntries(
        Object.entries(directEffects).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
      ),
    };
  });
}

function describeDecision(policy: string | null, cost: number, budget: number, alternatives: RoundOption[], definition: string): string {
  const chosen = policy === null ? undefined : alternatives.find((option) => option.policy === policy);
  const foregone = alternatives
    .filter((option) => option.policy !== policy && (policy === null || option.affordable))
    .map((option) => ({
      option,
      gains: Object.entries(option.directEffects)
        .filter(([meter, value]) => value > (chosen?.directEffects[meter] ?? 0))
        .sort((a, b) => b[1] - a[1]),
    }))
    .sort((a, b) => Number(b.option.affordable) - Number(a.option.affordable)
      || (b.gains[0]?.[1] ?? 0) - (a.gains[0]?.[1] ?? 0))[0];
  if (policy === null) {
    return foregone?.gains[0]
      ? foregone.option.affordable
        ? `Passed under "${definition}" despite an affordable ${foregone.option.policy} (cost ${foregone.option.cost}); retained ${budget} budget but gave up ${foregone.gains[0][1]} ${foregone.gains[0][0]}.`
        : `Passed under "${definition}": ${foregone.option.policy} would add ${foregone.gains[0][1]} ${foregone.gains[0][0]} but costs ${foregone.option.cost} against budget ${budget}; retained ${budget}.`
      : foregone
        ? `Passed under "${definition}": ${foregone.option.policy} costs ${foregone.option.cost} (affordable: ${foregone.option.affordable}) and its direct effects are ${JSON.stringify(foregone.option.directEffects)}; retained ${budget} budget.`
        : `Passed under "${definition}": no hand alternatives were available; retained ${budget} budget.`;
  }
  if (foregone?.gains[0]) {
    return `Played ${policy} for ${cost} under "${definition}"; gave up ${foregone.gains[0][1]} ${foregone.gains[0][0]} from affordable ${foregone.option.policy} (cost ${foregone.option.cost}).`;
  }
  return `Played ${policy} for ${cost} under "${definition}" (budget ${budget} -> ${budget - cost}); ${foregone ? `${foregone.option.policy} costs ${foregone.option.cost}` : 'no other hand policy is affordable'} and no other affordable hand policy offered a greater direct meter effect.`;

}

function playSession(seed: string, strategy: Strategy | 'no-purchase' | 'high-green', options: { forceK14Round?: number } = {}): SessionResult {
  const started = performance.now();
  const initial = baruGame(seed);
  if (options.forceK14Round !== undefined) {
    initial.deck = initial.deck.filter((index) => index !== K14_INDEX);
    if (options.forceK14Round === 2) initial.deck.splice(initial.deck.length - 4, 0, K14_INDEX);
    else initial.deck.push(K14_INDEX);
  }
  const engine = createGameEngine(initial);
  const dispatch = (action: Parameters<typeof engine.dispatch>[0]) => {
    if (!engine.dispatch(action)) throw new Error(`Engine rejected ${action.type} in round ${engine.getState().ronde}`);
  };
  dispatch({ type: 'TRANSISI_FASE', fase: 'tutorial' });
  dispatch({ type: 'TRANSISI_FASE', fase: 'ronde' });
  const rounds: RoundLog[] = [];

  for (let round = 1; round <= 10; round += 1) {
    const before = engine.getState().anggaran;
    dispatch({ type: 'PROSES_TAHAP_RONDE' });
    const hand = engine.getState().tangan;
    const alternatives = getRoundOptions(hand, before);
    const forceK14 = options.forceK14Round === round
      && hand.includes(K14_INDEX)
      && before >= (biayaKartu(K14_INDEX) ?? Infinity);
    const policy = strategy === 'no-purchase' ? null :
      forceK14
        ? K14_INDEX
        : choosePolicy(hand, before, strategy === 'high-green' ? 'green' : strategy);
    const policyCode = policy === null ? null : kodeKartu(policy) ?? null;
    const decisionPolicyDefinition = forceK14
      ? 'Deterministic fixture override: choose K14 to exercise its purchase in this round.'
      : POLICY_DEFINITIONS[strategy === 'high-green' ? 'green' : strategy];
    let cost = 0;
    if (policy !== null) {
      cost = biayaKartu(policy) ?? 0;
      dispatch({ type: 'MAIN_KARTU', kartuIdx: policy });
    }
    for (const stage of ['resolusi', 'reaksi', 'transisi'] as const) {
      dispatch({ type: 'PROSES_TAHAP_RONDE' });
      if (engine.getState().tahapRonde !== stage) throw new Error(`Unexpected stage in round ${round}`);
    }
    const afterPurchase = engine.getState().anggaran;
    expect(afterPurchase).toBeGreaterThanOrEqual(0);
    expect(afterPurchase).toBe(before - cost);
    dispatch({ type: 'SELESAI_RONDE' });
    const afterRound = engine.getState();
    expect(afterRound.anggaran).toBe(round < 10 ? afterPurchase + balance.ekonomi.pendapatan_per_ronde : afterPurchase);
    expect(afterRound.anggaran).toBeGreaterThanOrEqual(0);
    rounds.push({
      round,
      policy: policyCode,
      cost,
      budgetBefore: before,
      budgetAfter: afterRound.anggaran,
      meters: { ...afterRound.meter },
      pendingChoices: afterRound.eventAktif === null ? 0 : 1,
      pendingEffects: afterRound.antrian.length,
      alternatives,
      decisionReason: describeDecision(policyCode, cost, before, alternatives, decisionPolicyDefinition),
    });
  }

  const finalState = engine.getState();
  expect(finalState.ronde).toBe(10);
  expect(finalState.fase).toBe('laporan');
  const score = hitungSkorAkhir(finalState);
  return {
    policyDefinition: POLICY_DEFINITIONS[strategy === 'high-green' ? 'green' : strategy],
    seed,
    strategy,
    rounds,
    final: {
      stars: score.status === 'siap' ? score.bintang : null,
      mi: score.status === 'siap' ? score.mi : null,
      status: score.status,
      meters: { ...finalState.meter },
    },
    elapsedMs: performance.now() - started,
    eventChoicesSimulated: false,
    eventChoiceNote: 'Event-choice behavior is absent from createGameEngine; no event choices are simulated.',
  };
}

function report(result: SessionResult): void {
  console.log(JSON.stringify({ type: 'REQ-017-simulation', ...result }));
}

type BalVerdict = {
  matchedSeedCount: number;
  requiredSeedCount: number;
  rule: string;
  counts: Record<Strategy, { atLeastFourStars: number; atMostTwoStars: number }>;
  dominantPairs: Array<{ leading: Strategy; lagging: Strategy }>;
  failure: boolean;
};

function calculateBalVerdict(sessions: SessionResult[]): BalVerdict {
  const strategies = ['savings', 'aggressive', 'green'] as const;
  const matchedSeedCount = new Set(sessions.map((session) => session.seed)).size;
  const counts = Object.fromEntries(strategies.map((strategy) => [
    strategy,
    {
      atLeastFourStars: sessions.filter((session) => session.strategy === strategy && session.final.stars !== null && session.final.stars >= 4).length,
      atMostTwoStars: sessions.filter((session) => session.strategy === strategy && session.final.stars !== null && session.final.stars <= 2).length,
    },
  ])) as BalVerdict['counts'];
  const dominantPairs = strategies.flatMap((leading) => strategies
    .filter((lagging) => lagging !== leading
      && counts[leading].atLeastFourStars >= 2
      && counts[lagging].atMostTwoStars >= 2)
    .map((lagging) => ({ leading, lagging })));
  return {
    matchedSeedCount,
    requiredSeedCount: 3,
    rule: 'A strategy has >=4 stars in >=2 of 3 matched seeds while another has <=2 stars in >=2 of 3 matched seeds.',
    counts,
    dominantPairs,
    failure: dominantPairs.length > 0,
  };
}

function reportBalVerdict(verdict: BalVerdict): void {
  console.log(JSON.stringify({ type: 'REQ-017-BAL-verdict', ...verdict }));
}


describe('REQ-017 repeatable ten-round balance simulations', () => {
  it('runs all strategies against three matched seeds with deterministic outcomes', () => {
    const matchedSessions: SessionResult[] = [];
    for (const seed of SEEDS) {
      for (const strategy of ['savings', 'aggressive', 'green'] as const) {
        const first = playSession(seed, strategy);
        const repeated = playSession(seed, strategy);
        expect(first.rounds).toHaveLength(10);
        expect(repeated.rounds).toEqual(first.rounds);
        expect(repeated.final).toEqual(first.final);
        expect(first.eventChoicesSimulated).toBe(false);
        expect(first.eventChoiceNote).toContain('absent');
        expect(first.rounds.every((round) => round.alternatives.length > 0 && round.decisionReason.length > 0)).toBe(true);
        first.rounds.forEach((round, index) => expect(round.round).toBe(index + 1));
        matchedSessions.push(first);
        report(first);
      }
    }
    expect(matchedSessions).toHaveLength(9);
    const verdict = calculateBalVerdict(matchedSessions);
    expect(verdict.matchedSeedCount).toBe(3);
    for (const seed of SEEDS) {
      expect(matchedSessions.filter((session) => session.seed === seed)).toHaveLength(3);
    }
    expect(verdict.failure).toBe(verdict.dominantPairs.length > 0);
    for (const pair of verdict.dominantPairs) {
      expect(verdict.counts[pair.leading].atLeastFourStars).toBeGreaterThanOrEqual(2);
      expect(verdict.counts[pair.lagging].atMostTwoStars).toBeGreaterThanOrEqual(2);
    }
    reportBalVerdict(verdict);
  });

  it('purchases K14 in an early round using a deterministic deck fixture', () => {
    const result = playSession('req017-k14-fixture', 'aggressive', { forceK14Round: 1 });
    expect(result.rounds[0]?.policy).toBe('K14');
    expect(result.rounds[0]?.cost).toBe(26);
    expect(result.rounds).toHaveLength(10);
    report(result);
  });

  it('completes ten rounds without any purchases', () => {
    const result = playSession('req017-no-purchase', 'no-purchase');
    expect(result.rounds.every((round) => round.policy === null && round.cost === 0)).toBe(true);
    expect(result.rounds).toHaveLength(10);
    report(result);
  });

  it('records high-green strategy with low access as ineligible for five stars', () => {
    const result = playSession('req017-high-green', 'high-green');
    expect(result.final.meters.akses).toBeLessThan(70);
    expect(result.final.stars).not.toBe(5);
    report(result);
  });
});
