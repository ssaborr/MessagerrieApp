import { Pipe, PipeTransform } from '@angular/core';
import { Todo } from '../models/todo.type';

@Pipe({
  name: 'filterpipe',
   
})
export class FilterpipePipe implements PipeTransform {

  transform(value: Todo[], filter: string): Todo[] {
    if(!filter){
      return value
    }else{
      return value.filter((ele)=>ele.mail.toLowerCase().includes(filter.toLowerCase()))
    }
  }

}
