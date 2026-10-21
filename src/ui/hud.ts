import airIcon from '../assets/icons/meter-udara.svg';
import accessIcon from '../assets/icons/meter-akses.svg';
import greenIcon from '../assets/icons/meter-hijau.svg';
import citizenIcon from '../assets/icons/meter-warga.svg';
import wasteIcon from '../assets/icons/cat-sampah.svg';
import energyIcon from '../assets/icons/cat-energi.svg';
import waterIcon from '../assets/icons/cat-air.svg';
import housingIcon from '../assets/icons/cat-permukiman.svg';
import { createAudioController } from '../audio/audio';

import balance from '../data/balance.json';
import actions from '../data/actions.json';
import { createContextualTip, createTutorialGuide } from './tutorial';
import cards from '../data/cards.json';
import events from '../data/events.json';
import hudCopy from '../data/hud.json';
import factsData from '../data/fakta.json';
import { BUILDABLE_CELLS, labelCell } from '../game/board';
import { biayaAksi, biayaKartu, firstOpenBuildableCell, statusAksi, statusKartu } from '../game/cards';
import { hitungPreview } from '../game/preview';
import type { PreviewCandidate, PreviewResult } from '../game/preview';
import type { GameAction } from '../game/engine';
import type { AudioController } from '../audio/audio';

import type { Efek, GameState, KunciMeter, TahapRonde } from '../game/types';


const categoryIconAssets = {
  transport: accessIcon,
  hijau: greenIcon,
  sampah: wasteIcon,
  energi: energyIcon,
  air: waterIcon,
  permukiman: housingIcon,
} as const;
type CategoryIconKey = keyof typeof categoryIconAssets;

const meterIcons: Record<KunciMeter, string> = {
  udara: airIcon,
  akses: accessIcon,
  hijau: greenIcon,
  warga: citizenIcon,
};

type FactRecord = {
  id: string; nilai: string; satuan: string; arti: string; konteks: string;
  penerbit: string; tahun: string; akses: string; url: string; link_pendek: string;
};

export interface HudRenderer {
  render(): void;
}

type HudOptions = {
  getState(): GameState;
  dispatch(action: GameAction): boolean;
  onStateChange(): void;
};

type MeterNode = { root: HTMLElement; value: HTMLOutputElement; bar: HTMLElement; delta: HTMLElement };

