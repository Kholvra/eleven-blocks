import tiketCopy from '../data/tiket.json';
import type { TiketPayload } from '../share/tiket';

export function createAnswerList(payload: TiketPayload): HTMLElement {
  const answers = document.createElement('div');
  answers.className = 'ticket-answers';
  for (let index = 0; index < payload.t.length; index += 1) {
    const answer = document.createElement('section');
    answer.className = 'ticket-answer';
    const question = document.createElement('h3');
    question.textContent = tiketCopy.pertanyaan[index].teks;
    const text = document.createElement('p');
    text.textContent = payload.t[index];
    answer.append(question, text);
    answers.append(answer);
  }
  return answers;
}

export function createMeterList(payload: TiketPayload): HTMLElement {
  const meters = document.createElement('dl');
  meters.className = 'ticket-meters';
  for (const [label, value] of [
    ['Udara', payload.m[0]],
    ['Akses', payload.m[1]],
    ['Hijau', payload.m[2]],
    ['Warga', payload.m[3]],
  ] as const) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = `${value}/100`;
    meters.append(term, detail);
  }
  return meters;
}

export function renderIncomingError(inbound: HTMLElement, status: HTMLElement): void {
  status.textContent = '';
  const message = document.createElement('p');
  message.className = 'ticket-error';
  message.setAttribute('role', 'alert');
  message.textContent = 'Tiket tidak dikenali. Minta temanmu mengirim ulang tautan, atau minta ringkasan teksnya.';
  const recoveryLabel = document.createElement('label');
  recoveryLabel.className = 'ticket-url-label';
  recoveryLabel.textContent = 'Ringkasan teks yang dikirim terpisah';
  const recoveryField = document.createElement('textarea');
  recoveryField.rows = 5;
  recoveryField.placeholder = 'Tempel ringkasan teks dari pengirim di sini.';
  recoveryField.setAttribute('aria-label', 'Ringkasan teks yang dikirim terpisah');
  recoveryLabel.append(recoveryField);
  inbound.append(message, recoveryLabel);
}
