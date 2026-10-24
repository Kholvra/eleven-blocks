import tiketCopy from '../data/tiket.json';
import type { GameAction } from '../game/engine';
import type { GameState } from '../game/types';
import { hashSeed } from '../game/rng';
import { getContentHash } from '../data/contentVersion';
import { createQrDataUrl } from '../share/qr';
import { buildTiketText } from '../share/teks';
import { buildTiketUrl, decodeTiket, sanitizeNickname, type TiketPayload } from '../share/tiket';
import { createAnswerList, createMeterList } from './ticketDisplay';
import { parseTeacherInput } from './teacherInput';

export interface TeacherReceiver {
  element: HTMLElement;
  renderDirect(fragment: string): void;
  renderEmpty(): void;
}

const MAX_ROUTE_LENGTH = 1500;
export interface TicketScreenOptions {
  getState(): GameState;
  dispatch(action: GameAction): boolean;
  onTicketSaved(): void;
}

export interface TicketScreen {
  intro: HTMLElement;
  form: HTMLFormElement;
  status: HTMLElement;
  result: HTMLElement;
  inbound: HTMLElement;
  renderSaved(): void;
  createTeacherReceiver(): TeacherReceiver;
}

interface TicketElements {
  form: HTMLFormElement;
  status: HTMLElement;
  error: HTMLElement;
  result: HTMLElement;
  inbound: HTMLElement;
  nameInput: HTMLInputElement;
  submit: HTMLButtonElement;
}

interface TicketContext {
  elements: TicketElements;
  options: TicketScreenOptions;
}

type TicketAnswers = [string, string, string];

export function createTicketScreen(options: TicketScreenOptions): TicketScreen {
  const intro = document.createElement('p');
  intro.className = 'ticket-intro';
  intro.textContent = 'Tautan memuat jawaban, seed dan meter sesi, serta nama panggilan jika kamu mengisinya.';
  const elements = createTicketElements();
  const context = { elements, options };
  buildTicketForm(elements);
  elements.form.addEventListener('submit', (event) => { void handleSubmit(context, event); });
  return {
    intro,
    form: elements.form,
    status: elements.status,
    result: elements.result,
    inbound: elements.inbound,
    renderSaved: () => renderSaved(context),
    createTeacherReceiver: () => createTeacherReceiver(context),
  };
}

function createTicketElements(): TicketElements {
  const form = document.createElement('form');
  form.className = 'ticket-form ui-panel';
  form.noValidate = true;
  const status = document.createElement('p');
  status.className = 'ticket-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const error = document.createElement('p');
  error.className = 'ticket-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const result = document.createElement('section');
  result.className = 'ticket-result ui-panel';
  result.setAttribute('aria-label', 'Tiket yang dibuat');
  result.hidden = true;
  const inbound = document.createElement('section');
  inbound.className = 'ticket-inbound ui-panel';
  inbound.setAttribute('aria-live', 'polite');
  inbound.hidden = true;
  const nameInput = document.createElement('input');
  nameInput.name = 'nama';
  nameInput.type = 'text';
  nameInput.autocomplete = 'off';
  nameInput.addEventListener('input', () => limitNickname(nameInput));
  const submit = document.createElement('button');
  submit.className = 'menu-action';
  submit.type = 'submit';
  submit.textContent = 'Buat tiket dan tautan';
  return { form, status, error, result, inbound, nameInput, submit };
}

function buildTicketForm(elements: TicketElements): void {
  for (const question of tiketCopy.pertanyaan) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'ticket-question';
    const legend = document.createElement('legend');
    legend.textContent = question.teks;
    fieldset.append(legend);
    for (const [choiceIndex, choice] of question.pilihan.entries()) {
      const label = document.createElement('label');
      label.className = 'ticket-choice';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = question.id;
      radio.value = choice;
      radio.required = true;
      radio.id = `ticket-${question.id}-${choiceIndex}`;
      const text = document.createElement('span');
      text.textContent = choice;
      label.append(radio, text);
      fieldset.append(label);
    }
    elements.form.append(fieldset);
  }
  const nameLabel = document.createElement('label');
  nameLabel.className = 'ticket-name';
  nameLabel.textContent = 'Nama panggilan (opsional, maks. 24 karakter)';
  nameLabel.append(elements.nameInput);
  elements.form.append(nameLabel, elements.error, elements.submit);
}

function limitNickname(input: HTMLInputElement): void {
  const characters = Array.from(input.value);
  if (characters.length <= 24) return;
  const selectionStart = input.selectionStart;
  input.value = characters.slice(0, 24).join('');
  if (selectionStart !== null) input.setSelectionRange(Math.min(selectionStart, input.value.length), Math.min(selectionStart, input.value.length));
}

