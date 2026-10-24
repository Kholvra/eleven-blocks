import airIcon from '../assets/icons/meter-udara.svg';
import greenIcon from '../assets/icons/meter-hijau.svg';
import citizenIcon from '../assets/icons/meter-warga.svg';
import housingIcon from '../assets/icons/cat-permukiman.svg';
import copy from '../data/copy.json';

export const tutorialLabels = copy.labels;
export type TutorialTipContext = keyof typeof copy.tips;

const tutorialIcons = [airIcon, housingIcon, greenIcon] as const;
const tipIcons: Record<TutorialTipContext, string> = {
  menu: housingIcon,
  cards: housingIcon,
  budget: citizenIcon,
  meters: airIcon,
  preview: greenIcon,
};

function makeIcon(src: string, className: string): HTMLImageElement {
  const icon = document.createElement('img');
  icon.className = className;
  icon.src = src;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function createTutorialSteps(): HTMLOListElement {
  const steps = document.createElement('ol');
  steps.className = 'tutorial-steps';
  steps.setAttribute('aria-label', 'Tiga langkah cara bermain');

  for (const [index, step] of copy.tutorial.steps.entries()) {
    const item = document.createElement('li');
    item.className = 'tutorial-step';
    item.dataset.anchor = step.anchor;

    const content = document.createElement('div');
    const indicator = document.createElement('span');
    indicator.className = 'tutorial-step-indicator';
    indicator.textContent = `Langkah ${index + 1}/${copy.tutorial.steps.length}`;
    const title = document.createElement('h2');
    title.textContent = step.title;
    const description = document.createElement('p');
    description.textContent = step.text;
    content.append(makeIcon(tutorialIcons[index % tutorialIcons.length], 'tutorial-icon'), indicator, title, description);
    item.append(content);
    steps.append(item);
  }

  return steps;
}

export function createContextualTip(context: TutorialTipContext): HTMLDetailsElement {
  const tip = document.createElement('details');
  tip.className = 'tutorial-tip ui-panel';
  tip.name = 'tutorial-tips';
  const summary = document.createElement('summary');
  const summaryLabel = document.createElement('span');
  summaryLabel.textContent = copy.labels.howToPlay;
  summary.append(makeIcon(tipIcons[context], 'tutorial-icon tutorial-tip-icon'), summaryLabel);
  const text = document.createElement('p');
  text.textContent = copy.tips[context];
  tip.append(summary, text);
  return tip;
}

export function createTutorialGuide(onFinish: () => void): HTMLElement {
  const guide = document.createElement('section');
  guide.className = 'tutorial-guide ui-panel';
  guide.setAttribute('aria-live', 'polite');
  guide.setAttribute('aria-atomic', 'true');

  let index = 0;
  const progress = document.createElement('p');
  progress.className = 'tutorial-progress';
  const step = document.createElement('article');
  step.className = 'tutorial-current-step';
  const icon = makeIcon(tutorialIcons[0], 'tutorial-icon tutorial-current-icon');
  const indicator = document.createElement('span');
  indicator.className = 'tutorial-step-indicator';
  const title = document.createElement('h2');
  const text = document.createElement('p');
  step.append(icon, indicator, title, text);

  const actions = document.createElement('div');
  actions.className = 'tutorial-actions';
  const skip = document.createElement('button');
  skip.className = 'menu-action tutorial-skip';
  skip.type = 'button';
  skip.textContent = copy.labels.skip;
  skip.addEventListener('click', onFinish);

  const next = document.createElement('button');
  next.className = 'menu-action';
  next.type = 'button';
  next.addEventListener('click', () => {
    if (index === copy.tutorial.steps.length - 1) {
      onFinish();
      return;
    }
    index += 1;
    render();
  });
  actions.append(skip, next);
  guide.append(progress, step, actions);

  function render(): void {
    const current = copy.tutorial.steps[index];
    const stepLabel = `Langkah ${index + 1}/${copy.tutorial.steps.length}`;
    progress.textContent = stepLabel;
    indicator.textContent = stepLabel;
    icon.src = tutorialIcons[index % tutorialIcons.length];
    step.dataset.anchor = current.anchor;
    title.textContent = current.title;
    text.textContent = current.text;
    next.textContent = index === copy.tutorial.steps.length - 1
      ? copy.labels.finish
      : copy.labels.next;
  }

  render();
  return guide;
}
