import actions from '../data/actions.json';
import cards from '../data/cards.json';
import events from '../data/events.json';
import hudCopy from '../data/hud.json';
import { BUILDABLE_CELLS, labelCell } from '../game/board';
import { biayaAksi, biayaKartu, firstOpenBuildableCell, statusAksi, statusKartu } from '../game/cards';
import type { GameAction } from '../game/engine';
import type { Efek, GameState, KunciMeter, TahapRonde } from '../game/types';

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
const gamePhases: readonly GameState['fase'][] = ['ronde', 'event', 'ringkasan'];

export function createHud(container: HTMLElement, options: HudOptions): HudRenderer {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.setAttribute('aria-label', hudCopy.copy.statusLabel);

  const status = document.createElement('dl');
  status.className = 'hud-status';
  const roundItem = makeStatusItem(hudCopy.copy.round);
  const budgetItem = makeStatusItem(hudCopy.copy.budget);
  const handItem = makeStatusItem(hudCopy.copy.hand);
  const deckItem = makeStatusItem(hudCopy.copy.deck);
  status.append(roundItem.root, budgetItem.root, handItem.root, deckItem.root);
  const header = document.createElement('header');
  header.className = 'hud-header';
  header.append(status);

  const meters = document.createElement('section');
  meters.className = 'hud-meters';
  meters.setAttribute('aria-label', hudCopy.copy.meterPanel);
  const meterNodes = {} as Record<KunciMeter, MeterNode>;
  for (const key of meterOrder) {
    const source = hudCopy.meter[key];
    const chip = document.createElement('article');
    chip.className = 'meter-chip';
    chip.dataset.meter = key === 'hijau' ? 'rth' : key === 'warga' ? 'kesejahteraan' : key;
    const label = document.createElement('h3');
    label.textContent = source.label;
    const symbol = document.createElement('span');
    symbol.className = 'meter-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = source.symbol;
    const value = document.createElement('output');
    value.className = 'meter-value';
    const progress = document.createElement('div');
    progress.className = 'meter-progress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    const bar = document.createElement('span');
    bar.setAttribute('aria-hidden', 'true');
    progress.append(bar);
    const delta = document.createElement('p');
    delta.className = 'meter-delta';
    const sourceDetails = document.createElement('details');
    sourceDetails.className = 'meter-source';
    const sourceToggle = document.createElement('summary');
    sourceToggle.textContent = hudCopy.copy.source;
    const sourcePanel = document.createElement('div');
    sourcePanel.className = 'meter-source-sheet';
    const fact = document.createElement('p');
    fact.textContent = `${source.fact}. ${source.context} (${source.publisher}, ${source.year}; ${source.akses}).`;
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = source.publisher;
    sourcePanel.append(fact, link);
    sourceDetails.append(sourceToggle, sourcePanel);
    chip.append(label, symbol, value, progress, delta, sourceDetails);
    meters.append(chip);
    meterNodes[key] = { root: chip, value, bar, delta };
  }

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

  const news = document.createElement('details');
  news.className = 'hud-news';
  news.open = true;
  const newsTitle = document.createElement('summary');
  newsTitle.className = 'hud-news-toggle';
  newsTitle.textContent = hudCopy.copy.news;
  const newsBody = document.createElement('div');
  news.append(newsTitle, newsBody);

  const boardHeading = document.createElement('h2');
  boardHeading.textContent = hudCopy.copy.board;
  const boardList = document.createElement('ol');
  boardList.className = 'hud-board-list';
  boardList.setAttribute('aria-label', hudCopy.copy.board);
  for (const cell of BUILDABLE_CELLS) {
    const item = document.createElement('li');
    item.dataset.cell = String(cell);
    boardList.append(item);
  }

  const cardHeading = document.createElement('h2');
  cardHeading.textContent = hudCopy.copy.policy;
  const cardList = document.createElement('ul');
  cardList.className = 'hud-card-list';
  const actionHeading = document.createElement('h2');
  actionHeading.textContent = hudCopy.copy.actions;
  const actionList = document.createElement('ul');
  actionList.className = 'hud-card-list';
  actionList.setAttribute('aria-label', hudCopy.copy.actions);
  const content = document.createElement('div');
  content.className = 'hud-content';
  content.append(news, cardHeading, cardList, actionHeading, actionList);
  const sidebar = document.createElement('aside');
  sidebar.className = 'hud-sidebar';
  sidebar.append(boardHeading, boardList);
  const main = document.createElement('div');
  main.className = 'hud-main';
  main.append(content, sidebar);

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
  controls.className = 'hud-actions';
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
  hud.append(header, meters, phases, main, disclaimer, live, controls);
  container.append(hud);

  let initialRender = true;
  let announcedNote = '';

  return {
    render() {
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

      roundItem.value.textContent = `${state.ronde}/10`;
      budgetItem.value.textContent = String(state.anggaran);
      handItem.value.textContent = String(state.tangan.length);
      deckItem.value.textContent = String(state.deck.length);
      const delta = latestDelta(state);
      for (const key of meterOrder) {
        const node = meterNodes[key];
        const value = state.meter[key];
        node.value.value = String(value);
        node.value.textContent = String(value);
        node.root.setAttribute('aria-label', hudCopy.copy.accessibleMeter.replace('{label}', hudCopy.meter[key].label).replace('{value}', String(value)));
        const progress = node.root.querySelector<HTMLElement>('.meter-progress');
        progress?.setAttribute('aria-valuenow', String(value));
        progress?.setAttribute('aria-label', hudCopy.meter[key].label);
        node.bar.style.width = `${value}%`;
        const change = delta?.[key];
        node.delta.textContent = change === undefined ? '' : `${change > 0 ? '+' : ''}${change}`;
        node.delta.setAttribute('aria-label', node.delta.textContent ? `${hudCopy.meter[key].label} ${node.delta.textContent}` : '');
      }

      const activePhase = state.fase === 'ringkasan' ? 'transisi' : state.tahapRonde;
      for (const [phase, item] of Object.entries(phaseNodes) as [TahapRonde, HTMLElement][]) {
        if (phase === activePhase) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      }
      renderNews(newsBody, state.ronde);
      renderBoard(boardList, state);
      renderCards(cardList, state, options);
      renderActions(actionList, state, options);
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
    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = hudCopy.copy.source;
    link.setAttribute('aria-label', `${hudCopy.copy.source}: ${source.teks}`);
    container.append(link);
  }
}

function renderBoard(list: HTMLOListElement, state: GameState): void {
  for (const item of list.children) {
    const element = item as HTMLLIElement;
    const cell = Number(element.dataset.cell);
    const code = labelCell(cell);
    const occupied = state.papan.ubin[cell];
    element.textContent = occupied === null || occupied === undefined
      ? hudCopy.copy.cellEmpty.replace('{code}', code)
      : hudCopy.copy.cellOccupied.replace('{code}', code).replace('{card}', cards.kebijakan[occupied]?.nama ?? '');
  }
}

function renderCards(list: HTMLUListElement, state: GameState, options: HudOptions): void {
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
    item.className = 'hud-card';
    const title = document.createElement('h3');
    title.textContent = card.nama;
    const description = document.createElement('p');
    description.textContent = card.deskripsi;
    const costLabel = document.createElement('p');
    costLabel.textContent = `${hudCopy.copy.cost}: ${biayaKartu(index) ?? hudCopy.copy.unavailableCost}`;
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'hud-action-button';
    play.textContent = hudCopy.copy.playPolicy;
    play.disabled = !availability.available;
    item.append(title, description, costLabel);
    if (!availability.available) {
      item.classList.add('hud-card-unavailable');
      const reason = document.createElement('p');
      reason.textContent = availability.reason ?? hudCopy.copy.cardUnavailable;
      item.append(reason);
    }
    item.append(play);
    play.addEventListener('click', () => {
      const cell = firstOpenBuildableCell(options.getState());
      if (cell !== null && options.dispatch({ type: 'MAIN_KARTU', kartuIdx: index, selIdx: cell })) options.onStateChange();
    });
    list.append(item);
  }
}

