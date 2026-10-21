export type TeacherInput =
  | { kind: 'ticket'; fragment: string }
  | { kind: 'text'; text: string }
  | { kind: 'invalid'; reason: 'empty' | 'ambiguous' | 'unrecognized' | 'too-long' };

const MAX_ROUTE_LENGTH = 1500;
const TICKET_REFERENCE = /#tiket=([^\s#]+)/giu;
const URL_CANDIDATE = /https?:\/\/[^\s"'<>]+/giu;

function unwrapInput(value: string): string {
  let input = value.trim();
  while (input.length >= 2) {
    const first = input[0];
    const last = input[input.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      input = input.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return input;
}

export function parseTeacherInput(value: string): TeacherInput {
  const input = unwrapInput(value);
  if (!input) return { kind: 'invalid', reason: 'empty' };

  if (/^Tiket Keluar(?:\s|$)/u.test(input)) return { kind: 'text', text: value };

  const references = [...input.matchAll(TICKET_REFERENCE)];
  const urls = [...input.matchAll(URL_CANDIDATE)];
  if (references.length > 1 || urls.length > 1) return { kind: 'invalid', reason: 'ambiguous' };
  if (references.length !== 1) return { kind: 'invalid', reason: 'unrecognized' };

  const reference = references[0];
  const fragment = reference[1];
  if (!fragment) return { kind: 'invalid', reason: 'unrecognized' };

  const route = urls.length === 1 ? urls[0][0] : reference[0];
  if (route.length > MAX_ROUTE_LENGTH) return { kind: 'invalid', reason: 'too-long' };

  if (urls.length === 1) {
    const url = urls[0][0];
    if (!url.includes(reference[0])) return { kind: 'invalid', reason: 'unrecognized' };
  } else if (input !== reference[0]) {
    return { kind: 'invalid', reason: 'unrecognized' };
  }

  return { kind: 'ticket', fragment };
}
