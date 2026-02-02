import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Home } from "./components/home/home";
import { Header } from "./components/header/header";
import { provideHttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Home, Header],
  template:`<app-header> </app-header>
    <main><router-outlet/></main>
    
 `,
  styleUrl: './app.css',
  styles:[],
 
})
export class App {
  protected readonly title = signal('comapp');

}
