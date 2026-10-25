import airIcon from '../assets/icons/meter-udara.svg';
import accessIcon from '../assets/icons/meter-akses.svg';
import greenIcon from '../assets/icons/meter-hijau.svg';
import citizenIcon from '../assets/icons/meter-warga.svg';
import { createAudioController } from '../audio/audio';

import balance from '../data/balance.json';
import actions from '../data/actions.json';
import { createTutorialGuide } from './tutorial';
import cards from '../data/cards.json';
import events from '../data/events.json';
import hudCopy from '../data/hud.json';

import { BUILDABLE_CELLS, labelCell } from '../game/board';
import { biayaAksi, biayaKartu, firstOpenBuildableCell, statusAksi, statusKartu } from '../game/cards';
import { hitungPreview } from '../game/preview';
import type { PreviewCandidate, PreviewResult } from '../game/preview';
import type { GameAction } from '../game/engine';
import type { AudioController } from '../audio/audio';
import { actionIconFor, categoryIconFor, modelImageForAction, modelImageForCard } from './cardArt';

import type { Efek, GameState, KunciMeter } from '../game/types';


const meterIcons: Record<KunciMeter, string> = {
  udara: airIcon,
  akses: accessIcon,
  hijau: greenIcon,
  warga: citizenIcon,
};



export interface HudRenderer {
  render(): void;
}

type HudOptions = {
  getState(): GameState;
  dispatch(action: GameAction): boolean;
  onStateChange(): void;
  onPlacementModeChange(active: boolean): void;
  onFocusBoard(): void;
};

type MeterNode = { root: HTMLElement; value: HTMLOutputElement; bar: HTMLElement; delta: HTMLElement };

const meterOrder: readonly KunciMeter[] = ['udara', 'akses', 'hijau', 'warga'];
let nextHudInstanceId = 0;

const previewAnchors = new WeakMap<HTMLElement, HTMLElement>();

const gamePhases: readonly GameState['fase'][] = ['ronde', 'event', 'ringkasan'];


