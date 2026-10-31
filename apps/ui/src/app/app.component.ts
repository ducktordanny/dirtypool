import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterOutlet],
  selector: 'dp-root',
  styleUrl: './app.component.scss',
  templateUrl: './app.component.html',
})
export class App {}
