import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UserState {
  identifiant: string;
  role: number;
   _id: string;    
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private userSubject = new BehaviorSubject<UserState | null>(null);
  user$ = this.userSubject.asObservable();

  constructor() {
    this.loadFromToken();
  }

  setAuth(token: string) {
    localStorage.setItem('token', token);
    this.loadFromToken();
  }

  logout() {
    localStorage.removeItem('token');
    this.userSubject.next(null);
  }

  get token(): string | null {
    return localStorage.getItem('token'); // <-- add this
  }

  private loadFromToken() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.userSubject.next(null);
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this.userSubject.next({
        _id: payload.userId,       // userId from JWT
        identifiant: payload.identifiant,
        role: payload.role
      });
    } catch {
      this.userSubject.next(null);
    }
  }
}
