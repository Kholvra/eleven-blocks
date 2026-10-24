let nextDialogId = 0;

const fontScales = ['100', '115', '130'] as const;

type FontScale = (typeof fontScales)[number];

function currentFontScale(): FontScale {
  const value = document.documentElement.dataset.fontScale;
  return fontScales.find((scale) => scale === value) ?? '100';
}

export function mountAccessibilityControls(root: HTMLElement): void {
  const controls = document.createElement('div');
  controls.className = 'accessibility-controls';

  const opener = document.createElement('button');
  opener.type = 'button';
  opener.textContent = 'Pengaturan aksesibilitas';

  const dialogId = `accessibility-dialog-title-${nextDialogId++}`;
  const dialog = document.createElement('dialog');
  dialog.className = 'accessibility-dialog ui-panel';
  dialog.setAttribute('aria-labelledby', dialogId);

  const heading = document.createElement('h2');
  heading.id = dialogId;
  heading.textContent = 'Ukuran teks';

  const instruction = document.createElement('p');
  instruction.textContent = 'Pilih ukuran teks untuk sesi ini.';

  const form = document.createElement('form');
  form.method = 'dialog';
  const options = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Ukuran teks';
  options.append(legend);

  const radios: HTMLInputElement[] = [];
  for (const scale of fontScales) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'font-scale';
    radio.value = scale;
    radios.push(radio);
    radio.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      radio.checked = true;
      document.documentElement.dataset.fontScale = scale;
    });
    radio.addEventListener('change', () => {
      if (radio.checked) {
        document.documentElement.dataset.fontScale = scale;
      }
    });
    label.append(radio, ` ${scale}%`);
    options.append(label);
  }

  const close = document.createElement('button');
  close.type = 'submit';
  close.value = 'tutup';
  close.textContent = 'Selesai';

  form.append(options, close);
  dialog.append(heading, instruction, form);
  controls.append(opener, dialog);
  root.append(controls);

  opener.addEventListener('click', () => {
    const scale = currentFontScale();
    for (const radio of radios) {
      radio.checked = radio.value === scale;
    }
    dialog.showModal();
  });
  dialog.addEventListener('close', () => opener.focus());
}