export function createHud(container: HTMLElement, options: HudOptions): HudRenderer {
  const audio = createAudioController();
  let selectedCardIdx: number | null = null;
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.setAttribute('aria-label', hudCopy.copy.statusLabel);


  const status = document.createElement('dl');
  status.className = 'hud-status game-topbar';
  const budgetItem = makeStatusItem(hudCopy.copy.moneyTitle);
  const roundItem = makeStatusItem(hudCopy.copy.round);
  const header = document.createElement('header');
  header.className = 'hud-header game-topbar';
  const moneyCard = budgetItem.root;
  moneyCard.classList.add('game-money-card');
  const levelCard = roundItem.root;
  levelCard.classList.add('game-level-card');
  const quickNav = document.createElement('nav');
  quickNav.className = 'game-quick-controls';
  quickNav.setAttribute('aria-label', 'Kontrol permainan');
  const soundButton = document.createElement('button');
  soundButton.type = 'button';
  soundButton.className = 'game-control-button ui-panel';
  soundButton.textContent = `🔊 ${hudCopy.copy.sound}`;
  soundButton.addEventListener('click', () => {
    const enabled = !options.getState().setelan.audio;
    audio.setEnabled(enabled);
    if (options.dispatch({ type: 'SETELAN_AUDIO', aktif: enabled })) options.onStateChange();
  });
  const accessibilityButton = document.createElement('button');
  accessibilityButton.type = 'button';
  accessibilityButton.className = 'game-control-button ui-panel';
  accessibilityButton.textContent = `⚙️ ${hudCopy.copy.accessibility}`;
  accessibilityButton.setAttribute('aria-pressed', 'false');
  accessibilityButton.addEventListener('click', () => {
    const scales = ['100', '115', '130'];
    const current = document.documentElement.dataset.fontScale ?? '100';
    const next = scales[(scales.indexOf(current) + 1) % scales.length]!;
    document.documentElement.dataset.fontScale = next;
    accessibilityButton.setAttribute('aria-pressed', String(next !== '100'));
    accessibilityButton.setAttribute('aria-label', `${hudCopy.copy.accessibility}: ${next}%`);
  });
  const helpButton = document.createElement('button');
  helpButton.type = 'button';
  helpButton.className = 'game-control-button ui-panel';
  helpButton.textContent = `❓ ${hudCopy.copy.howToPlay}`;
  const helpDialog = document.createElement('dialog');
  helpDialog.className = 'game-help-dialog';
  helpDialog.append(createTutorialGuide(() => helpDialog.close()));
  helpButton.addEventListener('click', () => helpDialog.showModal());
  const settingsTrigger = document.createElement('button');
  settingsTrigger.type = 'button';
  settingsTrigger.className = 'game-control-button ui-panel game-settings-trigger';
  settingsTrigger.textContent = '⚙︎';
  settingsTrigger.setAttribute('aria-label', 'Pengaturan');
  settingsTrigger.setAttribute('title', 'Pengaturan');
  settingsTrigger.setAttribute('aria-haspopup', 'dialog');
  settingsTrigger.setAttribute('aria-expanded', 'false');
  const settingsDialog = document.createElement('dialog');
  settingsDialog.id = `game-settings-dialog-${++nextHudInstanceId}`;
  settingsDialog.className = 'accessibility-dialog game-settings-dialog ui-panel';
  settingsDialog.setAttribute('aria-labelledby', `${settingsDialog.id}-title`);
  settingsTrigger.setAttribute('aria-controls', settingsDialog.id);
  const settingsTitle = document.createElement('h2');
  settingsTitle.id = `${settingsDialog.id}-title`;
  settingsTitle.textContent = 'Pengaturan';
  const settingsActions = document.createElement('div');
  settingsActions.className = 'game-settings-actions';
  settingsActions.append(soundButton, accessibilityButton, helpButton);
  const settingsClose = document.createElement('button');
  settingsClose.type = 'button';
  settingsClose.className = 'game-control-button ui-panel game-settings-close';
  settingsClose.textContent = 'Tutup';
  settingsClose.addEventListener('click', () => settingsDialog.close());
  settingsDialog.append(settingsTitle, settingsActions, settingsClose);
  settingsTrigger.addEventListener('click', () => {
    settingsTrigger.setAttribute('aria-expanded', 'true');
    settingsDialog.showModal();
  });
  settingsDialog.addEventListener('close', () => {
    settingsTrigger.setAttribute('aria-expanded', 'false');
    settingsTrigger.focus();
  });
  quickNav.append(settingsTrigger);
  status.append(moneyCard, levelCard);
  header.append(status, quickNav);

  const meters = document.createElement('section');
  meters.className = 'hud-meters hud-meter-strip game-resources';
  meters.setAttribute('aria-label', hudCopy.copy.resources);
  const meterNodes = {} as Record<KunciMeter, MeterNode>;
  for (const key of meterOrder) {
    const source = hudCopy.meter[key];
    const chip = document.createElement('article');
    chip.className = 'meter-chip game-resource-meter';
    chip.dataset.meter = key === 'hijau' ? 'rth' : key === 'warga' ? 'kesejahteraan' : key;
    const label = document.createElement('h3');
    label.textContent = key === 'akses' ? 'Akses' : key === 'hijau' ? 'Hijau' : key === 'warga' ? 'Warga' : 'Udara';
    const symbol = document.createElement('span');
    symbol.className = 'meter-symbol';
    symbol.style.setProperty('--meter-icon', `url("${meterIcons[key]}")`);
    symbol.setAttribute('aria-hidden', 'true');
    const value = document.createElement('output');
    value.className = 'meter-value';
    const progress = document.createElement('div');
    progress.className = 'meter-progress game-meter-track';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    const bar = document.createElement('span');
    bar.setAttribute('aria-hidden', 'true');
    progress.append(bar);
    const delta = document.createElement('p');
    delta.className = 'meter-delta';
    chip.append(label, symbol, value, progress, delta);
    meters.append(chip);
    meterNodes[key] = { root: chip, value, bar, delta };
  }


  const news = document.createElement('section');
  news.className = 'hud-news game-events';
  news.setAttribute('aria-label', hudCopy.copy.events);
  const newsTitle = document.createElement('h2');
  newsTitle.className = 'hud-news-toggle';
  newsTitle.textContent = hudCopy.copy.events;
  const newsBody = document.createElement('div');
  newsBody.className = 'game-event-body';
  news.append(newsTitle, newsBody);

  const cardList = document.createElement('ul');
  cardList.className = 'simple-tray simple-tray--policy';
  cardList.setAttribute('aria-label', hudCopy.copy.policy);
  const preview = document.createElement('section');
  preview.className = 'hud-preview game-preview-bubble';
  preview.hidden = true;
  preview.setAttribute('aria-live', 'polite');
  preview.setAttribute('aria-atomic', 'true');
  preview.setAttribute('aria-label', 'Pratinjau dampak');
  window.addEventListener('resize', () => {
    const anchor = previewAnchors.get(preview);
    if (anchor) positionPreview(preview, anchor);
  });

  let previewHideTimer: number | null = null;
  let previewClassTimer: number | null = null;
  const previewShowTimer = { frame: null as number | null };
  const cancelPreviewHide = (): void => {
    if (previewHideTimer !== null) {
      window.clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }
  };
  // Keluar: kelas `is-open` dilepas lebih dulu supaya transisi jalan, elemen baru disembunyikan
  // setelah durasinya selesai. Kalau muncul lagi sebelum selesai, timer ini tidak menyembunyikan.
  const hidePreview = (): void => {
    if (previewShowTimer.frame !== null) {
      window.cancelAnimationFrame(previewShowTimer.frame);
      previewShowTimer.frame = null;
    }
    if (preview.hidden) return;
    preview.classList.remove('is-open');
    if (previewClassTimer !== null) window.clearTimeout(previewClassTimer);
    previewClassTimer = window.setTimeout(() => {
      previewClassTimer = null;
      if (!preview.classList.contains('is-open')) preview.hidden = true;
    }, 170);
  };
  const hasPreviewFocus = (): boolean => {
    const active = document.activeElement;
    return active instanceof HTMLElement && preview.contains(active) && active.matches(':focus-visible');
  };
  const dismissPreview = (): void => {
    if (preview.matches(':hover') || hasPreviewFocus()) return;
    cancelPreviewHide();
    previewHideTimer = window.setTimeout(() => {
      previewHideTimer = null;
      if (preview.matches(':hover') || hasPreviewFocus()) return;
      if (selectedCardIdx === null) hidePreview();
    }, 700);
  };
  preview.addEventListener('mouseenter', cancelPreviewHide);
  preview.addEventListener('mouseleave', () => {
    if (selectedCardIdx === null) dismissPreview();
  });
  const actionList = document.createElement('ul');
  actionList.className = 'simple-tray simple-tray--action';
  actionList.setAttribute('aria-label', hudCopy.copy.actions);
  const dock = document.createElement('section');
  dock.className = 'game-card-dock game-card-dock--simple';
  dock.setAttribute('aria-label', hudCopy.copy.cardList);
  const dockInner = document.createElement('div');
  dockInner.className = 'simple-dock-inner';
  const rail = document.createElement('div');
  rail.className = 'simple-rail';
  rail.append(cardList, actionList);
  const deselectButton = document.createElement('button');
  deselectButton.type = 'button';
  deselectButton.className = 'simple-cancel';
  deselectButton.textContent = hudCopy.copy.deselectCard;
  deselectButton.hidden = true;
  deselectButton.addEventListener('click', () => {
    audio.playClick();
    clearSelection();
    options.onStateChange();
  });
  const advance = document.createElement('button');
  advance.type = 'button';
  advance.className = 'game-control-button game-round-advance ui-panel';
  quickNav.prepend(advance);
  const footer = document.createElement('div');
  footer.className = 'simple-footer';
  footer.append(deselectButton);
  dockInner.append(rail, footer);
  dock.append(preview, dockInner);
  const clearSelection = (): void => {
    selectedCardIdx = null;
    cancelPreviewHide();
    hidePreview();
    deselectButton.hidden = true;
    options.onPlacementModeChange(false);
  };

  const rightSidebar = document.createElement('aside');
  rightSidebar.className = 'game-right-sidebar';
  rightSidebar.append(news);
  const layout = document.createElement('div');
  layout.className = 'game-hud-layout';
  layout.append(rightSidebar);

  const disclaimer = document.createElement('p');
  disclaimer.className = 'hud-disclaimer';
  disclaimer.id = 'hud-meter-disclaimer';
  disclaimer.textContent = hudCopy.copy.disclaimer;
  meters.setAttribute('aria-describedby', disclaimer.id);

  const live = document.createElement('p');
  live.className = 'hud-live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');

  const error = document.createElement('p');
  error.className = 'hud-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  container.append(error);

  const actionDialog = document.createElement('dialog');
  actionDialog.className = 'simple-action-dialog ui-panel';
  actionDialog.setAttribute('aria-label', hudCopy.copy.exchangeTitle);
  const actionDialogTitle = document.createElement('h2');
  const actionDialogBody = document.createElement('p');
  const actionDialogChoices = document.createElement('div');
  actionDialogChoices.className = 'simple-action-choices';
  const actionDialogCancel = document.createElement('button');
  actionDialogCancel.type = 'button';
  actionDialogCancel.className = 'simple-cancel';
  actionDialogCancel.textContent = hudCopy.copy.cancel;
  actionDialogCancel.addEventListener('click', () => actionDialog.close());
  actionDialog.append(actionDialogTitle, actionDialogBody, actionDialogChoices, actionDialogCancel);
  const eventDialog = document.createElement('dialog');
  eventDialog.id = `${settingsDialog.id}-decision`;
  eventDialog.className = 'simple-action-dialog event-decision-dialog ui-panel';
  eventDialog.setAttribute('aria-labelledby', `${eventDialog.id}-title`);
  const eventDialogTitle = document.createElement('h2');
  eventDialogTitle.id = `${eventDialog.id}-title`;
  const eventDialogNarrative = document.createElement('p');
  eventDialogNarrative.id = `${eventDialog.id}-narrative`;
  eventDialog.setAttribute('aria-describedby', eventDialogNarrative.id);
  const eventDialogChoices = document.createElement('div');
  eventDialogChoices.className = 'simple-action-choices';
  const eventDialogError = document.createElement('p');
  eventDialogError.setAttribute('role', 'alert');
  eventDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.preventDefault();
  });
  eventDialog.addEventListener('cancel', (event) => event.preventDefault());
  eventDialog.append(eventDialogTitle, eventDialogNarrative, eventDialogChoices, eventDialogError);

  advance.addEventListener('click', () => {
    const state = options.getState();
    if (state.fase !== 'ronde' || state.tahapRonde !== 'tangan' || state.kartuDimainkanRondeIni !== null) return;
    clearSelection();
    if (options.dispatch({ type: 'LEWATI_RONDE' })) options.onStateChange();
  });
  hud.append(header, layout, meters, dock, settingsDialog, helpDialog, actionDialog, eventDialog, disclaimer, live);
  container.append(hud);

  const placeSelectedCard = (cell: number): void => {
    if (selectedCardIdx === null) return;
    const current = options.getState();
    if (!statusKartu(current, selectedCardIdx).available || !BUILDABLE_CELLS.includes(cell) ||
        current.papan.ubin[cell] !== null && current.papan.ubin[cell] !== undefined) return;
    audio.playClick();
    if (options.dispatch({ type: 'MAIN_KARTU', kartuIdx: selectedCardIdx, selIdx: cell })) {
      audio.playConfirm();
      selectedCardIdx = null;
      options.onPlacementModeChange(false);
      options.onStateChange();
    }
  };
  const onBoardTileClick = (event: Event): void => {
    const detail = (event as CustomEvent<{ selIdx?: unknown }>).detail;
    if (typeof detail?.selIdx === 'number' && Number.isInteger(detail.selIdx)) placeSelectedCard(detail.selIdx);
  };
  window.addEventListener('board-tile-click', onBoardTileClick);
  hud.addEventListener('click', (event) => {
    if (selectedCardIdx === null || (event.target as HTMLElement).closest('.hud-card, .game-card-dock, .game-hud-layout, .hud-actions, .game-topbar')) return;
    clearSelection();
    options.onStateChange();
  });
  document.addEventListener('click', (event) => {
    if (selectedCardIdx === null || (event.target as HTMLElement).closest('.game-playing-card, .game-card-dock, .simple-action-dialog, .hud-preview')) return;
    clearSelection();
    options.onStateChange();
  });

  const openExchangeDialog = (): void => {
    const state = options.getState();
    const candidates = state.tangan.filter((index) => statusAksi(state, 'ACT04', index).available);
    clearSelection();
    actionDialogTitle.textContent = hudCopy.copy.exchangeTitle;
    actionDialogBody.textContent = hudCopy.copy.exchangeBody;
    actionDialogChoices.replaceChildren();
    if (candidates.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = hudCopy.copy.exchangeEmpty;
      actionDialogChoices.append(empty);
    }
    for (const index of candidates) {
      const card = cards.kebijakan[index];
      if (!card) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'simple-choice';
      button.textContent = hudCopy.copy.exchangeCard.replace('{card}', card.nama);
      button.addEventListener('click', () => {
        audio.playClick();
        if (options.dispatch({ type: 'MAIN_AKSI', aksiId: 'ACT04', kartuIdx: index })) {
          audio.playConfirm();
          actionDialog.close();
          clearSelection();
          options.onStateChange();
        } else {
          actionDialogBody.textContent = hudCopy.copy.actionFailed;
        }
      });
      actionDialogChoices.append(button);
    }
    if (!actionDialog.open) actionDialog.showModal();
  };

  const getPendingEvent = (state: GameState) => {
    const active = state.eventAktif;
    if (state.fase !== 'event' || active === null || active.dipilih !== null) return undefined;
    return events.event.find((event) => event.id === active.id && event.jenis === 'interaktif');
  };

  eventDialog.addEventListener('close', () => {
    if (getPendingEvent(options.getState())) {
      eventDialog.showModal();
      return;
    }
    document.querySelector<HTMLElement>('.screen:not([hidden]) > h1')?.focus();
  });

  const openEventDecision = (event: (typeof events.event)[number]): void => {
    const current = options.getState();
    if (current.fase !== 'event' || current.eventAktif === null ||
        current.eventAktif.id !== event.id || current.eventAktif.dipilih !== null) return;

    eventDialogTitle.textContent = event.judul;
    eventDialogNarrative.textContent = event.narasi;
    eventDialogError.textContent = '';
    eventDialogChoices.replaceChildren();
    const choices = document.createElement('fieldset');
    choices.className = 'game-event-choices';
    const legend = document.createElement('legend');
    legend.textContent = hudCopy.copy.eventChoiceLegend;
    choices.append(legend);
    for (const choice of event.pilihan) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-event-choice';
      const unaffordable = choice.biaya > current.anggaran;
      button.disabled = unaffordable;
      button.setAttribute('aria-label', `${choice.teks}. ${hudCopy.copy.eventChoiceCost.replace('{cost}', String(choice.biaya))}${unaffordable ? `. ${hudCopy.copy.eventChoiceUnaffordable}` : ''}`);
      const text = document.createElement('span');
      text.textContent = choice.teks;
      const cost = document.createElement('span');
      cost.className = 'game-event-choice-cost';
      cost.textContent = `${hudCopy.copy.eventChoiceCost.replace('{cost}', String(choice.biaya))}${unaffordable ? ` · ${hudCopy.copy.eventChoiceUnaffordable}` : ''}`;
      button.append(text, cost);
      button.addEventListener('click', () => {
        audio.playClick();
        if (!options.dispatch({ type: 'PILIH_EVENT', eventId: event.id, pilihanId: choice.id })) {
          eventDialogError.textContent = hudCopy.copy.eventChoiceFailed;
          return;
        }
        audio.playConfirm();
        eventDialog.close();
        clearSelection();
        options.onStateChange();
      });
      choices.append(button);
    }
    eventDialogChoices.append(choices);
    if (!eventDialog.open) eventDialog.showModal();
  };

  let renderedNewsRound = 0;
  let initialRender = true;
  let announcedNote = '';

  return {
    render() {
      cancelPreviewHide();
      hidePreview();
      preview.replaceChildren();
      const state = options.getState();
      if (!validState(state)) {
        hud.hidden = true;
        error.hidden = false;
        error.textContent = hudCopy.copy.invalidState;
        return;
      }
      error.hidden = true;
      hud.hidden = !gamePhases.includes(state.fase);
      if (hud.hidden) return;
      dock.hidden = state.fase === 'event';

      roundItem.value.textContent = `${state.ronde}/10`;
      budgetItem.value.textContent = String(state.anggaran);
      budgetItem.value.setAttribute('aria-label', `${state.anggaran} ${hudCopy.copy.moneyTitle.toLowerCase()}`);
      soundButton.textContent = `${state.setelan.audio ? '🔊' : '🔇'} ${hudCopy.copy.sound}`;
      soundButton.setAttribute('aria-pressed', String(state.setelan.audio));
      const resetNewsScroll = renderedNewsRound !== state.ronde;
      renderNews(newsBody, state, resetNewsScroll);
      renderedNewsRound = state.ronde;
      const pendingEvent = getPendingEvent(state);
      if (pendingEvent) {
        if (!eventDialog.open) openEventDecision(pendingEvent);
      } else if (eventDialog.open) {
        eventDialog.close();
      }
      const delta = latestDelta(state);
      for (const key of meterOrder) {
        const node = meterNodes[key];
        const value = state.meter[key];
        node.value.value = `${value} / 100`;
        node.value.textContent = `${value} / 100`;
        node.root.setAttribute('aria-label', hudCopy.copy.accessibleMeter.replace('{label}', hudCopy.meter[key].label).replace('{value}', `${value} / 100`));
        const progress = node.root.querySelector<HTMLElement>('.meter-progress');
        progress?.setAttribute('aria-valuenow', String(value));
        progress?.setAttribute('aria-label', hudCopy.meter[key].label);
        node.bar.style.width = `${value}%`;
        const change = delta?.[key] ?? 0;
        node.delta.textContent = change === 0 ? '' : `${change > 0 ? '+' : ''}${change}`;
        node.delta.hidden = change === 0;
        if (change === 0) node.delta.removeAttribute('aria-label');
        else node.delta.setAttribute('aria-label', `${hudCopy.meter[key].label} ${node.delta.textContent}`);
      }

      renderCards(cardList, state, options, (candidate, anchor) => {
        cancelPreviewHide();
        renderPreview(preview, candidate, state, anchor);
      }, selectedCardIdx, (index) => {
        selectedCardIdx = index;
        options.onPlacementModeChange(true);
        deselectButton.hidden = false;
        audio.playClick();
      }, audio, dismissPreview);
      renderActions(actionList, state, options, (candidate, anchor) => {
        cancelPreviewHide();
        renderPreview(preview, candidate, state, anchor);
      }, audio, openExchangeDialog, () => {
        clearSelection();
      }, dismissPreview);
      deselectButton.hidden = selectedCardIdx === null;
      footer.hidden = deselectButton.hidden;
      const canSkipRound = state.fase === 'ronde' &&
        state.tahapRonde === 'tangan' &&
        state.kartuDimainkanRondeIni === null;
      advance.hidden = !canSkipRound;
      advance.textContent = hudCopy.copy.skipRound;
      advance.setAttribute('aria-label', hudCopy.copy.skipRound);

      const note = state.catatan.at(-1);
      const noteKey = note && note.ronde === state.ronde ? `${note.ronde}:${state.catatan.length}` : '';
      if (initialRender) {
        announcedNote = noteKey;
        initialRender = false;
      } else if (note && noteKey && noteKey !== announcedNote) {
        live.textContent = formatDelta(note.delta);
        announcedNote = noteKey;
      } else if (!noteKey) {
        live.textContent = '';
        announcedNote = '';
      }
    },
  };
}


