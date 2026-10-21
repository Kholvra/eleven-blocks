import clickUrl from './sfx/click.mp3';
import confirmUrl from './sfx/confirm.mp3';
import impactUrl from './sfx/impact.mp3';

import { loadSettings, saveSettings } from '../save/settings';

type SoundName = 'click' | 'confirm' | 'impact';
type SoundState = {
  url: string;
  buffer: AudioBuffer | null;
  loading: boolean;
  broken: boolean;
};

export interface AudioController {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  playClick(): void;
  playConfirm(): void;
  playImpact(): void;
}

export function createAudioController(): AudioController {
  let enabled = loadSettings().audio;
  let context: AudioContext | null = null;
  let activation = 0;
  const warned = new Set<string>();
  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    try {
      console.warn(`[audio] ${message}`);
    } catch {
      // Diagnostics must never interfere with gameplay.
    }
  };
  const sounds: Record<SoundName, SoundState> = {
    click: { url: clickUrl, buffer: null, loading: false, broken: false },
    confirm: { url: confirmUrl, buffer: null, loading: false, broken: false },
    impact: { url: impactUrl, buffer: null, loading: false, broken: false },
  };

  function getContext(): AudioContext | null {
    if (context) return context;
    try {
      const Context = window.AudioContext;
      if (!Context) {
        warnOnce('context', 'AudioContext is unavailable.');
        return null;
      }
      context = new Context();
      return context;
    } catch {
      warnOnce('context', 'AudioContext could not be created.');
      return null;
    }
  }

  function loadSound(sound: SoundState, name: SoundName, audioContext: AudioContext): void {
    try {
      if (sound.buffer || sound.loading || sound.broken) return;
      sound.loading = true;
      void Promise.resolve()
        .then(() => fetch(sound.url))
        .then((response) => {
          if (!response.ok) throw new Error('SFX unavailable');
          return response.arrayBuffer();
        })
        .then((data) => audioContext.decodeAudioData(data))
        .then((buffer) => { sound.buffer = buffer; })
        .catch(() => {
          sound.broken = true;
          warnOnce(`asset:${name}`, `The ${name} sound could not be loaded or decoded.`);
        })
        .finally(() => { sound.loading = false; });
    } catch {
      sound.loading = false;
      sound.broken = true;
      warnOnce(`asset:${name}`, `The ${name} sound could not be loaded or decoded.`);
    }
  }

  function playUnlockSilence(audioContext: AudioContext): void {
    try {
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
    } catch {
      warnOnce('unlock-silence', 'The silent audio unlock buffer could not be started.');
    }
  }

  function unlockAndLoad(): void {
    try {
      const audioContext = getContext();
      if (!audioContext) return;
      playUnlockSilence(audioContext);
      try {
        if (audioContext.state !== 'running') {
          void Promise.resolve(audioContext.resume()).catch(() => {
            warnOnce('unlock', 'AudioContext could not be resumed.');
          });
        }
      } catch {
        warnOnce('unlock', 'AudioContext could not be resumed.');
      }
      for (const name of Object.keys(sounds) as SoundName[]) {
        loadSound(sounds[name], name, audioContext);
      }
    } catch {
      warnOnce('unlock', 'AudioContext could not be unlocked.');
    }
  }

  function play(name: SoundName): void {
    try {
      const playActivation = activation;
      if (!enabled) return;
      const sound = sounds[name];
      if (!context) {
        // This player gesture unlocks and loads audio, but its event is intentionally dropped.
        unlockAndLoad();
        return;
      }
      const audioContext = context;
      if (!sound.buffer || sound.broken) return;

      const start = (): void => {
        try {
          if (!enabled || audioContext.state !== 'running' || activation !== playActivation) return;
          const source = audioContext.createBufferSource();
          source.buffer = sound.buffer;
          source.connect(audioContext.destination);
          source.start();
        } catch {
          warnOnce(`playback:${name}`, `The ${name} sound could not be played.`);
        }
      };

      if (audioContext.state === 'running') {
        start();
        return;
      }
      try {
        void Promise.resolve(audioContext.resume()).then(start).catch(() => {
          warnOnce('unlock', 'AudioContext could not be resumed.');
        });
      } catch {
        warnOnce('unlock', 'AudioContext could not be resumed.');
      }
    } catch {
      warnOnce(`playback:${name}`, `The ${name} sound could not be played.`);
    }
  }

  return {
    isEnabled: () => enabled,
    setEnabled(value: boolean): void {
      try {
        activation += 1;
        enabled = value;
        saveSettings({ audio: value });
        if (value) unlockAndLoad();
      } catch {
        warnOnce('unlock', 'Audio preference could not be applied.');
      }
    },
    playClick: () => play('click'),
    playConfirm: () => play('confirm'),
    playImpact: () => play('impact'),
  };
}
