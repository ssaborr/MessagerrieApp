import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CryptoService } from '../services/crypto';
import { AuthService } from '../services/auth-service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, NgIf, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  router = inject(Router);
  http = inject(HttpClient);
  crypto = inject(CryptoService);
  auth = inject(AuthService);

  identifiant = '';
  password = '';
  error = '';

  async onsubmit() {
    try {
      // 1️⃣ Login request
      const res: any = await this.http.post('http://127.0.0.1:3000/login', {
        identifiant: this.identifiant,
        password: this.password
      }).toPromise();

      // 2️⃣ Save JWT token
      localStorage.setItem('token', res.token);
      this.auth.setAuth(res.token);

      // 3️⃣ Decrypt private key with password
      const privateKey = await this.crypto.decryptPrivateKey(
        this.password,
        res.encryptedPrivateKey,
        res.iv,
        res.salt
      );

      // 4️⃣ Save private key in memory (or IndexedDB for multi-device backup)
      this.crypto.setPrivateKey(privateKey);

      // 5️⃣ Navigate to home
      this.router.navigate(['/home']);
    } catch (err: any) {
      console.error(err);
      this.error = err?.error?.message || 'Identifiant ou mot de passe incorrect';
    }
  }
}
