import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  HttpTransportType,
  LogLevel,
} from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { VehicleStatus } from '../../core/models/telemetry.model';

interface SignalRActionResponse<TPayload = unknown> {
  type?: string;
  payload?: TPayload;
}

@Injectable({
  providedIn: 'root',
})
export class RealtimeTelemetryService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly vehicleUpdatesSubject = new Subject<VehicleStatus>();

  readonly vehicleUpdates$ = this.vehicleUpdatesSubject.asObservable();
  private hubConnection?: HubConnection;

  startConnection(): void {
    if (!isPlatformBrowser(this.platformId)) {
      console.info('[SignalR] No se inicializa la conexión porque no estamos en el navegador.');
      return;
    }

    if (this.hubConnection?.state === HubConnectionState.Connected) {
      console.info('[SignalR] La conexión ya está abierta.');
      return;
    }

    if (this.hubConnection?.state === HubConnectionState.Connecting) {
      console.info('[SignalR] La conexión ya está en proceso de apertura.');
      return;
    }

    console.info('[SignalR] Iniciando conexión WebSocket hacia /chathub...');

    this.hubConnection = new HubConnectionBuilder()
      .withUrl('/chathub', {
        withCredentials: true,
        transport: HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    this.hubConnection.on('ReceiveAction', (response: SignalRActionResponse<VehicleStatus>) => {
      console.info('[SignalR] Evento recibido:', response);

      if (response.type !== 'GPS_INGESTED' || !response.payload) {
        console.warn('[SignalR] Evento recibido pero no es GPS_INGESTED o no tiene payload:', response);
        return;
      }

      console.log('[SignalR] Actualizando vehículo en tiempo real:', response.payload);
      this.vehicleUpdatesSubject.next(response.payload);
    });

    this.hubConnection.onreconnecting((error) => {
      console.warn('[SignalR] Reconectando...', error);
    });

    this.hubConnection.onreconnected(() => {
      console.info('[SignalR] Reconexión establecida correctamente.');
    });

    this.hubConnection.onclose((error) => {
      console.warn('[SignalR] Conexión cerrada:', error);
    });

    this.hubConnection.start()
      .then(() => {
        console.info('[SignalR] Conexión abierta correctamente con el hub.');
      })
      .catch((error) => {
        console.error('[SignalR] Falló la conexión con el hub:', error);
      });
  }

  stopConnection(): void {
    if (!this.hubConnection) {
      return;
    }

    this.hubConnection.stop().catch((error) => {
      console.error('SignalR stop failed:', error);
    });

    this.hubConnection = undefined;
  }
}
