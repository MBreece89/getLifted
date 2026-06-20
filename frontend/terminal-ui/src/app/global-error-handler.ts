import { ErrorHandler, Injectable, inject } from '@angular/core';
import { LoggingService } from './services/logging.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private loggingService = inject(LoggingService);

  handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.loggingService.logEvent('GLOBAL_ERROR', {
      message: err.message,
      stack: err.stack ?? ''
    });
    console.error('[GlobalErrorHandler]', err);
  }
}
