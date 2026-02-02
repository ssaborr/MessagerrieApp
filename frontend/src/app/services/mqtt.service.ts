import { inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import mqtt from 'mqtt';

/** Same shape as ngx-mqtt for easy migration: 0 = connecting, 1 = connected */
export interface IMqttMessage {
  topic: string;
  payload: Uint8Array & { toString(): string };
  toString(): string;
}

export interface MqttServiceOptions {
  hostname: string;
  port: number;
  path?: string;
  protocol?: 'ws' | 'wss';
}

const DEFAULT_OPTIONS: MqttServiceOptions = {
  hostname: 'broker.hivemq.com',
  port: 8000,
  path: '/mqtt',
  protocol: 'wss',
};

@Injectable({ providedIn: 'root' })
export class MqttService implements OnDestroy {
  /** Connection state: 0 = disconnected/connecting, 1 = connected (matches ngx-mqtt) */
  readonly state = new BehaviorSubject<number>(0);

  private client: ReturnType<typeof mqtt.connect> | null = null;
  private readonly options: MqttServiceOptions;
  private connecting = false;
  private readonly ngZone = inject(NgZone);

  constructor() {
    this.options = { ...DEFAULT_OPTIONS };
    this.connect();
  }

  private get brokerUrl(): string {
    const p = this.options.path ?? '/mqtt';
    const path = p.startsWith('/') ? p : '/' + p;
    return `${this.options.protocol ?? 'ws'}://${this.options.hostname}:${this.options.port}${path}`;
  }

  private connect(): void {
    if (this.client?.connected || this.connecting) return;
    this.connecting = true;
    this.state.next(0);

    try {
      this.client = mqtt.connect(this.brokerUrl, {
        clientId: 'pang_' + Math.random().toString(16).slice(2, 10),
        clean: true,
        reconnectPeriod: 3000,
      });

      this.client.on('connect', () => {
        this.connecting = false;
        this.state.next(1);
      });

      this.client.on('disconnect', () => this.state.next(0));
      this.client.on('close', () => this.state.next(0));
      this.client.on('error', () => this.state.next(0));
    } catch (err) {
      this.connecting = false;
      this.state.next(0);
      console.error('MQTT connect error', err);
    }
  }

  /** Subscribe to a topic; returns observable of messages (same API as ngx-mqtt observe) */
  observe(topic: string): Observable<IMqttMessage> {
    const subject = new Subject<IMqttMessage>();

    // Convert wildcard topic to regex pattern
    const topicPattern = topic.replace(/\+/g, '[^/]+').replace(/#/g, '.*');
    const regex = new RegExp(`^${topicPattern}$`);

    const handler = (t: string, payload: Buffer) => {
      if (!regex.test(t)) return;
      const bytes = new Uint8Array(payload);
      const payloadWithToString = Object.assign(bytes, {
        toString() {
          return new TextDecoder().decode(bytes);
        },
      }) as IMqttMessage['payload'];
      const message: IMqttMessage = {
        topic: t,
        payload: payloadWithToString,
        toString() {
          return new TextDecoder().decode(bytes);
        },
      };
      // Deliver inside Angular zone so UI updates immediately (e.g. receiver sees new message)
      this.ngZone.run(() => subject.next(message));
    };

    const doSub = () => {
      if (!this.client?.connected) {
        const sub = this.state.subscribe((s) => {
          if (s === 1) {
            sub.unsubscribe();
            this.client!.on('message', handler);
            this.client!.subscribe(topic, { qos: 0 });
          }
        });
        return;
      }
      this.client!.on('message', handler);
      this.client!.subscribe(topic, { qos: 0 });
    };

    doSub();

    return new Observable<IMqttMessage>((subscriber) => {
      const sub = subject.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        if (this.client) {
          this.client.removeListener('message', handler);
          this.client.unsubscribe(topic);
        }
      };
    });
  }

  /** Publish to a topic (same API as ngx-mqtt unsafePublish) */
  unsafePublish(
    topic: string,
    message: string,
    options?: { qos?: 0 | 1 | 2; retain?: boolean }
  ): void {
    if (!this.client) return;
    const opts = { qos: (options?.qos ?? 0) as 0, retain: options?.retain ?? false };
    this.client.publish(topic, message, opts);
  }

  disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.state.next(0);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
