//
// Command input handler with history
//

export class CommandInput {
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private pendingIndicator: HTMLElement;
  private history: string[] = [];
  private historyIndex: number = -1;
  private onSubmit: ((command: string) => void) | null = null;
  private pendingCount: number = 0;

  constructor() {
    this.inputEl = document.getElementById('command-input') as HTMLInputElement;
    this.sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
    this.pendingIndicator = document.getElementById('pending-indicator')!;

    this.inputEl.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.sendBtn.addEventListener('click', () => this.submit());

    // Focus on load
    this.inputEl.focus();
  }

  setOnSubmit(cb: (command: string) => void): void {
    this.onSubmit = cb;
  }

  /** Track how many commands are in-flight (never blocks input) */
  incrementPending(): void {
    this.pendingCount++;
    this.updateIndicator();
  }

  decrementPending(): void {
    this.pendingCount = Math.max(0, this.pendingCount - 1);
    this.updateIndicator();
  }

  private updateIndicator(): void {
    if (this.pendingCount > 0) {
      this.pendingIndicator.textContent = `⏳ Processing ${this.pendingCount} command${this.pendingCount > 1 ? 's' : ''}...`;
    } else {
      this.pendingIndicator.textContent = '';
    }
  }

  focus(): void {
    this.inputEl.focus();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.navigateHistory(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.navigateHistory(1);
    }
  }

  private submit(): void {
    const command = this.inputEl.value.trim();
    if (!command) return;

    // Add to history
    this.history.push(command);
    this.historyIndex = -1;

    // Clear input
    this.inputEl.value = '';

    // Callback — input is never locked, player can keep typing
    if (this.onSubmit) {
      this.onSubmit(command);
    }
  }

  private navigateHistory(direction: number): void {
    if (this.history.length === 0) return;

    if (this.historyIndex === -1) {
      // Start from end
      if (direction === -1) {
        this.historyIndex = this.history.length - 1;
      } else {
        return;
      }
    } else {
      this.historyIndex += direction;
    }

    // Clamp
    if (this.historyIndex < 0) {
      this.historyIndex = 0;
    } else if (this.historyIndex >= this.history.length) {
      this.historyIndex = -1;
      this.inputEl.value = '';
      return;
    }

    this.inputEl.value = this.history[this.historyIndex];
  }
}
