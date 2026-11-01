import { Injectable, type TemplateRef, computed, signal } from '@angular/core';

// Lets the page on screen put its own buttons in the app header, next to the sound toggle.
@Injectable({ providedIn: 'root' })
export class HeaderActionsService {
  readonly template = computed(() => this.templateState());

  private readonly templateState = signal<TemplateRef<unknown> | null>(null);

  // Returns the function that takes the template down again; a newer one is left alone.
  register(template: TemplateRef<unknown>): () => void {
    this.templateState.set(template);

    return () => {
      if (this.templateState() === template) {
        this.templateState.set(null);
      }
    };
  }
}
