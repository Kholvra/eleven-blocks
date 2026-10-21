import { createHud, type HudRenderer } from './hud';
import type { GameAction } from '../game/engine';
import type { GameState } from '../game/types';
import { mountAccessibilityControls } from './accessibilityControls';
import { createAudioController } from '../audio/audio';
import type { GameMachine, Phase } from '../game/machine';
import { composeLaporanKota, type SkorAkhir } from '../game/report';
import { createContextualTip, createTutorialGuide, createTutorialSteps, tutorialLabels } from './tutorial';
const phaseCopy: Record<Phase, { title: string; description: string }> = {
  menu: { title: 'Eleven Blocks', description: 'Sepuluh ronde untuk satu distrik.' },
  tutorial: { title: 'Tutorial', description: 'Pengenalan permainan' },
  ronde: { title: 'Ronde', description: 'Layar permainan' },
  event: { title: 'Berita kota', description: 'Layar peristiwa' },
  ringkasan: { title: 'Ringkasan ronde', description: 'Ringkasan' },
  laporan: { title: 'Laporan Kota', description: 'Laporan akhir' },
  tiket: { title: 'Tiket Keluar', description: 'Tiket sesi' },
};

export interface ScreenRouterOptions {
  canContinue: boolean;
  continueLabel: string;
  statusMessage?: string;
  getState(): GameState;
  dispatch(action: GameAction): boolean;
  onStartNew(): Phase;
  onContinue(): Phase | null;
  onAudioChange(enabled: boolean): void;
  getGameState(): GameState;
  hitungSkorAkhir(state: GameState): SkorAkhir;
}

export interface ScreenRouter {
  render(): void;
  setStatus(message: string): void;
}