function makeStatusItem(label: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'hud-status-item ui-panel';
  const term = document.createElement('dt');
  term.textContent = label;
  const value = document.createElement('dd');
  root.append(term, value);
  return { root, value };
}

function validState(value: GameState): boolean {
  return Boolean(value) &&
    ['menu', 'tutorial', 'ronde', 'event', 'ringkasan', 'laporan', 'tiket'].includes(value.fase) &&
    ['berita', 'tangan', 'resolusi', 'reaksi', 'transisi'].includes(value.tahapRonde) &&
    Number.isInteger(value.ronde) && value.ronde >= 1 && value.ronde <= 10 &&
    Number.isFinite(value.anggaran) && value.anggaran >= 0 &&
    meterOrder.every((key) => Number.isFinite(value.meter?.[key]) && value.meter[key] >= 0 && value.meter[key] <= 100) &&
    [value.tangan, value.deck].every((cardsInHand) =>
      Array.isArray(cardsInHand) && cardsInHand.every((index) =>
        Number.isInteger(index) && index >= 0 && index < cards.kebijakan.length,
      ),
    ) &&
    Array.isArray(value.catatan) && value.catatan.every((note) =>
      note && Number.isInteger(note.ronde) && note.ronde >= 1 && note.ronde <= 10 &&
      note.delta && typeof note.delta === 'object' &&
      meterOrder.every((key) => note.delta[key] === undefined || Number.isFinite(note.delta[key])),
    ) &&
    Array.isArray(value.papan?.ubin) && value.papan.ubin.length === 256;
}

