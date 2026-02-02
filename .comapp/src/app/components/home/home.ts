import { Component } from '@angular/core';
import { signal } from '@angular/core';
import { Greeting } from '../greeting/greeting';
import { Counter } from '../counter/counter';
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [Greeting,Counter],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  public name =signal("test")
  protected keyhandlerinput(event:KeyboardEvent){
    console.log(event.key)
  }
}