function renderActions(list: HTMLUListElement, state: GameState, options: HudOptions): void {
  list.replaceChildren();
  for (const action of actions.aksi) {
    const item = document.createElement('li');
    item.className = 'hud-card';
    const title = document.createElement('h3');
    title.textContent = action.nama;
    const description = document.createElement('p');
    description.textContent = action.deskripsi;
    const costLabel = document.createElement('p');
    costLabel.textContent = `${hudCopy.copy.cost}: ${biayaAksi(action.id) ?? hudCopy.copy.unavailableCost}`;
    item.append(title, description, costLabel);
    const cardOptions = action.id === 'ACT04' ? state.tangan : [undefined];
    let allUnavailable = true;
    for (const cardIndex of cardOptions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-action-button';
      button.textContent = cardIndex === undefined
        ? hudCopy.copy.useAction.replace('{name}', action.nama)
        : hudCopy.copy.exchangeCard.replace('{card}', cards.kebijakan[cardIndex]?.nama ?? '');
      const availability = statusAksi(state, action.id, cardIndex);
      button.disabled = !availability.available;
      if (availability.available) allUnavailable = false;
      item.append(button);
      button.addEventListener('click', () => {
        if (options.dispatch({ type: 'MAIN_AKSI', aksiId: action.id, ...(cardIndex === undefined ? {} : { kartuIdx: cardIndex }) })) {
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
