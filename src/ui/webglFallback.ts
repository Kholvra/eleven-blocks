export function renderWebGLFallback(root: HTMLElement): void {
  const fallback = document.createElement('main');
  fallback.className = 'webgl-fallback';

  const title = document.createElement('h1');
  title.textContent = 'WebGL 2 tidak tersedia';

  const explanation = document.createElement('p');
  explanation.textContent =
    'Eleven Blocks membutuhkan dukungan WebGL 2 untuk menampilkan pengalaman 3D. Tidak ada adegan 3D yang dimulai pada perangkat ini.';

  const suggestion = document.createElement('p');
  suggestion.append('Coba perbarui peramban atau gunakan peramban yang mendukung WebGL 2. ');
  const link = document.createElement('a');
  link.href = 'https://get.webgl.org/webgl2/';
  link.textContent = 'Periksa dukungan WebGL 2';
  link.rel = 'noreferrer';
  suggestion.append(link);

  fallback.append(title, explanation, suggestion);
  root.replaceChildren(fallback);
}