export function createScreenRouter(
  root: HTMLElement,
  machine: GameMachine,
  options: ScreenRouterOptions,
): ScreenRouter {
  const screens = {} as Record<Phase, HTMLElement>;
  const huds: Partial<Record<Phase, HudRenderer>> = {};
  const audio = createAudioController();
  const soundToggles: HTMLButtonElement[] = [];
  let statusMessage = options.statusMessage ?? '';
  const statusTexts: HTMLElement[] = [];

  for (const [phase, copy] of Object.entries(phaseCopy) as [Phase, typeof phaseCopy[Phase]][]) {
    const screen = document.createElement('section');
    screen.className = 'screen';
    screen.dataset.phase = phase;
    screen.setAttribute('aria-labelledby', `screen-title-${phase}`);

    const heading = document.createElement('h1');
    heading.id = `screen-title-${phase}`;
    heading.textContent = copy.title;
    if (phase === 'menu') {
      const brandMark = document.createElement('span');
      brandMark.className = 'brand-mark';
      brandMark.setAttribute('aria-hidden', 'true');
      for (let index = 0; index < 3; index += 1) {
        const block = document.createElement('span');
        brandMark.append(block);
      }
      heading.prepend(brandMark);
    }
    const description = document.createElement('p');
    description.textContent = copy.description;

    const soundToggle = document.createElement('button');
    soundToggle.className = 'sound-toggle';
    soundToggle.type = 'button';
    soundToggle.setAttribute('aria-label', 'Suara');
    soundToggle.setAttribute('aria-pressed', String(audio.isEnabled()));
    soundToggle.textContent = audio.isEnabled() ? 'Suara: aktif' : 'Suara: mati';
    soundToggle.addEventListener('click', () => {
      audio.setEnabled(!audio.isEnabled());
      const enabled = audio.isEnabled();
      for (const toggle of soundToggles) {
        toggle.setAttribute('aria-pressed', String(enabled));
        toggle.textContent = enabled ? 'Suara: aktif' : 'Suara: mati';
      }
      options.onAudioChange(enabled);
    });
    soundToggles.push(soundToggle);
    screen.append(heading, description, soundToggle);
    if (phase === 'laporan') {
      const results = document.createElement('section');
      results.className = 'results-content';
      results.setAttribute('aria-labelledby', 'results-heading');

      const resultHeading = document.createElement('h2');
      resultHeading.id = 'results-heading';
      resultHeading.textContent = 'Hasil sesi';
      results.append(resultHeading);
      screen.append(results);
    }

    if (phase === 'tutorial') {
      const continueToRound = (): void => {
        if (!options.dispatch({ type: 'TRANSISI_FASE', fase: 'ronde' })) return;
        machine.restore(options.getState().fase);
        render();
      };
      screen.append(createTutorialGuide(continueToRound));
    }
    if (phase === 'menu') {
      const actions = document.createElement('div');
      actions.className = 'menu-actions';

      const start = document.createElement('button');
      start.className = 'menu-action';
      start.type = 'button';
      start.textContent = 'Mulai sesi baru';
      start.addEventListener('click', () => {
        machine.restore(options.onStartNew());
        render();
      });
      actions.append(start);

      if (options.canContinue) {
        const continueButton = document.createElement('button');
        continueButton.className = 'menu-action';
        continueButton.type = 'button';
        continueButton.textContent = options.continueLabel;
        continueButton.addEventListener('click', () => {
          const phaseToRestore = options.onContinue();
          if (phaseToRestore === null) return;
          machine.restore(phaseToRestore);
          render();
        });
        actions.append(continueButton);
      }

      const howToPlay = document.createElement('details');
      howToPlay.className = 'menu-help tutorial-tip';
      const helpSummary = document.createElement('summary');
      helpSummary.textContent = tutorialLabels.howToPlay;
      howToPlay.append(helpSummary, createTutorialSteps(), createContextualTip('menu'));
      actions.append(howToPlay);

      const phaseStatus = document.createElement('p');
      phaseStatus.className = 'save-status';
      phaseStatus.setAttribute('role', 'status');
      phaseStatus.setAttribute('aria-live', 'polite');
      phaseStatus.textContent = phase === 'menu' ? statusMessage : '';
      statusTexts.push(phaseStatus);
      screen.append(actions, phaseStatus);
    }
    if (phase !== 'menu') {
      const phaseStatus = document.createElement('p');
      phaseStatus.className = 'save-status';
      phaseStatus.setAttribute('role', 'status');
      phaseStatus.setAttribute('aria-live', 'polite');
      phaseStatus.textContent = statusMessage;
      statusTexts.push(phaseStatus);
      screen.append(phaseStatus);
    }
    if (phase === 'ronde' || phase === 'event' || phase === 'ringkasan') {
      huds[phase] = createHud(screen, {
        getState: options.getState,
        dispatch: options.dispatch,
        onStateChange() {
          machine.restore(options.getState().fase);
          render();
        },
      });
    }
    mountAccessibilityControls(screen);
    root.append(screen);
    screens[phase] = screen;
  }

  function render(): void {
    const statePhase = options.getState().fase;
    if (machine.getPhase() !== statePhase) machine.restore(statePhase);
    const current = machine.getPhase();
    for (const phase of Object.keys(screens) as Phase[]) {
      screens[phase].hidden = phase !== current;
    }
    huds[current]?.render();
    if (current === 'laporan') renderReport(screens.laporan.querySelector('.results-content')!);
  }

  function renderReport(results: HTMLElement): void {
    const resultHeading = results.querySelector('#results-heading');
    if (!resultHeading) return;
    results.replaceChildren(resultHeading);

    const state = options.getState();
    const score = options.hitungSkorAkhir(state);
    const report = composeLaporanKota(state, score);
    const [summary, decisions, affected, mi, facts, reflection] = report.sections;
    if (score.status === 'siap') {
      const rating = document.createElement('p');
      rating.className = 'results-rating';
      rating.setAttribute('aria-label', `Nilai ${score.bintang} dari 5 bintang`);
      rating.textContent = `${score.bintang} / 5 bintang`;

      const supporting = document.createElement('dl');
      supporting.className = 'results-supporting';
      for (const [label, value] of [
        ['Ambang tercapai (T)', score.t],
        ['Meter kritis (C)', score.c],
      ] as const) {
        const item = document.createElement('div');
        const term = document.createElement('dt');
        term.textContent = label;
        const detail = document.createElement('dd');
 
        detail.textContent = String(value);
        item.append(term, detail);
        supporting.append(item);
      }
      results.append(rating, supporting);
    } else {
      const unavailable = document.createElement('p');
      unavailable.className = 'results-unavailable';
      unavailable.textContent = score.alasan;
      results.append(unavailable);
    }

    const meterLabels = hudCopy.meter as Record<string, { label: string }>;
    const meterEntries = (meter: Record<string, number>): HTMLElement => {
      const list = document.createElement('dl');
      list.className = 'report-meter-list';
      for (const [key, value] of Object.entries(meter)) {
        const entry = document.createElement('div');
        const label = document.createElement('dt');
        label.textContent = meterLabels[key]?.label ?? key;
        const amount = document.createElement('dd');
        amount.textContent = String(value);
        entry.append(label, amount);
        list.append(entry);
      }
      return list;
    };
    const section = (title: string, className: string): HTMLElement => {
      const element = document.createElement('section');
      element.className = `report-section ${className}`;
      const heading = document.createElement('h3');
      heading.textContent = title;
      element.append(heading);
      return element;
    };

    const summarySection = section('Ringkasan Kota', 'report-summary');
    const simulationNote = document.createElement('p');
    simulationNote.className = 'results-disclaimer';
    simulationNote.textContent = 'Nilai meter adalah skala simulasi internal permainan, bukan fakta atau prediksi tentang kota nyata.';
    const meterComparison = document.createElement('div');
    meterComparison.className = 'report-meter-comparison';
    summarySection.append(simulationNote, meterComparison);
    for (const [label, meter] of [
      ['Awal sesi', summary.meterAwal],
      ['Akhir sesi', summary.meterAkhir],
    ] as const) {
      const group = document.createElement('div');
      group.className = 'report-meter-group';
      const heading = document.createElement('h4');
      heading.textContent = label;
      group.append(heading, meterEntries(meter));
      meterComparison.append(group);
    }
    const horizons = document.createElement('div');
    horizons.className = 'report-horizons';
    for (const horizon of summary.cakrawala) {
      const item = document.createElement('div');
      item.className = 'report-horizon';
      const heading = document.createElement('h4');
      heading.textContent = horizon.id === 'sekarang' ? 'Sekarang' :
        horizon.id === '+5' ? '+5 ronde' : 'Akhir';
      item.append(heading);
      if (horizon.id === '+5') {
        const note = document.createElement('p');
        note.textContent = 'Tidak disimulasikan.';
        item.append(note);
      } else if (horizon.meter) {
        item.append(meterEntries(horizon.meter));
      } else {
        const note = document.createElement('p');
        note.textContent = 'Nilai tidak tersedia.';
        item.append(note);
      }
      horizons.append(item);
    }
    summarySection.append(meterComparison, horizons);

    const decisionSection = section('3 Keputusan Paling Berdampak', 'report-decisions');
    if (!decisions.tersedia) {
      const empty = document.createElement('p');
      empty.textContent = 'Riwayat atribusi keputusan tidak tersedia.';
      decisionSection.append(empty);
    } else if (decisions.item.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'Tidak ada keputusan kebijakan yang dapat diringkas.';
      decisionSection.append(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'report-decision-list';
      for (const decision of decisions.item.slice(0, 3)) {
        const card = document.createElement('article');
        card.className = 'report-decision';
        const heading = document.createElement('h4');
        heading.textContent = decision.nama;
        const details = document.createElement('p');
        details.textContent = `Ronde ${decision.ronde} · Biaya ${decision.biaya} poin`;
        const effect = document.createElement('p');
        const delta = Object.entries(decision.delta).map(([key, amount]) =>
          `${meterLabels[key]?.label ?? key}: ${amount > 0 ? '+' : ''}${amount}`);
        effect.textContent = delta.length ? `Efek tercatat: ${delta.join(', ')}.` : 'Efek meter tercatat: tidak ada perubahan.';
        const tradeoff = document.createElement('p');
        tradeoff.textContent = decision.kondisi ? `Kondisi: ${decision.kondisi}` : 'Tidak ada kondisi tambahan tercatat.';
        card.append(heading, details, effect, tradeoff);
        list.append(card);
      }
      decisionSection.append(list);
    }
    const actionsHeading = document.createElement('h4');
    actionsHeading.textContent = 'Aksi terpilih';
    const actions = document.createElement('ul');
    if (decisions.aksiTerpilih.length) {
      for (const action of decisions.aksiTerpilih) {
        const item = document.createElement('li');
        item.textContent = `${action.nama} · Biaya ${action.biaya} poin · Ronde tidak tersedia dalam model`;
        actions.append(item);
      }
    } else {
      const item = document.createElement('li');
      item.textContent = 'Tidak ada aksi terpilih yang tercatat.';
      actions.append(item);
    }
    decisionSection.append(actionsHeading, actions);

    const affectedSection = section('Siapa Untung & Siapa Terdampak', 'report-affected');
    const affectedNote = document.createElement('p');
    affectedNote.className = 'results-disclaimer';
    affectedNote.textContent = 'Kondisi yang ditampilkan adalah dampak simulasi, bukan temuan tentang warga nyata.';
    affectedSection.append(affectedNote);
    if (!affected.tersedia) {
      const empty = document.createElement('p');
      empty.textContent = 'Kondisi pihak terdampak tidak tersedia dari riwayat sesi.';
      affectedSection.append(empty);
    } else {
      const list = document.createElement('ul');
      for (const condition of affected.kondisi) {
        const item = document.createElement('li');
        item.textContent = condition;
        list.append(item);
      }
      affectedSection.append(list);
    }

    const miSection = section('Indeks Miopia (MI)', 'report-mi');
    const miValue = document.createElement('p');
    miValue.className = 'report-mi-value';
    miValue.textContent = mi.mi === null ? 'Tidak tersedia' : String(mi.mi);
    const direction = document.createElement('p');
    direction.textContent = mi.arah;
    const formula = document.createElement('p');
    formula.textContent = mi.rumus;
    const disclaimer = document.createElement('p');
    disclaimer.className = 'results-disclaimer';
    disclaimer.textContent = mi.disclaimer;
    miSection.append(miValue, direction, formula, disclaimer);

    const factsSection = section('Fakta Dunia Nyata', 'report-facts');
    if (!facts.item.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Tidak ada fakta bersumber yang tersedia.';
      factsSection.append(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'report-fact-list';
      for (const fact of facts.item) {
        const item = document.createElement('article');
        item.className = 'report-fact';
        const value = document.createElement('p');
        value.className = 'report-fact-value';
        value.textContent = `${fact.nilai} ${fact.satuan}`;
        const meaning = document.createElement('p');
        meaning.textContent = fact.arti;
        const context = document.createElement('p');
        context.textContent = fact.konteks;
        const source = document.createElement('p');
        source.textContent = `Sumber: ${fact.penerbit}, ${fact.tahun}. Akses: ${fact.akses}.`;
        const link = document.createElement('a');
        link.href = fact.url;
        link.textContent = fact.labelUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `Buka sumber ${fact.penerbit}: ${fact.labelUrl}`);
        item.append(value, meaning, context, source, link);
        list.append(item);
      }
      factsSection.append(list);
    }

    const reflectionSection = section('Ajakan Refleksi', 'report-reflection');
    const prompt = document.createElement('p');
    prompt.textContent = reflection.prompt;
    reflectionSection.append(prompt);

    results.append(summarySection, decisionSection, affectedSection, miSection, factsSection, reflectionSection);
  }

  return {
    render,
    setStatus(message) {
      statusMessage = message;
      for (const statusText of statusTexts) statusText.textContent = message;
    },
  };
}
