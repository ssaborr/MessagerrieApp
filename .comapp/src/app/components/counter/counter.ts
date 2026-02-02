import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-counter',
  imports: [],
  templateUrl: './counter.html',
  styleUrl: './counter.css',
})
export class Counter {
counter =signal(0)
increment(){
this.counter.update(val=>val+1)
}
decrement(){
  this.counter.update(val=>val-1)
}
reset(){
  this.counter.set(0)
}
}