async function handleSubmit(context: TicketContext, event: Event): Promise<void> {
  event.preventDefault();
  const { elements, options } = context;
  elements.result.replaceChildren();
  elements.result.hidden = true;
  elements.error.hidden = true;
  elements.status.textContent = '';
  elements.form.hidden = false;
  elements.inbound.hidden = true;
  const answers = readAnswers(elements);
  if (!answers) return;
  elements.submit.disabled = true;
  elements.status.textContent = 'Menyiapkan tautan tiket…';
  try {
    const payload = buildPayload(options.getState(), answers, elements.nameInput.value);
    let url: string;
    let finalPayload: TiketPayload;
    try {
      ({ url, payload: finalPayload } = await buildTiketUrl(payload, `${location.origin}${location.pathname}`));
    } catch {
      await showTextOnlyTicket(context, payload);
      return;
    }
    if (!options.dispatch({ type: 'SIMPAN_TIKET', teks: finalPayload.t, url, ...(finalPayload.n ? { nama: finalPayload.n } : {}) })) {
      throw new Error('Tiket tidak dapat disimpan pada fase ini.');
    }
    await showCreatedTicket(context, finalPayload, url);
    options.onTicketSaved();
  } catch (caught) {
    elements.status.textContent = '';
    elements.error.textContent = caught instanceof Error ? caught.message : 'Tautan tiket belum dapat dibuat. Coba lagi.';
    elements.error.hidden = false;
  } finally {
    elements.submit.disabled = false;
  }
}

function readAnswers(elements: TicketElements): TicketAnswers | null {
  const answers = tiketCopy.pertanyaan.map((question) =>
    elements.form.querySelector<HTMLInputElement>(`input[name="${question.id}"]:checked`)?.value);
  const missingIndex = answers.findIndex((answer) => answer === undefined);
  if (missingIndex !== -1) {
    elements.error.textContent = `Pilih satu jawaban untuk pertanyaan ${missingIndex + 1}.`;
    elements.error.hidden = false;
    elements.form.querySelector<HTMLInputElement>(`input[name="${tiketCopy.pertanyaan[missingIndex].id}"]`)?.focus();
    return null;
  }
  return answers as TicketAnswers;
}

function buildPayload(state: GameState, answers: TicketAnswers, name: string): TiketPayload {
  const cardIndexes = [...new Set(state.catatan.map((entry) => entry.kartuIdx).filter((value): value is number => value !== null))];
  const eventIds = [...new Set(state.catatan.map((entry) => entry.eventId).filter((value): value is string => Boolean(value)))];
  const payload: TiketPayload = {
    k: getContentHash(),
    s: ticketSeed(state.seed),
    c: cardIndexes,
    m: [state.meter.udara, state.meter.akses, state.meter.hijau, state.meter.warga],
    t: answers,
  };
  if (eventIds.length) payload.e = eventIds;
  const nickname = sanitizeNickname(name);
  if (nickname) payload.n = nickname;
  return payload;
}

function ticketSeed(seed: string): string {
  if (/^[0-9a-z]{6}$/.test(seed)) return seed;
  return (hashSeed(seed) % 36 ** 6).toString(36).padStart(6, '0');
}

async function showTextOnlyTicket(context: TicketContext, payload: TiketPayload): Promise<void> {
  const { elements } = context;
  elements.status.textContent = 'Tautan tidak dapat dibuat. Kamu hanya dapat membagikan ringkasan teks.';
  elements.result.replaceChildren();
  const title = document.createElement('h2');
  title.textContent = 'Ringkasan tiket';
  const summary = buildTiketText(payload);
  const summaryField = document.createElement('textarea');
  summaryField.className = 'ticket-summary';
  summaryField.readOnly = true;
  summaryField.rows = 8;
  summaryField.value = summary;
  const controls = document.createElement('div');
  controls.className = 'ticket-controls';
  controls.append(makeCopyButton(context, 'Salin ringkasan teks', summary));
  elements.result.append(title, summaryField, controls);
  elements.result.hidden = false;
}

