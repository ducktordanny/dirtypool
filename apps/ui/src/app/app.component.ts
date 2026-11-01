import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SoundToggle } from './components/ui';
import { AudioService } from './services/audio.service';
import { HeaderActionsService } from './services/header-actions.service';

@Component({
  imports: [NgTemplateOutlet, RouterLink, RouterOutlet, SoundToggle],
  selector: 'dp-root',
  styleUrl: './app.component.scss',
  templateUrl: './app.component.html',
  // Audio can only start inside a user gesture, so the first one anywhere on the page unlocks it.
  host: {
    '(pointerdown)': 'audio.unlock()',
    '(keydown)': 'audio.unlock()',
  },
})
export class App {
  protected readonly audio = inject(AudioService);
  protected readonly headerActions = inject(HeaderActionsService);
}
