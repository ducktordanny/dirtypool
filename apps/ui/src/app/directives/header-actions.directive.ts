import { DestroyRef, Directive, TemplateRef, afterNextRender, inject } from '@angular/core';
import { HeaderActionsService } from '../services/header-actions.service';

// Put on an ng-template: its content shows in the app header while the page owning it is open.
@Directive({ selector: 'ng-template[dpHeaderActions]' })
export class HeaderActions {
  constructor() {
    const actions = inject(HeaderActionsService);
    const template = inject<TemplateRef<unknown>>(TemplateRef);
    const destroyRef = inject(DestroyRef);

    // Registering after render keeps the header out of the page's own change detection pass.
    afterNextRender(() => destroyRef.onDestroy(actions.register(template)));
  }
}