function latestDelta(state: GameState): Efek | undefined {
  const latest = state.catatan.at(-1);
  return latest?.ronde === state.ronde ? latest.delta : undefined;
}

function formatDelta(delta: Efek): string {
  return meterOrder.flatMap((key) => {
    const value = delta[key];
    return value === undefined || value === 0 ? [] : [`${hudCopy.meter[key].label} ${value > 0 ? '+' : ''}${value}`];
  }).join(', ');
}

function renderNews(
  container: HTMLElement,
  state: GameState,
  resetScroll: boolean,
): void {
  const previousScrollTop = container.scrollTop;
  container.replaceChildren();
  const visibleEvents = events.event
    .filter((event) => event.ronde <= state.ronde)
    .sort((first, second) => first.ronde - second.ronde);
  if (visibleEvents.length === 0) {
    const message = document.createElement('p');
    message.textContent = hudCopy.copy.noNews;
    container.append(message);
  }

  for (const event of visibleEvents) {
    const article = document.createElement('article');
    article.className = 'game-event-item ui-panel';
    const label = document.createElement('p');
    label.className = 'game-event-round';
    label.textContent = hudCopy.copy.eventRound.replace('{round}', String(event.ronde));
    const title = document.createElement('h3');
    title.textContent = event.judul;
    const narrative = document.createElement('p');
    narrative.textContent = event.narasi;
    article.append(label, title, narrative);

    let eventNote = undefined as GameState['catatan'][number] | undefined;
    for (const note of state.catatan) {
      if (note.ronde === event.ronde && note.eventId === event.id) eventNote = note;
    }
    const pending = state.fase === 'event' &&
      state.eventAktif?.id === event.id &&
      state.eventAktif.dipilih === null;
    if (pending) {
      const decisionPending = document.createElement('p');
      decisionPending.className = 'game-event-feedback';
      decisionPending.textContent = hudCopy.copy.eventDecisionPending;
      article.append(decisionPending);
    } else if (eventNote?.pilihanEvent === 'lewati_tanpa_efek') {
      const feedback = document.createElement('p');
      feedback.className = 'game-event-feedback';
      feedback.textContent = hudCopy.copy.eventSkipped;
      article.append(feedback);
    } else if (eventNote?.pilihanEvent) {
      const choice = event.pilihan.find((item) => item.id === eventNote?.pilihanEvent);
      if (choice) {
        const feedback = document.createElement('p');
        feedback.className = 'game-event-feedback';
        feedback.textContent = hudCopy.copy.eventChoiceFeedback.replace('{choice}', choice.teks);
        article.append(feedback);
      }
    }
    container.append(article);
  }

  if (container.scrollHeight > container.clientHeight) {
    const scrollCue = document.createElement('span');
    scrollCue.className = 'game-event-scroll-cue';
    scrollCue.setAttribute('aria-hidden', 'true');
    container.prepend(scrollCue);
  }

  container.scrollTop = resetScroll ? container.scrollHeight : previousScrollTop;
}


