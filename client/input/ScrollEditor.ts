// ============================================================
// Scroll editor (pre-game custom shorthand)
// ============================================================

const STORAGE_KEY = 'commander-rts-scroll';

export class ScrollEditor {
  private modal: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private scroll: string = '';

  constructor() {
    this.modal = document.getElementById('scroll-modal')!;
    this.textarea = document.getElementById('scroll-textarea') as HTMLTextAreaElement;

    const scrollBtn = document.getElementById('scroll-btn')!;
    const saveBtn = document.getElementById('scroll-save')!;
    const cancelBtn = document.getElementById('scroll-cancel')!;

    scrollBtn.addEventListener('click', () => this.open());
    saveBtn.addEventListener('click', () => this.save());
    cancelBtn.addEventListener('click', () => this.close());

    // Close on backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Load from localStorage
    this.scroll = localStorage.getItem(STORAGE_KEY) || '';
    this.textarea.value = this.scroll;
  }

  open(): void {
    this.textarea.value = this.scroll;
    this.modal.classList.add('active');
    this.textarea.focus();
  }

  close(): void {
    this.modal.classList.remove('active');
  }

  save(): void {
    this.scroll = this.textarea.value;
    localStorage.setItem(STORAGE_KEY, this.scroll);
    this.close();
  }

  getScroll(): string {
    return this.scroll;
  }
}
