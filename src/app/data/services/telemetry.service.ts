import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs'; // 👈 Agregamos catchError y of
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
}