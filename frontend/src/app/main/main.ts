import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval, merge } from 'rxjs';
import { MqttService, IMqttMessage } from '../services/mqtt.service';
import { AuthService } from '../services/auth-service';

interface ContactRequestItem {
  _id: string;
  fromUser: { _id: string; identifiant: string };
  createdAt: string;
}

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './main.html',
  styleUrls: ['./main.css']
})
export class Main implements OnInit, OnDestroy, AfterViewChecked {
  private http = inject(HttpClient);
  private mqtt = inject(MqttService);
  private cdr = inject(ChangeDetectorRef);
  auth = inject(AuthService);

  @ViewChild('chatBox') chatBoxRef?: ElementRef<HTMLDivElement>;
  private shouldScrollToBottom = false;

  users: any[] = [];
  onlineUsers: string[] = [];
  selectedUserId = '';
  selectedUserName = '';
  conversationId = '';
  topic = '';
  messages: any[] = [];
  newMessage = '';
  myUserId = '';
  isConnected = false;
  showChat = false;
  startingChat = false;
  usersLoading = false;

  contactRequests: ContactRequestItem[] = [];
  pendingSentIds: string[] = [];
  unreadByConversation: Record<string, number> = {};
  conversations: Record<string, { _id: string; topic?: string; otherParticipant: { _id: string; identifiant: string } | null }> = {};
  notificationOpen = false;
  searchQuery = '';
  searchResults: any[] = [];
  searchLoading = false;

  private mqttSub?: Subscription;
  private allTopicsSub?: Subscription;
  private mqttStateSub?: Subscription;
  private readonly API = 'http://localhost:3000';
  private heartbeatSub?: Subscription;
  private pollPresenceSub?: Subscription;
  private pollRequestsSub?: Subscription;
  private pollMessagesSub?: Subscription;
  private pollConversationsSub?: Subscription;
  private clickHandler?: (e: MouseEvent) => void;

