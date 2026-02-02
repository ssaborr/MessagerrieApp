import { Component, inject, OnInit, signal } from '@angular/core';
import { Todoservice } from '../services/todos';
import { Todo } from '../models/todo.type';
import { catchError, throwError } from 'rxjs';
import { NgStyle, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FilterpipePipe } from '../pipes/filterpipe-pipe';


@Component({
  selector: 'app-todos',
  imports: [NgStyle,UpperCasePipe,FormsModule,FilterpipePipe],
  standalone:true,
  templateUrl: './todos.html',
  styleUrl: './todos.css',
})
export class Todos implements OnInit {
  filter=""
todoservice=inject(Todoservice)
todo1=signal<Array<Todo>>([])
ngOnInit(): void {
  this.todoservice.getTodos().pipe(catchError((err)=>{console.log(err);throw err})).subscribe((users)=>
    {console.log(users);this.todo1.set(users)})

}
}
