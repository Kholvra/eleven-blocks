import { describe, expect, it } from 'vitest';
import { parseTeacherInput } from '../src/ui/teacherInput';

describe('parseTeacherInput', () => {
  it('trims spaces, newlines, and matching outer quotes around a fragment', () => {
    expect(parseTeacherInput('  \n"#tiket=abc.def"\n  ')).toEqual({ kind: 'ticket', fragment: 'abc.def' });
  });

  it('accepts one fragment in an absolute URL', () => {
    expect(parseTeacherInput('https://example.test/game#tiket=abc.def')).toEqual({ kind: 'ticket', fragment: 'abc.def' });
  });

  it('returns generated summary text verbatim', () => {
    const summary = 'Tiket Keluar\nNama: Rina\n1. Jawaban\n';
    expect(parseTeacherInput(summary)).toEqual({ kind: 'text', text: summary });
  });

  it('rejects duplicate ticket references and multiple URLs as ambiguous', () => {
    expect(parseTeacherInput('#tiket=abc #tiket=def')).toEqual({ kind: 'invalid', reason: 'ambiguous' });
    expect(parseTeacherInput('https://one.test/#tiket=abc https://two.test/')).toEqual({ kind: 'invalid', reason: 'ambiguous' });
  });

  it('rejects route text longer than 1500 characters without truncating', () => {
    const route = `#tiket=${'a'.repeat(1494)}`;
    expect(route).toHaveLength(1501);
    expect(parseTeacherInput(route)).toEqual({ kind: 'invalid', reason: 'too-long' });
    const boundary = `#tiket=${'a'.repeat(1493)}`;
    expect(boundary).toHaveLength(1500);
    expect(parseTeacherInput(boundary)).toEqual({ kind: 'ticket', fragment: 'a'.repeat(1493) });
  });

  it('distinguishes empty from unrecognized input', () => {
    expect(parseTeacherInput(' \n\t ')).toEqual({ kind: 'invalid', reason: 'empty' });
    expect(parseTeacherInput('ordinary pasted text')).toEqual({ kind: 'invalid', reason: 'unrecognized' });
  });
});
