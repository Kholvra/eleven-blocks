import { mountAccessibilityControls } from './accessibilityControls';
import { createAudioController } from '../audio/audio';
import type { GameMachine, Phase } from '../game/machine';
const phaseCopy: Record<Phase, { title: string; description: string }> = {
  menu: { title: 'Eleven Blocks', description: 'Menu utama' },
  tutorial: { title: 'Tutorial', description: 'Pengenalan permainan' },
  ronde: { title: 'Ronde', description: 'Layar permainan' },
  event: { title: 'Berita kota', description: 'Layar peristiwa' },
  ringkasan: { title: 'Ringkasan ronde', description: 'Ringkasan' },
  laporan: { title: 'Laporan Kota', description: 'Laporan akhir' },
  tiket: { title: 'Tiket Keluar', description: 'Tiket sesi' },
};

export interface ScreenRouter {
  render(): void;
}

export function createScreenRouter(root: HTMLElement, machine: GameMachine): ScreenRouter {
  const screens = {} as Record<Phase, HTMLElement>;
  const audio = createAudioController();
  const soundToggles: HTMLButtonElement[] = [];

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
    });
    soundToggles.push(soundToggle);

    screen.append(heading, description, soundToggle);
    mountAccessibilityControls(screen);
    root.append(screen);
    screens[phase] = screen;
  }

  return {
    render() {
      const current = machine.getPhase();
      for (const phase of Object.keys(screens) as Phase[]) {
        screens[phase].hidden = phase !== current;
      }
    },
  };
}
