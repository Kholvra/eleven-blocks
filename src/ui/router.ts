import hudCopy from '../data/hud.json';
import { createHud, type HudRenderer } from './hud';
import type { GameAction } from '../game/engine';
import type { GameState } from '../game/types';
import { mountAccessibilityControls, mountAccessibilityOptions } from './accessibilityControls';
import { createAudioController } from '../audio/audio';
import type { GameMachine, Phase } from '../game/machine';
import type { SkorAkhir } from '../game/report';
import { createTutorialGuide } from './tutorial';
import { createRoundAutomation } from './roundAutomation';
import { createReportView } from './reportView';
const phaseCopy: Record<Phase, { title: string; description?: string }> = {
  menu: { title: 'Eleven Blocks' },
  tutorial: { title: 'Tutorial', description: 'Pengenalan permainan' },
  ronde: { title: 'Ronde', description: 'Layar permainan' },
  event: { title: 'Berita kota', description: 'Layar peristiwa' },
  ringkasan: { title: 'Ringkasan ronde', description: 'Ringkasan' },
  laporan: { title: 'Laporan Kota' },
};

export interface ScreenRouterOptions {
  statusMessage?: string;
  getState(): GameState;
  dispatch(action: GameAction): boolean;
  onStartNew(): Phase;
  onContinue(): Phase | null;
  onAudioChange(enabled: boolean): void;
  onPlacementModeChange(active: boolean): void;
  onFocusBoard(): void;
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
  const headings = {} as Record<Phase, HTMLHeadingElement>;
  const phaseAnnouncement = document.createElement('p');
  phaseAnnouncement.className = 'phase-announcement';
  phaseAnnouncement.setAttribute('role', 'status');
  phaseAnnouncement.setAttribute('aria-live', 'polite');
  phaseAnnouncement.setAttribute('aria-atomic', 'true');

  const createSoundToggle = (): HTMLButtonElement => {
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
    return soundToggle;
  };
  let statusMessage = options.statusMessage ?? '';
  const statusTexts: HTMLElement[] = [];
  const roundAutomation = createRoundAutomation(() => {
    if (options.getState().fase !== 'ringkasan') return;
    if (options.dispatch({ type: 'SELESAI_RONDE' })) {
      machine.restore(options.getState().fase);
      render();
    }
  });
  let continueButton: HTMLButtonElement | null = null;
  let previousRenderedPhase: Phase | null = null;
  document.addEventListener('visibilitychange', () => {
    roundAutomation.setVisible(document.visibilityState !== 'hidden');
  });

