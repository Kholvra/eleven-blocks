import { mountAccessibilityControls } from './accessibilityControls';
import { createAudioController } from '../audio/audio';
import type { GameMachine, Phase } from '../game/machine';
import type { SkorAkhir } from '../game/report';
import type { GameState } from '../game/types';

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
    mountAccessibilityControls(screen);
    root.append(screen);
    screens[phase] = screen;
  }

  function render(): void {
    const current = machine.getPhase();
    for (const phase of Object.keys(screens) as Phase[]) {
      screens[phase].hidden = phase !== current;
    }
    if (current === 'laporan') renderReport(screens.laporan.querySelector('.results-content')!);
  }

  function renderReport(results: HTMLElement): void {
    const resultHeading = results.querySelector('#results-heading');
    if (!resultHeading) return;
    results.replaceChildren(resultHeading);

    const score = options.hitungSkorAkhir(options.getGameState());
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
        ['Indeks Miopia (MI)', score.mi],
      ] as const) {
        const item = document.createElement('div');
        const term = document.createElement('dt');
        term.textContent = label;
        const detail = document.createElement('dd');
        detail.textContent = String(value);
        item.append(term, detail);
        supporting.append(item);
      }

      const disclaimer = document.createElement('p');
      disclaimer.className = 'results-disclaimer';
      disclaimer.textContent = 'MI adalah heuristik refleksi permainan, bukan ukuran psikologis tervalidasi atau hasil belajar.';
      results.append(rating, supporting, disclaimer);
    } else {
      const unavailable = document.createElement('p');
      unavailable.className = 'results-unavailable';
      unavailable.textContent = score.alasan;
      results.append(unavailable);
    }
  }

  return {
    render,
    setStatus(message) {
      statusMessage = message;
      for (const statusText of statusTexts) statusText.textContent = message;
    },
  };
}
