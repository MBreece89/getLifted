import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';

export type LogEventType = 'APP_INIT' | 'COMMAND_EXECUTED' | 'CLEAR_TERMINAL' | 'CLIPBOARD_COPY' | 'HISTORY_NAV' | 'GLOBAL_ERROR';

export interface LogEvent {
  timestamp: string;
  command: string;
  params: any;
  response: any;
  status: number;
  latency: number;
}

const SENSITIVE_KEYS = ['password', 'token', 'apikey', 'secret', 'auth'];

@Injectable({
  providedIn: 'root'
})
export class LoggingService {
  private apiBaseUrl = environment.apiUrl;
  private isDevelopment = !this.isProduction();

  constructor(private http: HttpClient) {}

  /**
   * Log a terminal command execution.
   * Sends to /logs endpoint if available, otherwise logs to console.
   * @param commandText The command that was executed
   * @param params The parsed parameters
   * @param response The response from the backend
   * @param status HTTP status code
   * @param latency Time taken in milliseconds
   */
  logCommand(
    commandText: string,
    params: any,
    response: any,
    status: number,
    latency: number
  ): void {
    const logEvent: LogEvent = {
      timestamp: new Date().toISOString(),
      command: commandText,
      params: this.sanitizeParams(params),
      response: this.sanitizeResponse(response),
      status,
      latency
    };

    // Try to send to backend /logs endpoint
    this.http
      .post(`${this.apiBaseUrl}/logs`, logEvent)
      .pipe(
        catchError((err) => {
          // If /logs endpoint is not available, log to console instead
          if (this.isDevelopment) {
            console.log('[TERMINAL LOG]', logEvent);
          }
          return of(null);
        })
      )
      .subscribe();
  }

  /**
   * Sanitize parameters to avoid logging secrets or PII.
   */
  private sanitizeParams(params: any): any {
    const sanitized = { ...params };
    for (const key of Object.keys(sanitized)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  /**
   * Sanitize response to avoid logging sensitive data.
   */
  private sanitizeResponse(response: any): any {
    if (typeof response !== 'object' || response === null) {
      return response;
    }
    const sanitized = JSON.parse(JSON.stringify(response));
    const redact = (obj: any) => {
      if (typeof obj !== 'object' || obj === null) return;
      for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
          obj[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          redact(value);
        }
      }
    };

    redact(sanitized);
    return sanitized;
  }

  logEvent(eventType: LogEventType, payload: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      payload: this.sanitizeResponse(payload)
    };
    this.http.post(`${this.apiBaseUrl}/logs`, logEntry)
      .pipe(catchError(() => { if (this.isDevelopment) console.log('[LOG EVENT]', logEntry); return of(null); }))
      .subscribe();
  }

  /**
   * Check if running in production.
   */
  private isProduction(): boolean {
    return !!(window && !(window as any).ngDevMode);
  }
}