const meterOrder: readonly KunciMeter[] = ['udara', 'akses', 'hijau', 'warga'];
const meterThresholds = balance.skor.ambang_meter;
const gamePhases: readonly GameState['fase'][] = ['ronde', 'event', 'ringkasan'];
const accessDateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function createHud(container: HTMLElement, options: HudOptions): HudRenderer {
  const audio = createAudioController();
  let selectedCardIdx: number | null = null;
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.setAttribute('aria-label', hudCopy.copy.statusLabel);


  const status = document.createElement('dl');
  status.className = 'hud-status game-topbar';
  const budgetItem = makeStatusItem(hudCopy.copy.budget);
  const roundItem = makeStatusItem(hudCopy.copy.level);
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
  soundButton.className = 'game-control-button';
  soundButton.textContent = `🔊 ${hudCopy.copy.sound}`;
  soundButton.addEventListener('click', () => {
    const enabled = !options.getState().setelan.audio;
    audio.setEnabled(enabled);
    if (options.dispatch({ type: 'SETELAN_AUDIO', aktif: enabled })) options.onStateChange();
  });
  const accessibilityButton = document.createElement('button');
  accessibilityButton.type = 'button';
  accessibilityButton.className = 'game-control-button';
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
  helpButton.className = 'game-control-button';
  helpButton.textContent = `❓ ${hudCopy.copy.howToPlay}`;
  const helpDialog = document.createElement('dialog');
  helpDialog.className = 'game-help-dialog';
  helpDialog.append(createTutorialGuide(() => helpDialog.close()));
  helpButton.addEventListener('click', () => helpDialog.showModal());
  quickNav.append(soundButton, accessibilityButton, helpButton, helpDialog);
  status.append(moneyCard, levelCard);
  header.append(status, quickNav);

  const meterPanel = document.createElement('section');
  meterPanel.className = 'game-left-sidebar';
  const trends = document.createElement('section');
  trends.className = 'game-trends';
  trends.setAttribute('aria-label', hudCopy.copy.trends);
  const trendsHeading = document.createElement('h2');
  trendsHeading.textContent = 'Tren Perubahan';
  const trendList = document.createElement('ul');
  trendList.className = 'game-trend-list';
  const trendNodes = {} as Record<KunciMeter, HTMLElement>;
  for (const key of meterOrder) {
    const row = document.createElement('li');
    row.className = 'game-trend-row';
    const label = document.createElement('span');
    label.textContent = key === 'akses' ? 'Akses' : key === 'hijau' ? 'Hijau' : key === 'warga' ? 'Warga' : 'Udara';
    const badge = document.createElement('span');
    badge.className = 'game-trend-badge';
    badge.textContent = '0';
    row.append(label, badge);
    trendList.append(row);
    trendNodes[key] = badge;
  }
  trends.append(trendsHeading, trendList);
  const meters = document.createElement('section');
  meters.className = 'hud-meters game-resources';
  meters.setAttribute('aria-label', hudCopy.copy.resources);
  const resourceHeading = document.createElement('h2');
  resourceHeading.textContent = hudCopy.copy.resources;
  meters.append(resourceHeading);
  const meterNodes = {} as Record<KunciMeter, MeterNode>;
  for (const key of meterOrder) {
    const source = hudCopy.meter[key];
    const chip = document.createElement('article');
    chip.className = 'meter-chip game-resource-meter';
    chip.dataset.meter = key === 'hijau' ? 'rth' : key === 'warga' ? 'kesejahteraan' : key;
    const label = document.createElement('h3');
    label.textContent = key === 'akses' ? 'Akses' : key === 'hijau' ? 'Hijau' : key === 'warga' ? 'Warga' : 'Udara';
    const symbol = document.createElement('img');
    symbol.className = 'meter-symbol';
    symbol.src = meterIcons[key];
    symbol.alt = '';
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
    const threshold = document.createElement('span');
    threshold.className = 'game-meter-threshold';
    threshold.style.left = `${meterThresholds[key]}%`;
    threshold.title = hudCopy.copy.threshold;
    threshold.setAttribute('aria-hidden', 'true');
    progress.append(bar, threshold);
    const delta = document.createElement('p');
    delta.className = 'meter-delta';
    const sourceDetails = document.createElement('details');
    sourceDetails.className = 'meter-source';
    const sourceToggle = document.createElement('summary');
    sourceToggle.textContent = hudCopy.copy.source;
    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'meter-source-sheet';
    renderFactCitations(sourcePanel, source.factIds);
    sourceDetails.append(sourceToggle, sourcePanel);
    chip.append(label, symbol, value, progress, delta, sourceDetails);
    meters.append(chip);
    meterNodes[key] = { root: chip, value, bar, delta };
  }
  meters.append(createContextualTip('meters'));
  meterPanel.append(trends, meters);
  const phases = document.createElement('ol');
  phases.className = 'hud-phases';
  phases.setAttribute('aria-label', hudCopy.copy.phaseSequence);
  const phaseNodes = {} as Record<TahapRonde, HTMLElement>;
  for (const phase of hudCopy.phase) {
    const phaseId = phase.id as TahapRonde;
    const item = document.createElement('li');
    item.className = 'phase-step';
    item.dataset.phase = phaseId;
    item.textContent = phase.label;
    phases.append(item);
    phaseNodes[phaseId] = item;
  }

  const news = document.createElement('section');
  news.className = 'hud-news game-events';
  news.setAttribute('aria-label', hudCopy.copy.events);
  const newsTitle = document.createElement('h2');
  newsTitle.className = 'hud-news-toggle';
  newsTitle.textContent = hudCopy.copy.events;
  const newsBody = document.createElement('div');
  newsBody.className = 'game-event-body';
  const roundsRemaining = document.createElement('p');
  roundsRemaining.className = 'game-rounds-remaining';
  news.append(newsTitle, roundsRemaining, newsBody);

  const cardHeading = document.createElement('h2');
  cardHeading.textContent = hudCopy.copy.policy;
  const cardList = document.createElement('ul');
  cardList.className = 'hud-card-list game-policy-cards';
  const preview = document.createElement('section');
  preview.className = 'hud-preview game-preview-bubble';
  preview.hidden = true;
  preview.setAttribute('aria-live', 'polite');
  preview.setAttribute('aria-atomic', 'true');
  const previewHeading = document.createElement('h2');
  previewHeading.textContent = 'Pratinjau dampak';
  preview.append(previewHeading);
  const actionHeading = document.createElement('h2');
  actionHeading.textContent = hudCopy.copy.actionCards;
  const actionList = document.createElement('ul');
  actionList.className = 'hud-card-list game-action-cards';
  actionList.setAttribute('aria-label', hudCopy.copy.actionCards);
  const dock = document.createElement('section');
  dock.className = 'game-card-dock';
  const dockContent = document.createElement('div');
  dockContent.className = 'game-card-dock-content';
  dockContent.append(cardHeading, createContextualTip('cards'), cardList, actionHeading, actionList);
  const deckCounter = document.createElement('div');
  deckCounter.className = 'game-deck-counter';
  deckCounter.setAttribute('aria-label', hudCopy.copy.deckTitle);
  const deselectButton = document.createElement('button');
  deselectButton.type = 'button';
  deselectButton.className = 'game-card-deselect';
  deselectButton.textContent = hudCopy.copy.deselectCard;
  deselectButton.hidden = true;
  deselectButton.addEventListener('click', () => {
    audio.playClick();
    selectedCardIdx = null;
    preview.hidden = true;
    deselectButton.hidden = true;
    options.onStateChange();
  });
  dock.append(preview, deselectButton, dockContent, deckCounter);

  const rightSidebar = document.createElement('aside');
  rightSidebar.className = 'game-right-sidebar';
  rightSidebar.append(news);
  const layout = document.createElement('div');
  layout.className = 'game-hud-layout';
  layout.append(meterPanel, rightSidebar);

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

  const controls = document.createElement('footer');
  controls.className = 'hud-actions game-round-controls';
  const advance = document.createElement('button');
  advance.type = 'button';
  advance.className = 'hud-action-button';
  advance.addEventListener('click', () => {
    const state = options.getState();
    const action = state.fase === 'event'
      ? { type: 'TRANSISI_FASE', fase: 'ringkasan' } as const
      : state.fase === 'ringkasan'
        ? { type: 'TRANSISI_FASE', fase: 'laporan' } as const
        : state.tahapRonde === 'transisi'
          ? { type: 'SELESAI_RONDE' } as const
          : { type: 'PROSES_TAHAP_RONDE' } as const;
    if (options.dispatch(action)) options.onStateChange();
  });
  controls.append(advance);
  hud.append(header, layout, phases, dock, disclaimer, live, controls);
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
    selectedCardIdx = null;
    preview.hidden = true;
    options.onStateChange();
  });
  document.addEventListener('click', (event) => {
    if (selectedCardIdx === null || (event.target as HTMLElement).closest('.game-playing-card')) return;
    selectedCardIdx = null;
    preview.hidden = true;
    deselectButton.hidden = true;
    options.onStateChange();
  });

  let initialRender = true;
  let announcedNote = '';

  return {
    render() {
      preview.hidden = true;
      preview.replaceChildren(previewHeading);
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

      roundItem.value.textContent = `Ronde ${state.ronde} / 10`;
      budgetItem.value.textContent = `${state.anggaran} poin`;
      deckCounter.textContent = `🎴 ${state.deck.length}`;
      deckCounter.setAttribute('aria-label', `${hudCopy.copy.deckTitle}: ${state.deck.length}`);
      soundButton.textContent = `${state.setelan.audio ? '🔊' : '🔇'} ${hudCopy.copy.sound}`;
      soundButton.setAttribute('aria-pressed', String(state.setelan.audio));
      roundsRemaining.textContent = `${hudCopy.copy.remainingRounds}: ${10 - state.ronde}`;
      renderNews(newsBody, state.ronde);
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
        node.delta.textContent = change === 0 ? '0' : `${change > 0 ? '+' : ''}${change}`;
        node.delta.setAttribute('aria-label', `${hudCopy.meter[key].label} ${node.delta.textContent}`);
        trendNodes[key].textContent = change > 0 ? `> +${change}` : change < 0 ? `> ${change}` : '> 0';
        trendNodes[key].classList.toggle('is-positive', change > 0);
        trendNodes[key].classList.toggle('is-negative', change < 0);
      }

      const activePhase = state.fase === 'ringkasan' ? 'transisi' : state.tahapRonde;
      for (const [phase, item] of Object.entries(phaseNodes) as [TahapRonde, HTMLElement][]) {
        if (phase === activePhase) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      }
      renderCards(cardList, state, options, (candidate) => renderPreview(preview, candidate, state), selectedCardIdx, (index) => {
        selectedCardIdx = index;
        audio.playClick();
      }, audio, (index) => {
        selectedCardIdx = index;
        preview.hidden = true;
      }, () => {
        preview.hidden = true;
      });
      renderActions(actionList, state, options, (candidate) => renderPreview(preview, candidate, state), audio);
      deselectButton.hidden = selectedCardIdx === null;
      advance.textContent = state.fase === 'ringkasan'
        ? hudCopy.copy.viewReport
        : state.tahapRonde === 'transisi'
          ? state.ronde === 10 ? hudCopy.copy.finish : hudCopy.copy.finishRound
          : hudCopy.copy.advance;

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
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveFact(id: string): FactRecord | undefined {
  if (!isRecord(factsData) || !Array.isArray(factsData.fakta)) return undefined;
  const candidate: unknown = factsData.fakta.find((item: unknown) =>
    isRecord(item) && item.id === id,
  );
  if (!isRecord(candidate)) return undefined;
  const fields: (keyof FactRecord)[] = ['id', 'nilai', 'satuan', 'arti', 'konteks', 'penerbit', 'tahun', 'akses', 'url', 'link_pendek'];
  if (!fields.every((field) => typeof candidate[field] === 'string' && candidate[field])) return undefined;
  const fact = candidate as unknown as FactRecord;
  return fact.akses === '2026-10-17' ? fact : undefined;
}

function makeStatusItem(label: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement('div');
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

function renderNews(container: HTMLElement, round: number): void {
  container.replaceChildren();
  const event = events.event.find((item) => item.ronde === round);
  if (!event) {
    const message = document.createElement('p');
    message.textContent = hudCopy.copy.noNews;
    container.append(message);
    return;
  }
  const type = document.createElement('p');
  type.textContent = event.jenis === 'interaktif' ? hudCopy.copy.eventInteractive : hudCopy.copy.eventNarrative;
  const title = document.createElement('h2');
  title.textContent = event.judul;
  const narrative = document.createElement('p');
  narrative.textContent = event.narasi;
  container.append(type, title, narrative);
  for (const source of event.sumber) {
    if (hasFactIds(source)) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = hudCopy.copy.source;
      const panel = document.createElement('div');
      renderFactCitations(panel, source.factIds);
      details.append(summary, panel);
      container.append(details);
      continue;
    }
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = hudCopy.copy.source;
    link.setAttribute('aria-label', `${hudCopy.copy.source}: ${source.teks}`);
    container.append(link);
  }
}

function hasFactIds(source: unknown): source is { factIds: string[] } {
  return isRecord(source) && Array.isArray(source.factIds)
    && source.factIds.every((id): id is string => typeof id === 'string');
}

function renderFactCitations(panel: HTMLElement, factIds: readonly string[]): void {
  for (const id of factIds) {
    const fact = resolveFact(id);
    if (!fact) {
      const unavailable = document.createElement('p');
      unavailable.textContent = hudCopy.copy.unavailableSource;
      panel.append(unavailable);
      continue;
    }
    const citation = document.createElement('p');
    citation.className = 'meter-citation';
    citation.textContent = `${fact.nilai} ${fact.satuan}: ${fact.arti.replace(/[.!?]+$/, '')}. ${fact.konteks} (${fact.penerbit}, ${fact.tahun}; diakses ${accessDateFormatter.format(new Date(`${fact.akses}T00:00:00Z`))}). `;
    const link = document.createElement('a');
    link.href = fact.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Sumber: ${fact.link_pendek}`;
    link.setAttribute('aria-label', `Buka sumber ${fact.link_pendek} untuk ${fact.arti}`);
    citation.append(link);
    panel.append(citation);
  }
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
  selectCandidate: (candidate: PreviewCandidate) => void,
  selectedCardIdx: number | null,
  onSelect: (index: number) => void,
  audio: AudioController,
  onDeselect: (index: number) => void,
  dismissPreview: () => void,
): void {
  list.replaceChildren();
  if (state.tangan.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = hudCopy.copy.emptyHand;
    list.append(empty);
    return;
  }
  for (const index of state.tangan) {
    const card = cards.kebijakan[index];
    if (!card) continue;
    const availability = statusKartu(state, index);
    const item = document.createElement('li');
    item.className = 'hud-card hud-card--policy game-playing-card';
    item.dataset.card = String(index);
    const isSelected = selectedCardIdx === index;
    if (isSelected) item.classList.add('is-selected');

    const cardHeader = document.createElement('div');
    cardHeader.className = 'hud-card-header';
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'hud-card-category';
    const categoryName = String(card.kategori);
    const categoryKey = hudCopy.categories.icons[categoryName as keyof typeof hudCopy.categories.icons] as CategoryIconKey | undefined;
    const categoryIcon = categoryKey ? categoryIconAssets[categoryKey] : undefined;
    if (categoryIcon) {
      const icon = document.createElement('img');
      icon.src = categoryIcon;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      categoryBadge.append(icon);
    }
    const categoryLabel = hudCopy.categories.labels[categoryName as keyof typeof hudCopy.categories.labels] ?? categoryName;
    categoryBadge.append(document.createTextNode(categoryLabel));
    const cost = document.createElement('span');
    cost.className = 'hud-card-cost';
    cost.textContent = `${hudCopy.copy.coin} ${biayaKartu(index) ?? hudCopy.copy.unavailableCost}`;
    cost.setAttribute('aria-label', `${hudCopy.copy.cost}: ${biayaKartu(index) ?? hudCopy.copy.unavailableCost} poin`);
    cardHeader.append(cost, categoryBadge);

    const artwork = document.createElement('div');
    artwork.className = 'hud-card-artwork';
    if (categoryIcon) {
      const artworkIcon = document.createElement('img');
      artworkIcon.src = categoryIcon;
      artworkIcon.alt = '';
      artworkIcon.setAttribute('aria-hidden', 'true');
      artwork.append(artworkIcon);
    }
    const title = document.createElement('h3');
    title.className = 'game-card-title-ribbon';
    title.textContent = card.nama;
    const description = document.createElement('p');
    description.className = 'hud-card-description';
    description.textContent = card.deskripsi;
    const horizons = document.createElement('ol');
    horizons.className = 'hud-card-horizons';
    horizons.setAttribute('aria-label', 'Pratinjau dampak');
    for (const horizon of hudCopy.copy.previewHorizons) {
      const point = document.createElement('li');
      point.textContent = horizon;
      horizons.append(point);
    }
    const footer = document.createElement('div');
    footer.className = 'hud-card-footer';
    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'hud-action-button';
    selectButton.textContent = isSelected ? hudCopy.copy.placeCard : hudCopy.copy.selectCard;
    selectButton.disabled = !availability.available || firstOpenBuildableCell(state) === null;
    selectButton.setAttribute('aria-pressed', String(isSelected));
    selectButton.addEventListener('click', () => {
      if (!availability.available) return;
      const cell = firstOpenBuildableCell(options.getState());
      if (item.classList.contains('is-selected') && cell !== null) {
        audio.playClick();
        if (options.dispatch({ type: 'MAIN_KARTU', kartuIdx: index, selIdx: cell })) {
          audio.playConfirm();
          onDeselect(index);
          options.onStateChange();
        }
      } else {
        onSelect(index);
        if (cell !== null) selectCandidate({ type: 'policy', kartuIdx: index, selIdx: cell });
        for (const other of list.querySelectorAll<HTMLElement>('.hud-card')) {
          const active = other === item;
          other.classList.toggle('is-selected', active);
          const button = other.querySelector<HTMLButtonElement>('.hud-card-footer button');
          button?.setAttribute('aria-pressed', String(active));
          if (button) button.textContent = active ? hudCopy.copy.placeCard : hudCopy.copy.selectCard;
        }
      }
    });
    footer.append(selectButton);
    item.append(cardHeader, artwork, title, description, horizons, footer);
    if (!availability.available) {
      item.classList.add('hud-card-unavailable');
      const reason = document.createElement('p');
      reason.textContent = availability.reason ?? hudCopy.copy.cardUnavailable;
      item.append(reason);
    }
    list.append(item);
    if (isSelected) {
      const cell = firstOpenBuildableCell(state);
      if (cell !== null) selectCandidate({ type: 'policy', kartuIdx: index, selIdx: cell });
    }
    item.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button, select, summary, a')) return;
      if (availability.available) selectButton.click();
    });
    item.addEventListener('mouseenter', () => {
      if (availability.available) {
        const cell = firstOpenBuildableCell(options.getState());
        if (cell !== null) selectCandidate({ type: 'policy', kartuIdx: index, selIdx: cell });
      }
    });
    item.addEventListener('mouseleave', () => {
      if (selectedCardIdx !== index) dismissPreview();
    });
    selectButton.addEventListener('focus', () => {
      if (availability.available) {
        const cell = firstOpenBuildableCell(options.getState());
        if (cell !== null) selectCandidate({ type: 'policy', kartuIdx: index, selIdx: cell });
      }
    });
  }
}

function renderActions(
  list: HTMLUListElement,
  state: GameState,
  options: HudOptions,
  selectCandidate: (candidate: PreviewCandidate) => void,
  audio: AudioController,
): void {
  list.replaceChildren();
  for (const action of actions.aksi) {
    const item = document.createElement('li');
    item.className = 'hud-card hud-card--action game-playing-card';
    item.dataset.action = action.id;
    const badge = document.createElement('span');
    badge.className = 'hud-action-card-id';
    badge.textContent = action.id;
    const title = document.createElement('h3');
    title.textContent = action.nama;
    const description = document.createElement('p');
    description.textContent = action.deskripsi;
    const costLabel = document.createElement('p');
    costLabel.className = 'hud-card-cost';
    costLabel.textContent = `${hudCopy.copy.coin} ${biayaAksi(action.id) ?? hudCopy.copy.unavailableCost}`;
    item.append(badge, title, description, costLabel);
    if (action.kenapa_penting) item.append(makeCopyBlock('Kenapa penting', action.kenapa_penting));
    if (action.id === 'ACT04') item.append(makeCopyBlock('Perubahan meter', 'Aksi ini tidak mengubah meter.'));
    else appendEffectExplanations(item, action.efek);
    const cardOptions = action.id === 'ACT04' ? state.tangan : [undefined];
    let allUnavailable = true;
    for (const cardIndex of cardOptions) {
      const availability = statusAksi(state, action.id, cardIndex);
      const previewButton = document.createElement('button');
      previewButton.type = 'button';
      previewButton.className = 'hud-preview-button';
      previewButton.textContent = 'Pratinjau dampak';
      previewButton.addEventListener('click', () => {
        selectCandidate({ type: 'action', aksiId: action.id, ...(cardIndex === undefined ? {} : { kartuIdx: cardIndex }) });
      });
      item.append(previewButton);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-action-button';
      button.textContent = cardIndex === undefined
        ? hudCopy.copy.useAction.replace('{name}', action.nama)
        : hudCopy.copy.exchangeCard.replace('{card}', cards.kebijakan[cardIndex]?.nama ?? '');
      button.disabled = !availability.available;
      if (availability.available) allUnavailable = false;
      item.append(button);
      button.addEventListener('click', () => {
        audio.playClick();
        if (options.dispatch({ type: 'MAIN_AKSI', aksiId: action.id, ...(cardIndex === undefined ? {} : { kartuIdx: cardIndex }) })) {
          audio.playConfirm();
          options.onStateChange();
        }
      });
    }
    if (allUnavailable) {
      const reason = document.createElement('p');
      reason.textContent = hudCopy.copy.cardUnavailable;
      item.append(reason);
    }
    list.append(item);
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

function appendEffectExplanations(container: HTMLElement, effect: { langsung?: Efek; tertunda?: Array<{ setelahRonde: number; efek: Efek; catatan?: string; syarat?: string }> }): void {
  const direct = effect.langsung ?? {};
  const directValues = formatDelta(direct);
  if (directValues) container.append(makeCopyBlock('Efek langsung', directValues));
  for (const delayed of effect.tertunda ?? []) {
    const timing = `Efek tertunda setelah ${delayed.setelahRonde} ronde`;
    const details = [formatDelta(delayed.efek), delayed.catatan, delayed.syarat ? `Syarat: ${delayed.syarat}` : ''].filter(Boolean).join('. ');
    container.append(makeCopyBlock(timing, details));
  }
}

function renderPreview(container: HTMLElement, candidate: PreviewCandidate, state: GameState): void {
  let result: PreviewResult;
  try {
    result = hitungPreview(state, candidate);
  } catch {
    container.hidden = false;
    const heading = container.firstElementChild;
    const error = document.createElement('p');
    error.className = 'hud-preview-error';
    error.setAttribute('role', 'alert');
    error.textContent = 'Pratinjau tidak dapat dihitung sekarang. Kartu tetap dapat dimainkan jika tersedia.';
    const exclusions = document.createElement('p');
    exclusions.className = 'hud-preview-exclusions';
    exclusions.textContent = 'Event dan pilihan pemain di ronde mendatang tidak dihitung.';
    container.replaceChildren(heading!, createContextualTip('preview'), error, exclusions);
    return;
  }
  container.hidden = false;
  const details = document.createElement('div');
  details.className = 'hud-preview-content';
  const heading = document.createElement('h3');
  const description = document.createElement('p');
  const why = document.createElement('p');
  const cost = document.createElement('p');
  const reference = candidate.type === 'policy' ? cards.kebijakan[candidate.kartuIdx] : actions.aksi.find((action) => action.id === candidate.aksiId);
  heading.textContent = reference?.nama ?? 'Kartu atau aksi';
  description.textContent = reference?.deskripsi ?? '';
  why.textContent = reference?.kenapa_penting ? `Kenapa penting: ${reference.kenapa_penting}` : '';
  details.append(heading, description);
  if (why.textContent) details.append(why);
  if (reference && 'kondisi' in reference && reference.kondisi) details.append(makeCopyBlock('Kondisi', reference.kondisi));
  if (result.status === 'ready' && candidate.type === 'policy' && candidate.selIdx !== undefined) {
    details.append(makeCopyBlock('Penempatan', labelCell(candidate.selIdx)));
  }
  if (result.status === 'ready' && reference) appendEffectExplanations(details, reference.efek);
  const status = document.createElement('p');
  status.className = result.status === 'invalid' ? 'hud-preview-error' : 'hud-preview-status';
  if (result.status === 'invalid') status.setAttribute('role', 'alert');
  status.textContent = result.status === 'invalid'
    ? `Tidak dapat dihitung: ${result.reason ?? 'alasan tidak tersedia'}`
    : result.dapatDimainkan ? 'Biaya terjangkau, aksi dapat dimainkan.' : 'Belum dapat dimainkan saat ini.';
  cost.textContent = result.status === 'invalid'
    ? 'Biaya belum dapat dihitung.'
    : `Biaya: ${result.biaya === null ? 'tidak tersedia' : `${result.biaya} poin`}. Anggaran saat ini: ${state.anggaran} poin.`;
  details.append(cost, status);
  if (result.status === 'ready') {
    if (result.tanpaPerubahan) details.append(makeCopyBlock('Perubahan meter', 'Aksi ini tidak mengubah meter.'));
    else if (result.horizons.length !== 3) {
      details.append(makeCopyBlock('Pratinjau tidak lengkap', 'Tiga cakrawala tidak tersedia, sehingga angka tidak ditampilkan.'));
    } else {
      const horizons = document.createElement('ol');
      horizons.className = 'hud-preview-horizons';
      for (const horizon of result.horizons) {
        const row = document.createElement('li');
        const label = document.createElement('h4');
        label.textContent = horizon.label;
        const delta = document.createElement('p');
        delta.textContent = horizon.lengkap ? formatDelta(horizon.delta) || 'Tidak ada perubahan meter yang diperkirakan.' : 'Belum lengkap; lihat catatan kondisi di bawah.';
        row.append(label, delta);
        horizons.append(row);
      }
      details.append(horizons);
    }
  }
  if (result.catatan.length > 0) {
    const notes = document.createElement('ul');
    notes.className = 'hud-preview-notes';
    for (const note of result.catatan) {
      const row = document.createElement('li');
      row.textContent = note;
      notes.append(row);
    }
    details.append(notes);
  }
  container.replaceChildren(container.firstElementChild!, createContextualTip('preview'), details);
}

