import { TestBed } from '@angular/core/testing';
import { GlobalErrorHandler } from './global-error-handler';
import { LoggingService } from './services/logging.service';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let loggingService: jasmine.SpyObj<LoggingService>;

  beforeEach(() => {
    const loggingServiceSpy = jasmine.createSpyObj('LoggingService', ['logEvent']);

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: LoggingService, useValue: loggingServiceSpy }
      ]
    });

    handler = TestBed.inject(GlobalErrorHandler);
    loggingService = TestBed.inject(LoggingService) as jasmine.SpyObj<LoggingService>;
  });

  it('should be created', () => {
    expect(handler).toBeTruthy();
  });

  it('should call loggingService.logEvent with GLOBAL_ERROR and the error message', () => {
    spyOn(console, 'error');

    handler.handleError(new Error('boom'));

    expect(loggingService.logEvent).toHaveBeenCalledWith(
      'GLOBAL_ERROR',
      jasmine.objectContaining({ message: 'boom' })
    );
  });
});