  ngOnInit(): void {
    this.auth.user$.subscribe(user => {
      if (user?._id) {
        this.myUserId = String(user._id);
        this.loadContacts();
        this.loadContactRequests();
        this.loadPendingSent();
        this.loadConversations();
        this.setupPresence();
        this.pollConversationsSub = interval(12000).subscribe(() => this.loadConversations());
      }
    });
    this.isConnected = (this.mqtt.state.value === 1);
    this.mqttStateSub = this.mqtt.state.subscribe(s => {
      this.isConnected = (s === 1);
      this.cdr.detectChanges();
    });
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (this.notificationOpen && !target.closest('.notif-wrap')) {
        this.notificationOpen = false;
        this.cdr.detectChanges();
      }
    };
    document.addEventListener('click', this.clickHandler);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.shouldScrollToBottom = false;
      this.scrollChatToBottom();
    }
  }

  scrollChatToBottom(): void {
    setTimeout(() => {
      const el = this.chatBoxRef?.nativeElement ?? document.querySelector('.chat-box');
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  private scrollChatToBottomAfterOpen(): void {
    setTimeout(() => this.scrollChatToBottom(), 50);
    setTimeout(() => this.scrollChatToBottom(), 200);
  }

  ngOnDestroy(): void {
    this.mqttSub?.unsubscribe();
    this.allTopicsSub?.unsubscribe();
    this.mqttStateSub?.unsubscribe();
    this.heartbeatSub?.unsubscribe();
    this.pollPresenceSub?.unsubscribe();
    this.pollRequestsSub?.unsubscribe();
    this.pollMessagesSub?.unsubscribe();
    this.pollConversationsSub?.unsubscribe();
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler);
    }
    try { this.mqtt.disconnect(); } catch {}
  }

  get totalNotificationCount(): number {
    const reqCount = this.contactRequests.length;
    const unreadCount = Object.values(this.unreadByConversation).reduce((a, b) => a + b, 0);
    return reqCount + unreadCount;
  }

  private get headers() {
    return { Authorization: `Bearer ${this.auth.token}` };
  }

  setupPresence() {
    if (!this.myUserId || !this.auth.token) return;
    this.heartbeatSub?.unsubscribe();
    this.heartbeatSub = interval(12000).subscribe(() => {
      this.http.post(`${this.API}/presence/heartbeat`, {}, { headers: this.headers }).subscribe({ error: () => {} });
    });
    this.http.post(`${this.API}/presence/heartbeat`, {}, { headers: this.headers }).subscribe({ error: () => {} });

    this.pollPresenceSub?.unsubscribe();
    this.pollPresenceSub = interval(5000).subscribe(() => {
      this.http.get<string[]>(`${this.API}/presence/online`, { headers: this.headers }).subscribe({
        next: (ids) => {
          const next = (ids || []).map(id => String(id));
          if (JSON.stringify(next) !== JSON.stringify(this.onlineUsers)) {
            this.onlineUsers = next;
            this.cdr.detectChanges();
          }
        },
        error: () => {}
      });
    });
    this.http.get<string[]>(`${this.API}/presence/online`, { headers: this.headers }).subscribe({
      next: (ids) => {
        this.onlineUsers = (ids || []).map(id => String(id));
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  loadContacts() {
    if (!this.auth.token) return;
    this.usersLoading = true;
    this.http.get<any[]>(`${this.API}/contacts`, { headers: this.headers }).subscribe({
      next: (data) => {
        this.users = (data || []).map(u => ({ _id: String(u._id), identifiant: u.identifiant }));
        this.usersLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.users = [];
        this.usersLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadContactRequests() {
    if (!this.auth.token) return;
    const load = () => {
      this.http.get<ContactRequestItem[]>(`${this.API}/contacts/requests`, { headers: this.headers }).subscribe({
        next: (data) => {
          const filtered = (data || []).filter(r => r && r.fromUser && r.fromUser.identifiant);
          if (JSON.stringify(filtered) !== JSON.stringify(this.contactRequests)) {
            this.contactRequests = filtered;
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          console.error('Failed to load contact requests:', err);
          if (this.contactRequests.length > 0) {
            this.contactRequests = [];
            this.cdr.detectChanges();
          }
        }
      });
    };
    load();
    this.pollRequestsSub?.unsubscribe();
    this.pollRequestsSub = interval(6000).subscribe(() => load());
  }

  loadPendingSent() {
    if (!this.auth.token) return;
    this.http.get<string[]>(`${this.API}/contacts/sent`, { headers: this.headers }).subscribe({
      next: (ids) => {
        this.pendingSentIds = (ids || []).map(id => String(id));
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  loadConversations() {
    if (!this.auth.token) return;
    this.http.get<any[]>(`${this.API}/conversations`, { headers: this.headers }).subscribe({
      next: (convs) => {
        const map: Record<string, any> = {};
        (convs || []).forEach(c => {
          map[String(c._id)] = {
            _id: String(c._id),
            topic: c.topic,
            otherParticipant: c.otherParticipant
          };
        });
        this.conversations = map;
        this.setupAllTopicSubscriptions();
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  private setupAllTopicSubscriptions() {
    this.allTopicsSub?.unsubscribe();
    const topics = Object.values(this.conversations)
      .map(c => c.topic)
      .filter((t): t is string => !!t);
    const uniqueTopics = [...new Set(topics)];
    if (uniqueTopics.length === 0) return;

    const handler = (msg: IMqttMessage) => {
      try {
        const payload = JSON.parse(msg.payload.toString());
        const convId = String(payload.conversationId || '');
        const senderId = String(payload.senderId || '');
        if (!convId || senderId === this.myUserId) return;

        if (convId === this.conversationId && this.showChat) {
          const msgExists = this.messages.some(m =>
            m.conversationId === convId &&
            m.senderId === senderId &&
            m.encryptedMessage === payload.encryptedMessage
          );
          if (!msgExists) {
            this.messages = [...this.messages, {
              conversationId: convId,
              senderId,
              encryptedMessage: payload.encryptedMessage || ''
            }];
            this.shouldScrollToBottom = true;
          }
        } else {
          const prev = this.unreadByConversation[convId] || 0;
          this.unreadByConversation = { ...this.unreadByConversation, [convId]: prev + 1 };
        }
        this.cdr.detectChanges();
      } catch (err) {
        console.error('Failed to parse MQTT message', err);
      }
    };

    this.allTopicsSub = merge(...uniqueTopics.map(t => this.mqtt.observe(t))).subscribe(handler);
  }

  get unreadConversations(): Array<{ convId: string; name: string; count: number }> {
    return Object.entries(this.unreadByConversation)
      .filter(([_, count]) => count > 0)
      .map(([convId, count]) => {
        const conv = this.conversations[convId];
        const name = conv?.otherParticipant?.identifiant || 'Utilisateur inconnu';
        return { convId, name, count };
      })
      .sort((a, b) => b.count - a.count);
  }

  toggleNotifications() {
    this.notificationOpen = !this.notificationOpen;
    if (this.notificationOpen) {
      this.loadContactRequests();
      this.loadConversations();
      this.cdr.detectChanges();
    }
  }

  openConversationFromNotification(convId: string) {
    const conv = this.conversations[convId];
    if (!conv?.otherParticipant) return;
    const userId = conv.otherParticipant._id;
    this.notificationOpen = false;
    this.startConversation(userId);
  }

  searchUsers() {
    const q = (this.searchQuery || '').trim();
    if (!q) {
      this.searchResults = [];
      this.cdr.detectChanges();
      return;
    }
    this.searchLoading = true;
    this.http.get<any[]>(`${this.API}/users?search=${encodeURIComponent(q)}`, { headers: this.headers }).subscribe({
      next: (data) => {
        const all = (data || []).map(u => ({ _id: String(u._id), identifiant: u.identifiant }));
        const contactIds = new Set(this.users.map(u => u._id));
        this.searchResults = all.filter(u => u._id !== this.myUserId && !contactIds.has(u._id));
        this.searchLoading = false;
        this.loadPendingSent();
        this.cdr.detectChanges();
      },
      error: () => {
        this.searchResults = [];
        this.searchLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  addContact(toUserId: string) {
    if (this.pendingSentIds.includes(toUserId)) return;
    this.http.post(`${this.API}/contacts/request`, { toUserId }, { headers: this.headers }).subscribe({
      next: () => {
        this.pendingSentIds = [...this.pendingSentIds, toUserId];
        this.cdr.detectChanges();
      },
      error: (e) => {
        console.error('Failed to send contact request:', e);
        if (e?.error?.message?.includes('already')) {
          this.pendingSentIds = [...this.pendingSentIds, toUserId];
          this.loadPendingSent();
        }
        this.cdr.detectChanges();
      }
    });
  }

  acceptRequest(requestId: string) {
    this.http.post(`${this.API}/contacts/requests/${requestId}/accept`, {}, { headers: this.headers }).subscribe({
      next: () => {
        this.contactRequests = this.contactRequests.filter(r => r._id !== requestId);
        this.loadContacts();
        this.loadPendingSent();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to accept request:', err);
        this.cdr.detectChanges();
      }
    });
  }

  rejectRequest(requestId: string) {
    this.http.post(`${this.API}/contacts/requests/${requestId}/reject`, {}, { headers: this.headers }).subscribe({
      next: () => {
        this.contactRequests = this.contactRequests.filter(r => r._id !== requestId);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to reject request:', err);
        this.cdr.detectChanges();
      }
    });
  }

  isPendingSent(userId: string): boolean {
    return this.pendingSentIds.includes(String(userId));
  }

  private startMessagePolling() {
    this.pollMessagesSub?.unsubscribe();
    if (!this.conversationId || !this.showChat) return;
    
    this.pollMessagesSub = interval(2000).subscribe(() => {
      if (!this.conversationId || !this.showChat) {
        this.pollMessagesSub?.unsubscribe();
        return;
      }
      this.http.get<any[]>(`${this.API}/messages/${this.conversationId}`, { headers: this.headers }).subscribe({
        next: (history) => {
          const newMessages = (history || []).map(m => ({
            _id: String(m._id || ''),
            conversationId: String(m.conversationId),
            senderId: String(m.senderId),
            encryptedMessage: m.encryptedMessage || '',
            createdAt: m.createdAt
          }));
          
          const existingIds = new Set(this.messages.map(m => m._id).filter(id => id));
          const existingKeys = new Set(
            this.messages.map(m => `${m.conversationId}:${m.senderId}:${m.encryptedMessage}`)
          );
          
          const toAdd = newMessages.filter(m => {
            if (m._id && existingIds.has(m._id)) return false;
            const key = `${m.conversationId}:${m.senderId}:${m.encryptedMessage}`;
            if (existingKeys.has(key)) return false;
            return true;
          });
          if (toAdd.length > 0) {
            this.messages = [...this.messages, ...toAdd].sort((a, b) => {
              if (a.createdAt && b.createdAt) {
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              }
              return 0;
            });
            this.shouldScrollToBottom = true;
            this.cdr.detectChanges();
          }
        },
        error: () => {}
      });
    });
  }

  startConversation(userId?: string) {
    const targetUserId = userId || this.selectedUserId;
    if (!targetUserId || this.startingChat) return;

    const user = this.users.find(u => u._id === targetUserId);
    if (!user) return;

    this.startingChat = true;
    this.selectedUserId = targetUserId;
    this.selectedUserName = user.identifiant;

    this.http.post<any>(`${this.API}/conversations`, { receiverId: targetUserId }, { headers: this.headers }).subscribe({
      next: (res) => {
        const convId = String(res.conversationId);
        const t = res.topic || `chat/${convId}`;
        this.conversationId = convId;
        this.topic = t;
        this.messages = [];
        this.showChat = true;
        delete this.unreadByConversation[convId];
        this.cdr.detectChanges();

        this.http.get<any[]>(`${this.API}/messages/${convId}`, { headers: this.headers }).subscribe({
          next: (history) => {
            this.messages = (history || []).map(m => ({
              _id: String(m._id || ''),
              conversationId: String(m.conversationId),
              senderId: String(m.senderId),
              encryptedMessage: m.encryptedMessage || '',
              createdAt: m.createdAt
            }));
            this.startMessagePolling();
            this.loadConversations();
            this.startingChat = false;
            this.cdr.detectChanges();
            this.scrollChatToBottomAfterOpen();
          },
          error: () => {
            this.startMessagePolling();
            this.loadConversations();
            this.startingChat = false;
            this.cdr.detectChanges();
            this.scrollChatToBottomAfterOpen();
          }
        });
      },
      error: () => {
        this.startingChat = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeChat() {
    this.showChat = false;
    this.pollMessagesSub?.unsubscribe();
    setTimeout(() => {
      this.conversationId = '';
      this.selectedUserId = '';
      this.selectedUserName = '';
      this.messages = [];
      this.cdr.detectChanges();
    }, 300);
  }

  isUserOnline(userId: string): boolean {
    return userId ? this.onlineUsers.includes(String(userId)) : false;
  }

  sendMessage() {
    const text = (this.newMessage || '').trim();
    if (!text || !this.topic || !this.conversationId) return;

    const tempId = 'temp_' + Date.now();
    const payload = {
      _id: tempId,
      conversationId: this.conversationId,
      senderId: this.myUserId,
      encryptedMessage: text
    };

    this.messages = [...this.messages, payload];
    this.newMessage = '';
    this.shouldScrollToBottom = true;
    this.cdr.detectChanges();

    this.mqtt.unsafePublish(this.topic, JSON.stringify({
      conversationId: this.conversationId,
      senderId: this.myUserId,
      encryptedMessage: text
    }), { qos: 0, retain: false });
    
    this.http.post(`${this.API}/messages`, {
      conversationId: this.conversationId,
      encryptedMessage: text
    }, { headers: this.headers }).subscribe({
      error: () => {
        this.messages = this.messages.filter(m => m._id !== tempId);
        this.cdr.detectChanges();
      }
    });
  }

  scrollUsers(dir: number) {
    const el = document.querySelector('.users-list-horizontal');
    if (el) el.scrollBy({ left: dir * 280, behavior: 'smooth' });
  }

  formatMessageTime(createdAt?: string | Date): string {
    if (!createdAt) return '';
    const date = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