function renderBoard(list: HTMLOListElement, state: GameState, selectedCardIdx: number | null): void {
  for (const item of list.children) {
    const element = item as HTMLLIElement;
    const cell = Number(element.dataset.cell);
    const code = labelCell(cell);
    const occupied = state.papan.ubin[cell];
    const button = element.querySelector<HTMLButtonElement>('.hud-board-cell');
    if (!button) continue;
    const empty = occupied === null || occupied === undefined;
    button.textContent = empty
      ? hudCopy.copy.cellEmpty.replace('{code}', code)
      : hudCopy.copy.cellOccupied.replace('{code}', code).replace('{card}', cards.kebijakan[occupied]?.nama ?? '');
    button.disabled = !empty;
    const placementHint = empty && selectedCardIdx !== null ? ' Tempatkan kartu terpilih di sini.' : '';
    button.setAttribute('aria-label', `${button.textContent ?? ''}${placementHint}`);
  }
}

function renderCards(
  list: HTMLUListElement,
  state: GameState,
  options: HudOptions,
  selectCandidate: (candidate: PreviewCandidate, anchor: HTMLElement) => void,
  selectedCardIdx: number | null,
  onSelect: (index: number) => void,
  audio: AudioController,
  dismissPreview: () => void,
): void {
  list.replaceChildren();
  for (const index of state.tangan) {
    const card = cards.kebijakan[index];
    if (!card) continue;
    const availability = statusKartu(state, index);
    const isSelected = selectedCardIdx === index;
    const item = document.createElement('li');
    item.className = 'simple-card simple-card--policy game-playing-card';
    item.dataset.card = String(index);
    item.dataset.name = card.nama;
    item.classList.toggle('is-selected', isSelected);
    item.classList.toggle('is-unavailable', !availability.available);
    if (availability.reason) item.title = availability.reason;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'simple-card-face';
    button.disabled = !availability.available;
    button.setAttribute('aria-pressed', String(isSelected));
    const categoryLabel = hudCopy.categories.labels[card.kategori as keyof typeof hudCopy.categories.labels] ?? card.kategori;
    const cost = biayaKartu(index);
    const selectLabel = hudCopy.copy.cardAriaSelect
      .replace('{name}', card.nama)
      .replace('{category}', categoryLabel)
      .replace('{cost}', String(cost ?? hudCopy.copy.unavailableCost));
    const placeLabel = hudCopy.copy.cardAriaPlace.replace('{name}', card.nama);
    const unavailableLabel = hudCopy.copy.cardAriaUnavailable
      .replace('{name}', card.nama)
      .replace('{reason}', availability.reason ?? hudCopy.copy.cardUnavailable);
    button.setAttribute('aria-label', availability.available ? (isSelected ? placeLabel : selectLabel) : unavailableLabel);
    button.dataset.labelDefault = availability.available ? selectLabel : unavailableLabel;

    const top = document.createElement('span');
    top.className = 'simple-card-top';
    const costBadge = document.createElement('span');
    costBadge.className = 'simple-card-cost';
    const coin = document.createElement('span');
    coin.className = 'simple-card-coin';
    coin.setAttribute('aria-hidden', 'true');
    costBadge.append(coin, document.createTextNode(String(cost ?? '?')));
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'simple-card-category';
    const categoryIcon = categoryIconFor(String(card.kategori));
    if (categoryIcon) {
      const icon = document.createElement('img');
      icon.src = categoryIcon;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      categoryBadge.append(icon);
    }
    top.append(costBadge, categoryBadge);

    const art = document.createElement('span');
    art.className = 'simple-card-art';
    const model = document.createElement('img');
    model.className = 'simple-card-model';
    model.src = modelImageForCard(card.id, String(card.kategori));
    model.alt = '';
    model.loading = 'lazy';
    model.decoding = 'async';
    model.setAttribute('aria-hidden', 'true');
    art.append(model);

    const name = document.createElement('span');
    name.className = 'simple-card-name';
    const nameText = document.createElement('span');
    nameText.className = 'simple-card-name-text';
    nameText.textContent = card.nama;
    name.append(nameText);

    const check = document.createElement('span');
    check.className = 'simple-card-check';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    check.hidden = !isSelected;

    button.append(top, art, name, check);
    item.append(button);
    list.append(item);

    const preview = (): void => {
      if (!availability.available) return;
      const cell = firstOpenBuildableCell(options.getState());
      if (cell !== null) selectCandidate({ type: 'policy', kartuIdx: index, selIdx: cell }, button);
    };
    button.addEventListener('click', (event) => {
      if (!availability.available) return;
      onSelect(index);
      preview();
      for (const other of list.querySelectorAll<HTMLElement>('.simple-card')) {
        const active = other === item;
        other.classList.toggle('is-selected', active);
        const otherButton = other.querySelector<HTMLButtonElement>('.simple-card-face');
        if (otherButton) {
          otherButton.setAttribute('aria-pressed', String(active));
          otherButton.setAttribute('aria-label', active
            ? hudCopy.copy.cardAriaPlace.replace('{name}', other.dataset.name ?? '')
            : otherButton.dataset.labelDefault ?? '');
        }
        const otherCheck = other.querySelector<HTMLElement>('.simple-card-check');
        if (otherCheck) otherCheck.hidden = !active;
      }
      if (event.detail === 0) options.onFocusBoard();
    });
    button.addEventListener('mouseenter', preview);
    button.addEventListener('focus', preview);
    item.addEventListener('mouseleave', () => {
      if (!item.classList.contains('is-selected')) dismissPreview();
    });
  }
}

