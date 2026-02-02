import { Injectable } from '@angular/core';
import { openDB, IDBPDatabase } from 'idb';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {
  private dbPromise!: Promise<IDBPDatabase>;
  private publicKey: CryptoKey | null = null;
  private privateKey: CryptoKey | null = null;
 private _privateKey: CryptoKey | null = null;

  // Store decrypted private key in memory
  setPrivateKey(key: CryptoKey) {
    this._privateKey = key;
  }

  getPrivateKey(): CryptoKey | null {
    return this._privateKey;
  }
  constructor() {
    this.initDB();
  }

  // ---------------------------
  // IndexedDB initialization
  // ---------------------------
  private async initDB() {
    this.dbPromise = openDB('crypto-store', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('keys')) {
          db.createObjectStore('keys');
        }
      }
    });
  }

  // ---------------------------
  // Generate RSA key pair
  // ---------------------------
  async generateKeyPair(): Promise<{ publicKeyPem: string, privateKey: CryptoKey }> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );

    this.privateKey = keyPair.privateKey;
    this.publicKey = keyPair.publicKey;

    const exportedPub = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const publicKeyPem = this.arrayBufferToPem(exportedPub, 'PUBLIC KEY');

    return { publicKeyPem, privateKey: keyPair.privateKey };
  }

  // ---------------------------
  // Encrypt private key with password
  // ---------------------------
 async encryptPrivateKey(password: string, privateKey: CryptoKey) {
  const exportedPrivate = await crypto.subtle.exportKey('pkcs8', privateKey);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const aesKey = await this.deriveKey(password, salt); // deriveKey expects Uint8Array

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer }, // <-- pass ArrayBuffer
    aesKey,
    exportedPrivate
  );

  return {
    encryptedPrivateKey: this.arrayBufferToBase64(encrypted),
    iv: this.arrayBufferToBase64(iv.buffer), // <-- pass ArrayBuffer
    salt: this.arrayBufferToBase64(salt.buffer) // <-- pass ArrayBuffer
  };
}


  // ---------------------------
  // Decrypt private key with password
  // ---------------------------
  async decryptPrivateKey(password: string, encryptedBase64: string, ivBase64: string, saltBase64: string) {
  const encrypted = this.base64ToArrayBuffer(encryptedBase64);
  const iv = new Uint8Array(this.base64ToArrayBuffer(ivBase64)); // make Uint8Array
  const salt = new Uint8Array(this.base64ToArrayBuffer(saltBase64));

  const aesKey = await this.deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, // Uint8Array is fine here
    aesKey,
    encrypted
  );

  this.privateKey = await crypto.subtle.importKey(
    'pkcs8',
    decrypted,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );

  return this.privateKey;
}


  // ---------------------------
  // Save encrypted private key in IndexedDB
  // ---------------------------
  async storePrivateKey(encryptedPrivateKey: string, iv: string, salt: string) {
    const db = await this.dbPromise;
    await db.put('keys', { encryptedPrivateKey, iv, salt }, 'privateKey');
  }

  async getStoredPrivateKey() {
    const db = await this.dbPromise;
    return db.get('keys', 'privateKey');
  }

  // ---------------------------
  // Store public key
  // ---------------------------
  async setPublicKey(pem: string) {
    this.publicKey = await this.importPublicKey(pem);
    const db = await this.dbPromise;
    await db.put('keys', pem, 'publicKey');
  }

  async getPublicKey() {
    if (this.publicKey) return this.publicKey;
    const db = await this.dbPromise;
    const pem = await db.get('keys', 'publicKey');
    if (pem) return this.importPublicKey(pem);
    return null;
  }

  // ---------------------------
  // Helper: derive AES key from password
  // ---------------------------
private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer, // <-- explicit cast fixes TS error
      iterations: 250000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

  // ---------------------------
  // Helper: import public key PEM
  // ---------------------------
  private async importPublicKey(pem: string) {
    const binary = this.pemToArrayBuffer(pem);
    return crypto.subtle.importKey(
      'spki',
      binary,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    );
  }

  // ---------------------------
  // Utility converters
  // ---------------------------
private arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

private base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

private arrayBufferToPem(buffer: ArrayBuffer, label: string): string {
  const b64 = this.arrayBufferToBase64(buffer);
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

private pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----.*?-----/g, '').replace(/\s+/g, '');
  return this.base64ToArrayBuffer(b64);
}

}
