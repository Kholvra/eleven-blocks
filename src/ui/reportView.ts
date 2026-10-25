import hudCopy from '../data/hud.json';
import { composeLaporanKota, type LaporanKota, type SkorAkhir } from '../game/report';
import type { GameState } from '../game/types';

type ReportSections = LaporanKota['sections'];
type SummarySection = ReportSections[0];
type DecisionsSection = ReportSections[1];
type AffectedSection = ReportSections[2];
type ReflectionSection = ReportSections[3];
interface ReportViewOptions {
  getState(): GameState;
  hitungSkorAkhir(state: GameState): SkorAkhir;
  ticketStart: HTMLButtonElement;
}

const meterLabels = hudCopy.meter as Record<string, { label: string }>;

function meterLabel(key: string): string {
  return meterLabels[key]?.label ?? key;
}

function createSection(title: string, className: string): HTMLElement {
  const element = document.createElement('section');
  element.className = `report-section ${className}`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  element.append(heading);
  return element;
}

function createScoreSummary(score: SkorAkhir, ticketStart: HTMLButtonElement): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'report-score';
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
    panel.append(rating, supporting, ticketStart);
    return panel;
  }

  const unavailable = document.createElement('p');
  unavailable.className = 'results-unavailable';
  unavailable.textContent = score.status === 'mi-tidak-tersedia'
    ? 'Skor bintang belum tersedia untuk sesi ini.'
    : score.alasan;
  panel.append(unavailable, ticketStart);
  return panel;
}

function createMeterTable(summary: SummarySection): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'report-meter-table';
  const caption = document.createElement('caption');
  caption.textContent = 'Perbandingan meter.';
  table.append(caption);

  const tableHead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Meter', 'Awal sesi', 'Sekarang / akhir']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  }
  tableHead.append(headerRow);

  const tableBody = document.createElement('tbody');
  for (const key of Object.keys(summary.meterAwal)) {
    const meterKey = key as keyof typeof summary.meterAwal;
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = meterLabel(key);
    const initial = document.createElement('td');
    initial.textContent = String(summary.meterAwal[meterKey]);
    const final = document.createElement('td');
    final.textContent = String(summary.meterAkhir[meterKey]);
    row.append(label, initial, final);
    tableBody.append(row);
  }
  table.append(tableHead, tableBody);
  return table;
}

function createSummarySection(summary: SummarySection): HTMLElement {
  const section = createSection('Ringkasan Kota', 'report-summary');
  section.append(createMeterTable(summary));

  const projection = summary.cakrawala.find((horizon) => horizon.id === '+5');
  if (projection) {
    const note = document.createElement('p');
    note.className = 'report-projection-note';
    note.textContent = projection.meter === null || !projection.disimulasikan
      ? 'Lima ronde ke depan belum dihitung.'
      : `Proyeksi +5 ronde: ${Object.entries(projection.meter).map(([key, value]) =>
        `${meterLabel(key)}: ${value}`).join(', ')}.`;
    section.append(note);
  }
  return section;
}

function createDecisionCard(decision: DecisionsSection['item'][number]): HTMLElement {
  const card = document.createElement('article');
  card.className = 'report-decision';
  const heading = document.createElement('h4');
  heading.textContent = decision.nama;
  const details = document.createElement('p');
  details.textContent = `Ronde ${decision.ronde} · Biaya ${decision.biaya} poin`;
  const effect = document.createElement('p');
  const delta = Object.entries(decision.delta).map(([key, amount]) =>
    `${meterLabel(key)}: ${amount > 0 ? '+' : ''}${amount}`);
  effect.textContent = delta.length ? `Efek tercatat: ${delta.join(', ')}.` : 'Efek meter tercatat: tidak ada perubahan.';
  if (decision.kondisi) {
    const tradeoff = document.createElement('p');
    tradeoff.textContent = `Kondisi: ${decision.kondisi}`;
    card.append(heading, details, effect, tradeoff);
  } else {
    card.append(heading, details, effect);
  }
  return card;
}

function createDecisionSection(decisions: DecisionsSection): HTMLElement {
  const section = createSection('3 Keputusan Paling Berdampak', 'report-decisions');
  if (!decisions.tersedia) {
    const empty = document.createElement('p');
    empty.textContent = 'Riwayat keputusan belum tersedia.';
    section.append(empty);
  } else if (decisions.item.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Belum ada keputusan untuk ditampilkan.';
    section.append(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'report-decision-list';
    for (const decision of decisions.item.slice(0, 3)) list.append(createDecisionCard(decision));
    section.append(list);
  }

  const actionsHeading = document.createElement('h4');
  actionsHeading.textContent = 'Aksi terpilih';
  const actions = document.createElement('ul');
  if (decisions.aksiTerpilih.length) {
    for (const action of decisions.aksiTerpilih) {
      const item = document.createElement('li');
      item.textContent = `${action.nama} · Biaya ${action.biaya} poin`;
      actions.append(item);
    }
  } else {
    const item = document.createElement('li');
    item.textContent = 'Belum ada aksi yang dipilih.';
    actions.append(item);
  }
  section.append(actionsHeading, actions);
  return section;
}

function createAffectedSection(affected: AffectedSection): HTMLElement {
  const section = createSection('Dampak Keputusan dalam Permainan', 'report-affected');

  if (!affected.tersedia) {
    const empty = document.createElement('p');
    empty.textContent = 'Belum ada dampak yang tercatat.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('ul');
  for (const condition of affected.kondisi) {
    const item = document.createElement('li');
    item.textContent = condition;
    list.append(item);
  }
  section.append(list);
  return section;
}

function createReflectionSection(reflection: ReflectionSection): HTMLElement {
  const section = createSection('Ajakan Refleksi', 'report-reflection');
  const prompt = document.createElement('p');
  prompt.textContent = reflection.prompt;
  section.append(prompt);
  return section;
}

export function createReportView(options: ReportViewOptions): (results: HTMLElement) => void {
  return function renderReport(results: HTMLElement): void {
    const resultHeading = results.querySelector('#results-heading');
    if (!resultHeading) return;
    results.replaceChildren(resultHeading);

    const state = options.getState();
    const score = options.hitungSkorAkhir(state);
    const report = composeLaporanKota(state);
    const [summary, decisions, affected, reflection] = report.sections;
    results.append(
      createScoreSummary(score, options.ticketStart),
      createSummarySection(summary),
      createDecisionSection(decisions),
      createAffectedSection(affected),
      createReflectionSection(reflection),
    );
  };
}
