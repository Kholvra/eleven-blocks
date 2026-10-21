import copy from '../data/copy.json';

export const tutorialLabels = copy.labels;
export type TutorialTipContext = keyof typeof copy.tips;

export function createTutorialSteps(): HTMLOListElement {
  const steps = document.createElement('ol');
  steps.className = 'tutorial-steps';
  steps.setAttribute('aria-label', 'Tiga langkah cara bermain');

  for (const step of copy.tutorial.steps) {
    const item = document.createElement('li');
    item.className = 'tutorial-step';
    item.dataset.anchor = step.anchor;

    const content = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = step.title;
    const description = document.createElement('p');
    description.textContent = step.text;
    content.append(title, description);
    item.append(content);
    steps.append(item);
  }

  return steps;
}

export function createContextualTip(context: TutorialTipContext): HTMLDetailsElement {
  const tip = document.createElement('details');
  tip.className = 'tutorial-tip';
  tip.name = 'tutorial-tips';
  const summary = document.createElement('summary');
  summary.textContent = copy.labels.howToPlay;
  const text = document.createElement('p');
  text.textContent = copy.tips[context];
  tip.append(summary, text);
  return tip;
}

export function createTutorialGuide(onFinish: () => void): HTMLElement {
  const guide = document.createElement('section');
  guide.className = 'tutorial-guide';
  guide.setAttribute('aria-live', 'polite');
  guide.setAttribute('aria-atomic', 'true');

  let index = 0;
  const progress = document.createElement('p');
  progress.className = 'tutorial-progress';
  const step = document.createElement('article');
  step.className = 'tutorial-current-step';
  const title = document.createElement('h2');
  const text = document.createElement('p');
  step.append(title, text);

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
    progress.textContent = `Langkah ${index + 1} dari ${copy.tutorial.steps.length}`;
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