  for (const [phase, copy] of Object.entries(phaseCopy) as [Phase, typeof phaseCopy[Phase]][]) {
    const screen = document.createElement('section');
    screen.className = 'screen';
    screen.dataset.phase = phase;
    screen.setAttribute('aria-labelledby', `screen-title-${phase}`);

    const heading = document.createElement('h1');
    heading.tabIndex = -1;
    headings[phase] = heading;
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
    screen.append(heading);
    if (copy.description) {
      const description = document.createElement('p');
      description.textContent = copy.description;
      screen.append(description);
    }
    if (phase !== 'menu' && phase !== 'laporan') screen.append(createSoundToggle());
    if (phase === 'laporan') {
      const results = document.createElement('section');
      results.className = 'results-content ui-panel';
      results.setAttribute('aria-labelledby', 'results-heading');

      const resultHeading = document.createElement('h2');
      resultHeading.id = 'results-heading';
      resultHeading.textContent = 'Hasil sesi';
      results.append(resultHeading);
      screen.append(results);
      const returnToMenu = document.createElement('button');
      returnToMenu.className = 'menu-action report-back-menu';
      returnToMenu.type = 'button';
      returnToMenu.textContent = 'Kembali ke Menu Utama';
      returnToMenu.addEventListener('click', () => {
        machine.restore('menu');
        render();
      });
      screen.append(returnToMenu);

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
      start.textContent = 'Mulai baru';
      start.addEventListener('click', () => {
        machine.restore(options.onStartNew());
        render();
      });
      actions.append(start);

      continueButton = document.createElement('button');
      continueButton.className = 'menu-action';
      continueButton.type = 'button';
      continueButton.textContent = 'Lanjutkan permainan';
      continueButton.hidden = true;
      continueButton.addEventListener('click', () => {
        const phaseToRestore = options.onContinue();
        if (phaseToRestore === null) return;
        machine.restore(phaseToRestore);
        render();
      });
      actions.append(continueButton);

      const settingsTrigger = document.createElement('button');
      settingsTrigger.className = 'menu-action menu-settings-trigger';
      settingsTrigger.type = 'button';
      settingsTrigger.textContent = 'Pengaturan';
      settingsTrigger.setAttribute('aria-haspopup', 'dialog');
      settingsTrigger.setAttribute('aria-expanded', 'false');

      const settingsDialog = document.createElement('dialog');
      settingsDialog.id = 'menu-settings-dialog';
      settingsDialog.className = 'accessibility-dialog ui-panel menu-settings-dialog';
      settingsDialog.setAttribute('aria-labelledby', 'menu-settings-title');
      settingsTrigger.setAttribute('aria-controls', settingsDialog.id);

      const settingsHeading = document.createElement('h2');
      settingsHeading.id = 'menu-settings-title';
      settingsHeading.textContent = 'Pengaturan';

      const soundToggle = createSoundToggle();
      soundToggle.classList.add('menu-settings-sound-toggle');
      settingsDialog.append(settingsHeading, soundToggle);
      const syncAccessibilityOptions = mountAccessibilityOptions(settingsDialog);

      const settingsClose = document.createElement('button');
      settingsClose.className = 'menu-settings-close';
      settingsClose.type = 'button';
      settingsClose.textContent = 'Selesai';
      settingsClose.addEventListener('click', () => settingsDialog.close());
      settingsDialog.append(settingsClose);

      settingsTrigger.addEventListener('click', () => {
        syncAccessibilityOptions();
        settingsTrigger.setAttribute('aria-expanded', 'true');
        settingsDialog.showModal();
      });
      settingsDialog.addEventListener('close', () => {
        settingsTrigger.setAttribute('aria-expanded', 'false');
        settingsTrigger.focus();
      });
      actions.append(settingsTrigger);

      const phaseStatus = document.createElement('p');
      phaseStatus.className = 'save-status';
      phaseStatus.setAttribute('role', 'status');
      phaseStatus.setAttribute('aria-live', 'polite');
      phaseStatus.textContent = phase === 'menu' ? statusMessage : '';
      statusTexts.push(phaseStatus);
      screen.append(actions, phaseStatus, settingsDialog);
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
        onPlacementModeChange: options.onPlacementModeChange,
        onFocusBoard: options.onFocusBoard,
        onStateChange() {
          machine.restore(options.getState().fase);
          render();
        },
      });
    }
    if (phase !== 'menu' && phase !== 'laporan') mountAccessibilityControls(screen);
    root.append(screen);
    screens[phase] = screen;
  }
  root.append(phaseAnnouncement);

  function render(): void {
    const currentMachine = machine.getPhase();
    const state = options.getState();
    const statePhase = state.fase;
    if (currentMachine !== 'menu' && currentMachine !== statePhase) machine.restore(statePhase);
    if (continueButton) {
      continueButton.hidden = state.fase === 'menu';
      continueButton.textContent = state.ronde === 10 &&
        (state.fase === 'ringkasan' || state.fase === 'laporan')
        ? 'Lihat hasil tersimpan'
        : `Lanjutkan permainan (ronde ${state.ronde})`;
    }
    const current = machine.getPhase();
    roundAutomation.update(current === statePhase ? statePhase : current, state.ronde, state.seed);
    roundAutomation.setVisible(document.visibilityState !== 'hidden');
    for (const phase of Object.keys(screens) as Phase[]) screens[phase].hidden = phase !== current;
    huds[current]?.render();
    if (current !== previousRenderedPhase) {
      if (previousRenderedPhase !== null) {
        headings[current].focus();
        const title = phaseCopy[current].title;
        phaseAnnouncement.textContent = ['ronde', 'event', 'ringkasan'].includes(current)
          ? `Ronde ${state.ronde}: ${title}`
          : title;
      }
      previousRenderedPhase = current;
    }
    if (current === 'laporan') renderReport(screens.laporan.querySelector('.results-content')!);
  }
  window.addEventListener('hashchange', render);

  const renderReport = createReportView({
    getState: options.getState,
    hitungSkorAkhir: options.hitungSkorAkhir,
    returnToMenu: root.querySelector<HTMLButtonElement>('.report-back-menu')!,
  });

  return {
    render,
    setStatus(message) {
      statusMessage = message;
      for (const statusText of statusTexts) statusText.textContent = message;
    },
  };
}
