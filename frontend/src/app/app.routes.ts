import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Main } from './main/main';
import { Sign } from './sign/sign';
import { AuthGuard } from "../auth.guard"
export const routes: Routes = [
      
     { path: '', component: Login }
     ,  { path: 'home', component: Main ,canActivate: [AuthGuard] }
     , { path: 'sign', component: Sign }
    
  
];
