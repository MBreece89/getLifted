import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Workout {
  name: string;
  bodyPart: string;
  style: string;
  sets?: number;
  reps?: number;
  duration?: string;
}

export interface WorkoutOptions {
  bodyParts: string[];
  styles: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiBaseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Retrieve a single random workout.
   * @param type Optional workout type (maps to backend 'style' parameter)
   * @param bodyPart Optional body part filter
   */
  getWorkout(type?: string, bodyPart?: string): Observable<Workout> {
    const params = this.buildParams(type, bodyPart);
    return this.http.get<Workout>(`${this.apiBaseUrl}/workout`, { params });
  }

  /**
   * Retrieve a short workout plan (up to 5 exercises).
   * @param type Optional workout type (maps to backend 'style' parameter)
   * @param bodyPart Optional body part filter
   */
  getPlan(type?: string, bodyPart?: string): Observable<Workout[]> {
    const params = this.buildParams(type, bodyPart);
    return this.http.get<Workout[]>(`${this.apiBaseUrl}/workout/plan`, { params });
  }

  /**
   * Retrieve available workout options (types/styles and body parts).
   */
  getOptions(): Observable<WorkoutOptions> {
    return this.http.get<WorkoutOptions>(`${this.apiBaseUrl}/workout/options`);
  }

  /**
   * Retrieve available commands and their descriptions.
   */
  getCommands(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiBaseUrl}/commands`);
  }

  /**
   * Post structured logs to the backend.
   */
  postLogs(logEvent: any): Observable<any> {
    return this.http.post(`${this.apiBaseUrl}/logs`, logEvent);
  }

  private buildParams(type?: string, bodyPart?: string): any {
    const params: any = {};
    if (type) {
      params['type'] = type; // Maps to backend 'style' parameter
    }
    if (bodyPart) {
      params['bodyPart'] = bodyPart;
    }
    return params;
  }
}
