declare module 'node:fs' {
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:child_process' {
  export function spawnSync(command: string, args: string[], options: { encoding: 'utf8' }): {
    status: number | null;
    stdout: string;
    stderr: string;
  };
}

declare const process: {
  execPath: string;
};