function renderActions(
  list: HTMLUListElement,
  state: GameState,
  options: HudOptions,
  selectCandidate: (candidate: PreviewCandidate, anchor: HTMLElement) => void,
  audio: AudioController,
  onExchange: () => void,
  onPlayed: () => void,
  dismissPreview: () => void,
): void {
  list.replaceChildren();
  for (const action of actions.aksi) {
    const firstCard = state.tangan[0];
    const exchangeStatus = action.id === 'ACT04' ? statusAksi(state, action.id, firstCard) : null;
    const previewCard = exchangeStatus?.available ? firstCard : undefined;
    const availability = exchangeStatus ?? statusAksi(state, action.id);
    const cost = biayaAksi(action.id);
    const item = document.createElement('li');
    item.className = 'simple-card simple-card--action game-playing-card';
    item.dataset.action = action.id;
    item.classList.toggle('is-unavailable', !availability.available);
    if (availability.reason) item.title = availability.reason;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'simple-card-face';
    button.disabled = !availability.available;
    button.setAttribute('aria-label', availability.available
      ? hudCopy.copy.cardAriaAction
        .replace('{name}', action.nama)
        .replace('{cost}', String(cost ?? hudCopy.copy.unavailableCost))
      : hudCopy.copy.cardAriaUnavailable
        .replace('{name}', action.nama)
        .replace('{reason}', availability.reason ?? hudCopy.copy.cardUnavailable));

    const top = document.createElement('span');
    top.className = 'simple-card-top';
    const costBadge = document.createElement('span');
    costBadge.className = 'simple-card-cost';
    const coin = document.createElement('span');
    coin.className = 'simple-card-coin';
    coin.setAttribute('aria-hidden', 'true');
    costBadge.append(coin, document.createTextNode(String(cost ?? '?')));
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'simple-card-category';
    const actionIcon = actionIconFor(action.id);
    if (actionIcon) {
      const icon = document.createElement('img');
      icon.src = actionIcon;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      categoryBadge.append(icon);
    }
    top.append(costBadge, categoryBadge);

    const art = document.createElement('span');
    art.className = 'simple-card-art';
    const model = document.createElement('img');
    model.className = 'simple-card-model';
    model.src = modelImageForAction(action.id);
    model.alt = '';
    model.loading = 'lazy';
    model.decoding = 'async';
    model.setAttribute('aria-hidden', 'true');
    art.append(model);

    const name = document.createElement('span');
    name.className = 'simple-card-name';
    const nameText = document.createElement('span');
    nameText.className = 'simple-card-name-text';
    nameText.textContent = action.nama;
    name.append(nameText);

    button.append(top, art, name);
    item.append(button);
    list.append(item);

    const preview = (): void => {
      if (!availability.available) return;
      selectCandidate({ type: 'action', aksiId: action.id, ...(previewCard === undefined ? {} : { kartuIdx: previewCard }) }, button);
    };
    button.addEventListener('mouseenter', preview);
    button.addEventListener('focus', preview);
    button.addEventListener('click', () => {
      if (!availability.available) return;
      if (action.id === 'ACT04') {
        onExchange();
        return;
      }
      audio.playClick();
      if (options.dispatch({ type: 'MAIN_AKSI', aksiId: action.id })) {
        audio.playConfirm();
        onPlayed();
        options.onStateChange();
      }
    });
    item.addEventListener('mouseleave', () => {
      if (!item.contains(document.activeElement)) dismissPreview();
    });
  }
}

