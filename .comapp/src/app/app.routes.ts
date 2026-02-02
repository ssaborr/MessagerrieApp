import { Routes } from '@angular/router';

export const routes: Routes = [
   {
    path: '',
    loadComponent: () =>
      import('./components/home/home')
        .then(m => m.Home)
  },
    {
    path: 'todos',
    loadComponent: () =>
      import('./todos/todos')
        .then(m => m.Todos)
  }
];
