import actions from '../data/actions.json';
import cards from '../data/cards.json';
import events from '../data/events.json';
import hudCopy from '../data/hud.json';
import { BUILDABLE_CELLS, labelCell } from '../game/board';
import { biayaAksi, biayaKartu, firstOpenBuildableCell, statusAksi, statusKartu } from '../game/cards';
import { hitungPreview } from '../game/preview';
import type { PreviewCandidate, PreviewResult } from '../game/preview';
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
  const preview = document.createElement('section');
  preview.className = 'hud-preview';
  preview.hidden = true;
  preview.setAttribute('aria-live', 'polite');
  preview.setAttribute('aria-atomic', 'true');
  const previewHeading = document.createElement('h2');
  previewHeading.textContent = 'Pratinjau dampak';
  preview.append(previewHeading);
  const actionHeading = document.createElement('h2');
  actionHeading.textContent = hudCopy.copy.actions;
  const actionList = document.createElement('ul');
  actionList.className = 'hud-card-list';
  actionList.setAttribute('aria-label', hudCopy.copy.actions);
  const content = document.createElement('div');
  content.className = 'hud-content';
  content.append(news, cardHeading, cardList, preview, actionHeading, actionList);
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
      renderCards(cardList, state, options, (candidate) => renderPreview(preview, candidate, state));
      renderActions(actionList, state, options, (candidate) => renderPreview(preview, candidate, state));
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

function renderCards(
  list: HTMLUListElement,
  state: GameState,
  options: HudOptions,
  selectCandidate: (candidate: PreviewCandidate) => void,
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
    item.className = 'hud-card';
    const title = document.createElement('h3');
    title.textContent = card.nama;
    const description = document.createElement('p');
    description.textContent = card.deskripsi;
    const costLabel = document.createElement('p');
    costLabel.textContent = `${hudCopy.copy.cost}: ${biayaKartu(index) ?? hudCopy.copy.unavailableCost} poin`;
    const cellLabel = document.createElement('label');
    cellLabel.className = 'hud-preview-cell-label';
    const selectId = `preview-cell-${index}`;
    cellLabel.htmlFor = selectId;
    cellLabel.textContent = 'Sel untuk pratinjau';
    const cellSelect = document.createElement('select');
    cellSelect.id = selectId;
    cellSelect.className = 'hud-preview-cell';
    const openCells = BUILDABLE_CELLS.filter((cell) => state.papan.ubin[cell] === null || state.papan.ubin[cell] === undefined);
    for (const cell of openCells) {
      const option = document.createElement('option');
      option.value = String(cell);
      option.textContent = labelCell(cell);
      cellSelect.append(option);
    }
    const defaultCell = firstOpenBuildableCell(state);
    if (defaultCell !== null) cellSelect.value = String(defaultCell);
    cellSelect.disabled = openCells.length === 0;
    if (openCells.length === 0) {
      const noCell = document.createElement('p');
      noCell.className = 'hud-preview-reason';
      noCell.textContent = 'Tidak ada sel kosong yang dapat dibangun untuk pratinjau.';
      item.append(noCell);
    }
    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'hud-preview-button';
    previewButton.textContent = 'Pratinjau dampak';
    previewButton.disabled = defaultCell === null;
    previewButton.addEventListener('click', () => {
      const cell = Number(cellSelect.value);
      selectCandidate({ type: 'policy', kartuIdx: index, selIdx: cell });
    });
    cellSelect.addEventListener('change', () => {
      const cell = Number(cellSelect.value);
      selectCandidate({ type: 'policy', kartuIdx: index, selIdx: cell });
    });
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'hud-action-button';
    play.textContent = hudCopy.copy.playPolicy;
    play.disabled = !availability.available || defaultCell === null;
    item.append(title, description, costLabel, cellLabel, cellSelect, previewButton);
    if (card.kenapa_penting) item.append(makeCopyBlock('Kenapa penting', card.kenapa_penting));
    if (card.kondisi) item.append(makeCopyBlock('Kondisi dan konsekuensi', card.kondisi));
    appendEffectExplanations(item, card.efek);
    if (!availability.available) {
      item.classList.add('hud-card-unavailable');
      const reason = document.createElement('p');
      reason.textContent = availability.reason ?? hudCopy.copy.cardUnavailable;
      item.append(reason);
    }
    item.append(play);
    play.addEventListener('click', () => {
      const cell = Number(cellSelect.value);
      if (options.dispatch({ type: 'MAIN_KARTU', kartuIdx: index, selIdx: cell })) options.onStateChange();
    });
    list.append(item);
  }
}

function renderActions(
  list: HTMLUListElement,
  state: GameState,
  options: HudOptions,
  selectCandidate: (candidate: PreviewCandidate) => void,
): void {
  list.replaceChildren();
  for (const action of actions.aksi) {
    const item = document.createElement('li');
    item.className = 'hud-card';
    const title = document.createElement('h3');
    title.textContent = action.nama;
    const description = document.createElement('p');
    description.textContent = action.deskripsi;
    const costLabel = document.createElement('p');
    costLabel.textContent = `${hudCopy.copy.cost}: ${biayaAksi(action.id) ?? hudCopy.copy.unavailableCost} poin`;
    item.append(title, description, costLabel);
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
        if (options.dispatch({ type: 'MAIN_AKSI', aksiId: action.id, ...(cardIndex === undefined ? {} : { kartuIdx: cardIndex }) })) options.onStateChange();
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
    container.replaceChildren(heading!, error, exclusions);
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
  container.replaceChildren(container.firstElementChild!, details);
}