function makeCopyBlock(label: string, copy: string): HTMLElement {
  const block = document.createElement('p');
  block.className = 'hud-card-context';
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  block.append(strong, document.createTextNode(copy));
  return block;
}
function positionPreview(container: HTMLElement, anchor: HTMLElement): void {
  if (container.hidden) return;
  const anchorRect = anchor.getBoundingClientRect();
  const bubbleRect = container.getBoundingClientRect();
  const gap = 24;
  const left = Math.max(8, Math.min(anchorRect.left + anchorRect.width / 2 - bubbleRect.width / 2, window.innerWidth - bubbleRect.width - 8));
  const above = anchorRect.top >= bubbleRect.height + gap;
  const top = above ? anchorRect.top - gap - bubbleRect.height : anchorRect.bottom + gap;
  const arrow = Math.max(16, Math.min(anchorRect.left + anchorRect.width / 2 - left, bubbleRect.width - 16));
  container.style.setProperty('--preview-left', `${left}px`);
  container.style.setProperty('--preview-top', `${top}px`);
  container.style.setProperty('--preview-arrow', `${arrow}px`);
  container.dataset.placement = above ? 'above' : 'below';
}


function renderPreview(container: HTMLElement, candidate: PreviewCandidate, state: GameState, anchor: HTMLElement): void {
  let result: PreviewResult;
  try {
    result = hitungPreview(state, candidate);
  } catch {
    result = { status: 'invalid', reason: 'Pratinjau tidak dapat dihitung sekarang.', biaya: null, dapatDimainkan: false, tanpaPerubahan: false, horizons: [], jadwal: [], catatan: [] };
  }
  container.hidden = false;
  window.requestAnimationFrame(() => container.classList.add('is-open'));
  const reference = candidate.type === 'policy' ? cards.kebijakan[candidate.kartuIdx] : actions.aksi.find((action) => action.id === candidate.aksiId);
  if (result.status === 'invalid') {
    const error = document.createElement('p');
    error.className = 'hud-preview-error preview-error';
    error.setAttribute('role', 'alert');
    error.textContent = result.reason ?? 'Pratinjau tidak dapat dihitung.';
    container.replaceChildren(error);
  } else {
    const name = document.createElement('p');
    name.className = 'preview-name';
    name.textContent = reference?.nama ?? 'Kartu atau aksi';
    const rows = document.createElement('dl');
    rows.className = 'preview-rows';
    let changed = false;
    for (const entry of result.jadwal) {
      const row = document.createElement('div');
      row.className = `preview-row ${entry.ronde === state.ronde ? 'is-base' : 'is-later'}`;
      if (!entry.lengkap) row.title = 'Sebagian efek bersyarat belum dapat dipastikan.';
      const term = document.createElement('dt');
      term.className = 'preview-key';
      term.textContent = `Ronde ${entry.ronde}`;
      const chips = document.createElement('dd');
      chips.className = 'preview-chips';
      for (const key of meterOrder) {
        const amount = entry.delta[key] ?? 0;
        if (!amount) continue;
        changed = true;
        const chip = document.createElement('span');
        chip.className = `preview-chip ${amount > 0 ? 'is-up' : 'is-down'}`;
        const arrow = document.createElement('span');
        arrow.className = 'preview-chip-arah';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = amount > 0 ? '▲' : '▼';
        chip.append(arrow, document.createTextNode(`${hudCopy.meter[key].pendek} ${amount > 0 ? '+' : '−'}${Math.abs(amount)}`));
        chips.append(chip);
      }
      row.append(term, chips);
      rows.append(row);
    }
    if (changed) container.replaceChildren(name, rows);
    else container.replaceChildren(name);
  }
  previewAnchors.set(container, anchor);
  positionPreview(container, anchor);
}

