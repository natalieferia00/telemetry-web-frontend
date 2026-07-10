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

interface ActivityEvent {
  id: number;
  title: string;
  detail: string;
  timestamp: Date;
}

type DashboardStatusFilter = 'all' | 'active' | 'stopped' | 'maintenance';

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
  private liveClockSubscription?: Subscription;
  private map?: import('leaflet').Map;
  private L?: typeof import('leaflet');
  private markers: import('leaflet').Marker[] = [];
  private activitySequence = 0;

  public vehicles: VehicleStatus[] = [];
  public loading = true;
  public pendingDeleteVehicleId: string | null = null;
  public isDarkMode = true;
  public selectedVehicleId: string | null = null;
  public statusFilter: DashboardStatusFilter = 'all';
  public activityFeed: ActivityEvent[] = [];
  public liveClock = new Date();
  public lastSyncAt = new Date();

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.loading = false;
      return;
    }

    this.liveClockSubscription = interval(1000).subscribe(() => {
      this.liveClock = new Date();
      this.cdr.detectChanges();
    });

    this.realtimeUpdatesSubscription = this.realtimeTelemetryService.vehicleUpdates$.subscribe((vehicle) => {
      console.info('[Dashboard] Evento en vivo recibido y aplicado al estado:', vehicle);

      const isVehicleStatus = 'lastLat' in vehicle && 'lastLng' in vehicle;

      if (isVehicleStatus) {
        const existingIndex = this.vehicles.findIndex((item) => item.vehicleId === vehicle.vehicleId);

        if (existingIndex >= 0) {
          this.vehicles[existingIndex] = vehicle;
        } else {
          this.vehicles = [vehicle, ...this.vehicles];
        }

        this.addActivity('Vehículo actualizado', `${vehicle.vehicleId} envió una nueva posición.`);
      } else {
        this.vehicles = this.vehicles.filter((item) => item.vehicleId !== vehicle.vehicleId);
        this.addActivity('Vehículo eliminado', `${vehicle.vehicleId} fue eliminado del sistema.`);
      }

      this.loading = false;
      this.ensureSelection();
      this.updateMapMarkers(this.vehicles);
      this.cdr.detectChanges();
    });

    this.telemetrySubscription = interval(10000)
      .pipe(
        startWith(0),
        switchMap(() => this.telemetryService.getVehiclesStatus())
      )
      .subscribe({
        next: (data) => {
          this.applyTelemetryState(data);
          this.addActivity('Sincronización', 'Se recargó la telemetría desde el backend.');
        },
        error: (err) => {
          console.error('Error en el flujo de telemetría:', err);
          this.loading = false;
          this.cdr.detectChanges();
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

  public get totalVehicles(): number {
    return this.vehicles.length;
  }

  public get activeVehicles(): number {
    return this.vehicles.filter((vehicle) => this.getStatusGroup(vehicle.status) === 'active').length;
  }

  public get stoppedVehicles(): number {
    return this.vehicles.filter((vehicle) => this.getStatusGroup(vehicle.status) === 'stopped').length;
  }

  public get maintenanceVehicles(): number {
    return this.vehicles.filter((vehicle) => this.getStatusGroup(vehicle.status) === 'maintenance').length;
  }

  public get validCoordinatesVehicles(): number {
    return this.vehicles.filter((vehicle) => Number.isFinite(vehicle.lastLat) && Number.isFinite(vehicle.lastLng)).length;
  }

  public get locationCoveragePercentage(): number {
    if (!this.totalVehicles) {
      return 0;
    }

    return Math.round((this.validCoordinatesVehicles / this.totalVehicles) * 100);
  }

  public get statusBreakdown(): Array<{ label: string; value: number; percentage: number; color: string }> {
    const total = this.totalVehicles || 1;

    return [
      {
        label: 'Activos',
        value: this.activeVehicles,
        percentage: Math.round((this.activeVehicles / total) * 100),
        color: '#22c55e',
      },
      {
        label: 'Detenidos',
        value: this.stoppedVehicles,
        percentage: Math.round((this.stoppedVehicles / total) * 100),
        color: '#38bdf8',
      },
      {
        label: 'Mantenimiento',
        value: this.maintenanceVehicles,
        percentage: Math.round((this.maintenanceVehicles / total) * 100),
        color: '#f97316',
      },
    ];
  }

  public get filteredVehicles(): VehicleStatus[] {
    if (this.statusFilter === 'all') {
      return this.vehicles;
    }

    return this.vehicles.filter((vehicle) => this.getStatusGroup(vehicle.status) === this.statusFilter);
  }

  public get alertsSummary(): Array<{ title: string; description: string; tone: 'neutral' | 'warning' | 'danger' }> {
    const alerts: Array<{ title: string; description: string; tone: 'neutral' | 'warning' | 'danger' }> = [];

    if (!this.vehicles.length) {
      alerts.push({ title: 'Sin datos', description: 'No hay vehículos disponibles para monitorear.', tone: 'neutral' });
    }

    const invalidCoordinates = this.totalVehicles - this.validCoordinatesVehicles;
    if (invalidCoordinates > 0) {
      alerts.push({
        title: 'Coordenadas incompletas',
        description: `${invalidCoordinates} vehículo(s) no tienen ubicación válida.`,
        tone: 'warning',
      });
    }

    if (this.maintenanceVehicles > 0) {
      alerts.push({
        title: 'Mantenimiento activo',
        description: `${this.maintenanceVehicles} vehículo(s) requieren atención.`,
        tone: 'danger',
      });
    }

    if (!alerts.length) {
      alerts.push({ title: 'Todo estable', description: 'El sistema está corriendo con estado normal.', tone: 'neutral' });
    }

    return alerts;
  }

  public get selectedVehicle(): VehicleStatus | undefined {
    return this.vehicles.find((vehicle) => vehicle.vehicleId === this.selectedVehicleId) ?? this.vehicles[0];
  }

  public toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.cdr.detectChanges();
  }

  public selectVehicle(vehicleId: string): void {
    this.selectedVehicleId = vehicleId;
    this.cdr.detectChanges();
  }

  public refreshTelemetry(): void {
    this.loading = true;
    this.telemetryService.getVehiclesStatus().subscribe({
      next: (data) => {
        this.applyTelemetryState(data);
        this.addActivity('Refresco manual', 'Se ejecutó una actualización manual del dashboard.');
      },
      error: (err) => {
        console.error('Error al refrescar telemetría:', err);
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  public setStatusFilter(filter: DashboardStatusFilter): void {
    this.statusFilter = filter;
    this.cdr.detectChanges();
  }

  public beginDeleteVehicle(vehicleId: string): void {
    this.pendingDeleteVehicleId = vehicleId;
    this.cdr.detectChanges();
  }

  public cancelDeleteVehicle(): void {
    this.pendingDeleteVehicleId = null;
    this.cdr.detectChanges();
  }

  public confirmDeleteVehicle(vehicleId: string): void {
    this.pendingDeleteVehicleId = null;
    this.cdr.detectChanges();

    this.telemetryService.deleteVehicle(vehicleId).subscribe((deleted) => {
      if (!deleted) {
        return;
      }

      this.vehicles = this.vehicles.filter((vehicle) => vehicle.vehicleId !== vehicleId);
      this.ensureSelection();
      this.updateMapMarkers(this.vehicles);
      this.cdr.detectChanges();
    });
  }

  public getSeverity(status: string): 'success' | 'secondary' | 'danger' | 'info' | undefined {
    if (!status) return 'info';

    const currentStatus = status.toLowerCase();
    if (currentStatus.includes('movimiento') || currentStatus === 'active') return 'success';
    if (currentStatus.includes('detenido') || currentStatus === 'stopped') return 'secondary';
    if (currentStatus.includes('mantenimiento') || currentStatus === 'maintenance') return 'danger';

    return 'info';
  }

  public getCoverageRingGradient(): string {
    const percentage = this.locationCoveragePercentage;
    return `conic-gradient(#0ea5e9 ${percentage}%, rgba(148, 163, 184, 0.22) ${percentage}% 100%)`;
  }

  private applyTelemetryState(data: VehicleStatus[]): void {
    this.vehicles = data;
    this.loading = false;
    this.lastSyncAt = new Date();
    this.ensureSelection();
    this.updateMapMarkers(data);
    this.cdr.detectChanges();
  }

  private addActivity(title: string, detail: string): void {
    this.activityFeed = [
      {
        id: ++this.activitySequence,
        title,
        detail,
        timestamp: new Date(),
      },
      ...this.activityFeed,
    ].slice(0, 6);
  }

  private ensureSelection(): void {
    if (!this.vehicles.length) {
      this.selectedVehicleId = null;
      return;
    }

    const stillExists = this.vehicles.some((vehicle) => vehicle.vehicleId === this.selectedVehicleId);
    if (!stillExists) {
      this.selectedVehicleId = this.vehicles[0].vehicleId;
    }
  }

  private getStatusGroup(status: string): 'active' | 'stopped' | 'maintenance' | 'unknown' {
    const normalized = status?.toLowerCase().trim() ?? '';

    if (normalized.includes('movimiento') || normalized === 'active') return 'active';
    if (normalized.includes('detenido') || normalized === 'stopped') return 'stopped';
    if (normalized.includes('mantenimiento') || normalized === 'maintenance') return 'maintenance';

    return 'unknown';
  }

  ngOnDestroy(): void {
    if (this.telemetrySubscription) {
      this.telemetrySubscription.unsubscribe();
    }

    if (this.realtimeUpdatesSubscription) {
      this.realtimeUpdatesSubscription.unsubscribe();
    }

    if (this.liveClockSubscription) {
      this.liveClockSubscription.unsubscribe();
    }

    this.realtimeTelemetryService.stopConnection();

    this.markers.forEach((marker) => marker.remove());
    this.markers = [];

    if (this.map) {
      this.map.remove();
    }
  }
}
