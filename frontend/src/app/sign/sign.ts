import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CryptoService } from '../services/crypto';
import { AuthService } from '../services/auth-service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-sign',
  standalone: true,
  imports: [FormsModule, NgIf, RouterLink],
  templateUrl: './sign.html',
  styleUrl: './sign.css',
})
export class Sign {
  router = inject(Router);
  http = inject(HttpClient);
  crypto = inject(CryptoService);
  auth = inject(AuthService);

  identifiant = '';
  password = '';
  passwordConfirmation = '';
  role = 0;
  error = '';

  async onsubmit() {
    try {
      if (this.password !== this.passwordConfirmation) {
        this.error = "Les mots de passe ne sont pas similaires";
        return;
      }

      // 1️⃣ Generate RSA key pair
    const { publicKeyPem, privateKey } = await this.crypto.generateKeyPair();

      // 2️⃣ Encrypt private key with user password
      const { encryptedPrivateKey, iv, salt } = await this.crypto.encryptPrivateKey(
        this.password,
        privateKey
      );

      // 3️⃣ Send signup data to backend
      const res: any = await this.http.post('http://127.0.0.1:3000/sign', {
        identifiant: this.identifiant,
        password: this.password,
        role: this.role,
      publicKey: publicKeyPem,
        encryptedPrivateKey,
        iv,
        salt
      }).toPromise();

      // 4️⃣ Store encrypted private key locally for backup
      await this.crypto.storePrivateKey(encryptedPrivateKey, iv, salt);

      // 5️⃣ Save token & redirect
      localStorage.setItem('token', res.token);
      this.auth.setAuth(res.token);
      this.router.navigate(['/home']);
    } catch (err: any) {
      console.error(err);
      this.error = err?.error?.message || 'Erreur serveur';
    }
  }
}