async function showCreatedTicket(context: TicketContext, payload: TiketPayload, url: string): Promise<void> {
  const { elements } = context;
  elements.status.textContent = 'Tautan tiket siap dibagikan.';
  elements.result.replaceChildren();
  const title = document.createElement('h2');
  title.textContent = 'Tiket siap dibagikan';
  const summary = document.createElement('p');
  summary.className = 'ticket-summary';
  summary.textContent = buildTiketText(payload, url);
  const urlLabel = document.createElement('label');
  urlLabel.className = 'ticket-url-label';
  urlLabel.textContent = 'Tautan tiket';
  const urlInput = document.createElement('textarea');
  urlInput.readOnly = true;
  urlInput.rows = 3;
  urlInput.value = url;
  urlLabel.append(urlInput);
  const controls = document.createElement('div');
  controls.className = 'ticket-controls';
  controls.append(makeCopyButton(context, 'Salin tautan', url));
  controls.append(makeCopyButton(context, 'Salin ringkasan teks', summary.textContent ?? ''));
  const qr = document.createElement('div');
  qr.className = 'ticket-qr';
  qr.setAttribute('aria-live', 'polite');
  qr.textContent = 'Menyiapkan QR lokal…';
  elements.result.append(title, summary, urlLabel, controls, qr);
  elements.result.hidden = false;
  try {
    const imageUrl = await createQrDataUrl(url);
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = 'Kode QR untuk membuka tautan tiket';
    qr.replaceChildren(image);
  } catch {
    qr.textContent = 'Kode QR tidak dapat dibuat di perangkat ini. Tautan dan ringkasan teks tetap dapat disalin.';
  }
}

function makeCopyButton(context: TicketContext, label: string, value: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'menu-action ticket-copy';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => copyText(context, label, value));
  return button;
}

async function copyText(context: TicketContext, label: string, value: string): Promise<void> {
  const { elements } = context;
  try {
    await navigator.clipboard.writeText(value);
    elements.status.textContent = `${label} berhasil disalin.`;
  } catch {
    const fallback = document.createElement('textarea');
    fallback.className = 'ticket-copy-fallback';
    fallback.value = value;
    fallback.setAttribute('readonly', '');
    document.body.append(fallback);
    fallback.select();
    fallback.setSelectionRange(0, fallback.value.length);
    const copied = document.execCommand('copy');
    fallback.remove();
    elements.status.textContent = copied
      ? `${label} berhasil disalin.`
      : 'Penyalinan otomatis gagal. Teks dapat dipilih dan disalin secara manual.';
    if (!copied) showManualCopy(elements.status, label, value);
  }
}

function showManualCopy(status: HTMLElement, label: string, value: string): void {
  const manual = document.createElement('textarea');
  manual.className = 'ticket-copy-manual';
  manual.value = value;
  manual.setAttribute('aria-label', `${label} untuk disalin manual`);
  status.after(manual);
  manual.focus();
  manual.select();
}


function renderIncomingPayload(
  context: TicketContext,
  status: HTMLElement,
  payload: TiketPayload,
  output: HTMLElement = context.elements.inbound,
): void {
  status.textContent = '';
  const heading = document.createElement('h2');
  heading.textContent = 'Tiket yang dibagikan';
  const answers = createAnswerList(payload);
  const identity = document.createElement('div');
  const seed = document.createElement('p');
  seed.className = 'ticket-nickname';
  seed.textContent = `Seed sesi: ${payload.s}`;
  const contentVersion = document.createElement('p');
  contentVersion.className = 'ticket-nickname';
  contentVersion.textContent = `Versi konten: ${payload.k}`;
  identity.append(seed, contentVersion);
  const metersHeading = document.createElement('h3');
  metersHeading.textContent = 'Meter permainan akhir';
  const meterList = createMeterList(payload);
  output.append(heading, identity, answers, metersHeading, meterList);
  const meterNote = document.createElement('p');
  meterNote.className = 'ticket-intro';
  meterNote.textContent = 'Nilai memakai skala permainan, bukan ukuran kondisi kota nyata.';
  output.append(meterNote);
  if (payload.n) {
    const name = document.createElement('p');
    name.className = 'ticket-nickname';
    name.textContent = `Dibagikan oleh ${payload.n}`;
    output.insertBefore(name, answers);
  }
  if (payload.k !== getContentHash()) {
    const mismatch = document.createElement('p');
    mismatch.className = 'ticket-mismatch';
    mismatch.setAttribute('role', 'status');
    mismatch.textContent = 'Tiket ini dibuat dengan versi konten yang berbeda.';
    output.append(mismatch);
  }
  const summary = buildTiketText(payload);
  const summaryLabel = document.createElement('label');
  summaryLabel.className = 'ticket-url-label';
  summaryLabel.textContent = 'Ringkasan teks';
  const summaryField = document.createElement('textarea');
  summaryField.readOnly = true;
  summaryField.rows = 5;
  summaryField.value = summary;
  summaryLabel.append(summaryField);
  output.append(summaryLabel, makeCopyButton(context, 'Salin ringkasan teks', summary));
}

