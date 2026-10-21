import { mountAccessibilityControls } from './accessibilityControls';
import { createAudioController } from '../audio/audio';
import type { GameMachine, Phase } from '../game/machine';

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
  }

  return {
    render,
    setStatus(message) {
      statusMessage = message;
      for (const statusText of statusTexts) statusText.textContent = message;
    },
  };
}
