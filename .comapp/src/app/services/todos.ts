import { inject, Injectable, OnInit } from '@angular/core';
import { Todo } from '../models/todo.type';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class Todoservice  {
  url="http://localhost:3000/"
  http=inject(HttpClient)


  getTodos(){
    console.log(this.http.get(this.url+"users"))
      return this.http.get<Array<Todo>>(this.url+"users")
  }
}