function createTeacherReceiver(context: TicketContext): TeacherReceiver {
  const section = document.createElement('section');
  section.className = 'teacher-receiver ui-panel';
  const instructions = document.createElement('p');
  instructions.className = 'ticket-intro';
  instructions.textContent = 'Tempel satu tautan tiket, fragmen #tiket=, atau ringkasan teks dari pengirim. Tampilan ini hanya untuk membaca.';
  const form = document.createElement('form');
  form.className = 'teacher-input-form';
  const label = document.createElement('label');
  label.htmlFor = 'teacher-ticket-input';
  label.textContent = 'Tautan tiket atau ringkasan teks';
  const input = document.createElement('textarea');
  input.id = label.htmlFor;
  input.rows = 4;
  input.name = 'ticketInput';
  input.autocomplete = 'off';
  input.setAttribute('aria-describedby', 'teacher-input-help teacher-input-error');
  const help = document.createElement('p');
  help.id = 'teacher-input-help';
  help.textContent = 'Ringkasan teks dapat ditempel langsung; tautan atau fragmen akan dibuka sebagai tiket.';
  const error = document.createElement('p');
  error.id = 'teacher-input-error';
  error.className = 'ticket-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const submit = document.createElement('button');
  submit.className = 'menu-action';
  submit.type = 'submit';
  submit.textContent = 'Tampilkan tiket';
  const output = document.createElement('section');
  output.className = 'ticket-inbound ui-panel';
  output.setAttribute('aria-live', 'polite');
  const directStatus = document.createElement('p');
  directStatus.setAttribute('role', 'status');
  directStatus.setAttribute('aria-live', 'polite');
  form.append(label, input, help, error, submit);
  section.append(instructions, form, output);
  let request = 0;

  const showError = (message: string): void => {
    output.replaceChildren();
    error.textContent = message;
    error.hidden = false;
  };
  const submitInput = async (): Promise<void> => {
    const currentRequest = ++request;
    output.replaceChildren();
    error.hidden = true;
    const parsed = parseTeacherInput(input.value);
    if (parsed.kind === 'invalid') {
      const messages = {
        empty: 'Tempel tautan tiket atau ringkasan teks terlebih dahulu.',
        'too-long': 'Tautan terlalu panjang untuk dibuka. Minta pengirim menyalin ringkasan teks.',
        ambiguous: 'Masukan berisi lebih dari satu tautan atau tiket. Tempel satu saja.',
        unrecognized: 'Format tidak dikenali. Gunakan tautan atau fragmen #tiket=, atau ringkasan teks dari pengirim.',
      } as const;
      showError(messages[parsed.reason]);
      return;
    }
    if (parsed.kind === 'text') {
      const text = document.createElement('pre');
      text.className = 'teacher-plain-summary';
      text.textContent = parsed.text;
      output.append(text);
      return;
    }
    const loading = document.createElement('p');
    loading.setAttribute('role', 'status');
    loading.textContent = 'Membuka tiket…';
    output.append(loading);
    try {
      const payload = await decodeTiket(parsed.fragment);
      if (currentRequest !== request) return;
      renderIncomingPayload(context, loading, payload, output);
    } catch {
      if (currentRequest !== request) return;
      showError('Tiket tidak dapat dibaca. Minta pengirim menyalin ringkasan teks lalu tempelkan di sini.');
    }
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitInput();
  });

  return {
    element: section,
    renderEmpty() {
      request += 1;
      input.value = '';
      output.replaceChildren();
      error.hidden = true;
      directStatus.remove();
    },
    renderDirect(fragment: string) {
      const currentRequest = ++request;
      output.replaceChildren();
      error.hidden = true;
      directStatus.textContent = 'Membuka tiket…';
      output.append(directStatus);
      const normalized = parseTeacherInput(`#tiket=${fragment}`);
      if (location.href.length > MAX_ROUTE_LENGTH || normalized.kind !== 'ticket') {
        showError('Tautan tiket tidak dapat dibuka atau terlalu panjang. Tempel ringkasan teks yang dibagikan pengirim di atas.');
        return;
      }
      void decodeTiket(normalized.fragment).then((payload) => {
        if (currentRequest !== request) return;
        renderIncomingPayload(context, directStatus, payload, output);
      }).catch(() => {
        if (currentRequest !== request) return;
        showError('Tiket tidak dapat dibaca. Tempel ringkasan teks yang dibagikan pengirim di atas.');
      });
    },
  };
}


function renderSaved(context: TicketContext): void {
  const { elements, options } = context;
  elements.inbound.hidden = true;
  elements.form.hidden = false;
  const saved = options.getState().tiket;
  if (!saved) return;
  elements.form.hidden = true;
  if (!elements.result.hidden) return;
  try {
    const fragment = new URL(saved.url).hash.slice('#tiket='.length);
    void decodeTiket(fragment).then((payload) => showCreatedTicket(context, payload, saved.url)).catch(() => {
      showSavedTicketError(elements.result);
    });
  } catch {
    showSavedTicketError(elements.result);
  }
}

function showSavedTicketError(result: HTMLElement): void {
  result.hidden = false;
  result.textContent = 'Tautan tiket tersimpan, tetapi isi tiket tidak dapat dibaca.';
}
