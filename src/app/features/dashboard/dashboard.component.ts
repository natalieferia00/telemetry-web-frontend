import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TelemetryService } from '../../data/services/telemetry.service';
import { VehicleStatus } from '../../core/models/telemetry.model';
import { Subscription, interval, switchMap, startWith } from 'rxjs';

import { TableModule } from 'primeng/table';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { RealtimeTelemetryService } from '../../data/services/realtime-telemetry.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, TableModule, CardModule, TagModule],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) private mapContainer?: ElementRef<HTMLDivElement>;

  private readonly telemetryService = inject(TelemetryService);
  private readonly realtimeTelemetryService = inject(RealtimeTelemetryService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly platformId = inject(PLATFORM_ID);

  private telemetrySubscription?: Subscription;
  private realtimeUpdatesSubscription?: Subscription;
  private map?: import('leaflet').Map;
  private L?: typeof import('leaflet');
  private markers: import('leaflet').Marker[] = [];

  public vehicles: VehicleStatus[] = [];
  public loading = true;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.loading = false;
      return;
    }

    this.realtimeUpdatesSubscription = this.realtimeTelemetryService.vehicleUpdates$.subscribe((vehicle) => {
      console.info('[Dashboard] Evento en vivo recibido y aplicado al estado:', vehicle);

      const existingIndex = this.vehicles.findIndex((item) => item.vehicleId === vehicle.vehicleId);

      if (existingIndex >= 0) {
        this.vehicles[existingIndex] = vehicle;
      } else {
        this.vehicles = [vehicle, ...this.vehicles];
      }

      this.loading = false;
      this.updateMapMarkers(this.vehicles);
      this.cdr.markForCheck();
    });

    this.telemetrySubscription = interval(10000)
      .pipe(
        startWith(0),
        switchMap(() => this.telemetryService.getVehiclesStatus())
      )
      .subscribe({
        next: (data) => {
          this.vehicles = data;
          this.loading = false;
          this.updateMapMarkers(data);
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error en el flujo de telemetría:', err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      });

    this.realtimeTelemetryService.startConnection();
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.initializeMap();
  }

  private async initializeMap(): Promise<void> {
    this.L = await import('leaflet');

    if (!this.mapContainer?.nativeElement || !this.L) {
      return;
    }

    const { tileLayer, map } = this.L;

    this.map = map(this.mapContainer.nativeElement, {
      center: [0, 0],
      zoom: 2,
      scrollWheelZoom: true,
    });

    tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    if (this.vehicles.length) {
      this.updateMapMarkers(this.vehicles);
    }
  }

  private updateMapMarkers(data: VehicleStatus[]): void {
    if (!this.map || !this.L) {
      return;
    }

    this.markers.forEach((existing) => existing.remove());
    this.markers = [];

    const points: [number, number][] = [];

    data.forEach((vehicle) => {
      if (!Number.isFinite(vehicle.lastLat) || !Number.isFinite(vehicle.lastLng)) {
        return;
      }

      const icon = this.L!.divIcon({
        html: `
          <div class="vehicle-marker-icon">
            <span>${vehicle.vehicleId}</span>
          </div>
        `,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -38],
      });

      const marker = this.L!.marker([vehicle.lastLat, vehicle.lastLng], { icon });
      marker
        .bindPopup(`
          <div style="font-size: 0.95rem; line-height: 1.4; min-width: 180px;">
            <strong>ID:</strong> ${vehicle.vehicleId}<br />
            <strong>Estado:</strong> ${vehicle.status}
          </div>
        `)
        .addTo(this.map!);

      this.markers.push(marker);
      points.push([vehicle.lastLat, vehicle.lastLng]);
    });

    if (!points.length) {
      this.map.setView([0, 0], 2);
      return;
    }

    if (points.length === 1) {
      this.map.setView(points[0], 10);
    } else {
      this.map.fitBounds(this.L!.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
    }
  }

  public getSeverity(status: string): 'success' | 'secondary' | 'danger' | 'info' | undefined {
    if (!status) return 'info';

    const currentStatus = status.toLowerCase();
    if (currentStatus.includes('movimiento') || currentStatus === 'active') return 'success';
    if (currentStatus.includes('detenido') || currentStatus === 'stopped') return 'secondary';
    if (currentStatus.includes('mantenimiento') || currentStatus === 'maintenance') return 'danger';

    return 'info';
  }

  ngOnDestroy(): void {
    if (this.telemetrySubscription) {
      this.telemetrySubscription.unsubscribe();
    }

    if (this.realtimeUpdatesSubscription) {
      this.realtimeUpdatesSubscription.unsubscribe();
    }

    this.realtimeTelemetryService.stopConnection();

    this.markers.forEach((marker) => marker.remove());
    this.markers = [];

    if (this.map) {
      this.map.remove();
    }
  }
}
