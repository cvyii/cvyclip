'use strict';

// Progressive enhancement: all informational content is available without JS.
const navigation = document.querySelector('#navigation');
const menuToggle = document.querySelector('.menu-toggle');
if (navigation && menuToggle) {
  document.documentElement.classList.add('js-enabled');
  menuToggle.hidden = false;
  const closeMenu = (restoreFocus = false) => {
    navigation.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) menuToggle.focus();
  };
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
  });
  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.header-inner')) closeMenu();
  });
  window.matchMedia('(min-width: 651px)').addEventListener('change', () => closeMenu());
}

const previewControls = document.querySelector('.preview-controls');
const frame = document.querySelector('.demo-frame');
const description = document.querySelector('#demo-description');
if (previewControls && frame && description) {
  previewControls.hidden = false;
  const formats = {portrait: ['9:16', 'Vertical'], square: ['1:1', 'Square'], landscape: ['16:9', 'Landscape']};
  const updateDescription = () => {
    const [ratio, name] = formats[frame.dataset.layout];
    const style = frame.dataset.style === 'clean' ? 'clean' : 'highlighted';
    frame.querySelector('.demo-frame-label').textContent = ratio;
    description.textContent = `${name} ${ratio} with ${style} captions. An illustrative layout for a short-form story.`;
  };
  previewControls.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.format && formats[button.dataset.format]) {
      frame.dataset.layout = button.dataset.format;
      previewControls.querySelectorAll('[data-format]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    }
    if (button.dataset.caption) {
      frame.dataset.style = button.dataset.caption;
      previewControls.querySelectorAll('[data-caption]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    }
    updateDescription();
  });
}
