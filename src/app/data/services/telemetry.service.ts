import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { VehicleStatus } from '../../core/models/telemetry.model';

@Injectable({
  providedIn: 'root'
})
export class TelemetryService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/vehicles';

  getVehiclesStatus(): Observable<VehicleStatus[]> {
    return this.http.get<VehicleStatus[]>(this.apiUrl).pipe(
      catchError(error => {
        console.error('Error al obtener telemetría:', error);
        return of([]);
      })
    );
  }

  deleteVehicle(vehicleId: string): Observable<boolean> {
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(vehicleId)}`).pipe(
      map(() => true),
      catchError((error) => {
        console.error(`Error al eliminar vehículo ${vehicleId}:`, error);
        return of(false);
      })
    );
  }
}